export const FREE_EVALUATION_LIMIT = 20;

const USAGE_KEY_V2 = "worthyiq.trial.usage.v2";
const USAGE_KEY_V1 = "worthyiq.trial.usage.v1";

interface DailyUsage {
  date: string; // YYYY-MM-DD (local)
  used: number;
}

const isBrowser = (): boolean => typeof window !== "undefined";

function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}

function readDailyUsage(): DailyUsage {
  const today = todayLocal();
  if (!isBrowser()) return { date: today, used: 0 };

  try {
    const rawV2 = window.localStorage.getItem(USAGE_KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as DailyUsage;
      if (parsed.date === today && typeof parsed.used === "number") {
        return { date: today, used: Math.max(0, parsed.used) };
      }
      return { date: today, used: 0 };
    }

    const rawV1 = window.localStorage.getItem(USAGE_KEY_V1);
    const usedV1 = rawV1 ? Math.max(0, parseInt(rawV1, 10) || 0) : 0;
    return { date: today, used: usedV1 };
  } catch {
    return { date: today, used: 0 };
  }
}

function writeDailyUsage(usage: DailyUsage): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(USAGE_KEY_V2, JSON.stringify(usage));
  } catch {
    // quota / disabled
  }
}

export function getTrialUsage(): { used: number; limit: number } {
  const { used } = readDailyUsage();
  return { used, limit: FREE_EVALUATION_LIMIT };
}

export function canRunFreeEvaluation(): boolean {
  const { used, limit } = getTrialUsage();
  return used < limit;
}

export function incrementTrialUsage(): void {
  if (!isBrowser()) return;
  const today = todayLocal();
  const { used } = readDailyUsage();
  writeDailyUsage({ date: today, used: used + 1 });
}
