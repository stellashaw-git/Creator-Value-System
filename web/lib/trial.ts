export const FREE_EVALUATION_LIMIT = 5;

const USAGE_KEY = "worthyiq.trial.usage.v1";

const isBrowser = (): boolean => typeof window !== "undefined";

export function getTrialUsage(): { used: number; limit: number } {
  if (!isBrowser()) return { used: 0, limit: FREE_EVALUATION_LIMIT };
  try {
    const raw = window.localStorage.getItem(USAGE_KEY);
    const used = raw ? Math.max(0, parseInt(raw, 10) || 0) : 0;
    return { used, limit: FREE_EVALUATION_LIMIT };
  } catch {
    return { used: 0, limit: FREE_EVALUATION_LIMIT };
  }
}

export function canRunFreeEvaluation(): boolean {
  const { used, limit } = getTrialUsage();
  return used < limit;
}

export function incrementTrialUsage(): void {
  if (!isBrowser()) return;
  const { used } = getTrialUsage();
  try {
    window.localStorage.setItem(USAGE_KEY, String(used + 1));
  } catch {
    // storage full / disabled
  }
}
