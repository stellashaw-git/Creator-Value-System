import {
  FOUNDING_EVALUATION_LIMIT,
  isEarlyAccessGranted,
} from "@/lib/early-access";

export const FREE_EVALUATION_LIMIT = 10;

const STORAGE_KEY = "worthyiq.trial.v4";

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

interface DailyTrialState {
  date: string;
  count: number;
}

const isBrowser = (): boolean => typeof window !== "undefined";

function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readState(): DailyTrialState {
  const today = localDateKey();
  if (!isBrowser()) {
    return { date: today, count: 0 };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { date: today, count: 0 };
    }
    const parsed = JSON.parse(raw) as Partial<DailyTrialState>;
    if (typeof parsed.date !== "string" || parsed.date !== today) {
      return { date: today, count: 0 };
    }
    return {
      date: today,
      count: Math.max(0, Number(parsed.count) || 0),
    };
  } catch {
    return { date: today, count: 0 };
  }
}

function writeState(state: DailyTrialState): void {
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
  const { count } = readState();
  const limit = getEffectiveEvaluationLimit();
  const used = Math.min(count, limit);
  const reached = isDevEvaluationLimitBypassed() ? false : used >= limit;
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

/** Count only after a real evaluation completes successfully — not on restore/resume. */
export function incrementTrialUsage(): void {
  if (!isBrowser()) return;
  const today = localDateKey();
  const state = readState();
  const count = (state.date === today ? state.count : 0) + 1;
  writeState({ date: today, count });
}
