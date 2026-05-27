import {
  FOUNDING_EVALUATION_LIMIT,
  isEarlyAccessGranted,
} from "@/lib/early-access";

export const FREE_EVALUATION_LIMIT = 5;

const STORAGE_KEY = "worthyiq.trial.v3";

let devBypassLogged = false;

/**
 * Developer-only bypass — requires NEXT_PUBLIC_DEV_BYPASS_EVALUATION_LIMIT=true.
 * In production builds, bypass applies only when that env is explicitly set.
 */
export function isDevEvaluationLimitBypassed(): boolean {
  return process.env.NEXT_PUBLIC_DEV_BYPASS_EVALUATION_LIMIT === "true";
}

function logDevBypassOnce(): void {
  if (devBypassLogged || !isBrowser()) return;
  if (
    process.env.NODE_ENV === "development" &&
    isDevEvaluationLimitBypassed()
  ) {
    console.log("[dev bypass] evaluation limit bypass enabled");
    devBypassLogged = true;
  }
}

interface TrialState {
  evaluation_count: number;
  free_limit_reached: boolean;
}

const isBrowser = (): boolean => typeof window !== "undefined";

function readState(): TrialState {
  if (!isBrowser()) {
    return { evaluation_count: 0, free_limit_reached: false };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { evaluation_count: 0, free_limit_reached: false };
    }
    const parsed = JSON.parse(raw) as Partial<TrialState>;
    const evaluation_count = Math.max(0, Number(parsed.evaluation_count) || 0);
    return {
      evaluation_count,
      free_limit_reached: Boolean(parsed.free_limit_reached),
    };
  } catch {
    return { evaluation_count: 0, free_limit_reached: false };
  }
}

function writeState(state: TrialState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota / disabled
  }
}

export function getEffectiveEvaluationLimit(): number {
  return isEarlyAccessGranted() ? FOUNDING_EVALUATION_LIMIT : FREE_EVALUATION_LIMIT;
}

export function getTrialUsage(): {
  used: number;
  limit: number;
  remaining: number;
  free_limit_reached: boolean;
  early_access_submitted: boolean;
} {
  const { evaluation_count, free_limit_reached } = readState();
  const limit = getEffectiveEvaluationLimit();
  const used = Math.min(evaluation_count, limit);
  const reached =
    isDevEvaluationLimitBypassed() ? false : free_limit_reached;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    free_limit_reached: reached,
    early_access_submitted: isEarlyAccessGranted(),
  };
}

export function canRunFreeEvaluation(): boolean {
  logDevBypassOnce();
  if (isDevEvaluationLimitBypassed()) return true;
  const { used, limit } = getTrialUsage();
  return used < limit;
}

/** Count only after extraction + recommendation completes successfully. */
export function incrementTrialUsage(): void {
  if (!isBrowser()) return;
  const state = readState();
  const limit = getEffectiveEvaluationLimit();
  const nextCount = state.evaluation_count + 1;
  writeState({
    evaluation_count: nextCount,
    free_limit_reached: nextCount >= FREE_EVALUATION_LIMIT && !isEarlyAccessGranted(),
  });
}
