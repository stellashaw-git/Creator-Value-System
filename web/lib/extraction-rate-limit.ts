const STORAGE_KEY = "worthyiq.extraction-rate.v2";
const MAX_DAILY = 30;

interface RateState {
  dayWindow: string;
  dayCount: number;
}

const isBrowser = (): boolean => typeof window !== "undefined";

function dayKey(d: Date): string {
  return d.toLocaleDateString("en-CA");
}

function readState(): RateState {
  const now = new Date();
  const empty: RateState = {
    dayWindow: dayKey(now),
    dayCount: 0,
  };
  if (!isBrowser()) return empty;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<RateState>;
    return {
      dayWindow: typeof parsed.dayWindow === "string" ? parsed.dayWindow : empty.dayWindow,
      dayCount: Math.max(0, Number(parsed.dayCount) || 0),
    };
  } catch {
    return empty;
  }
}

function writeState(state: RateState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota / disabled
  }
}

function normalizedState(): RateState {
  const now = new Date();
  const state = readState();
  const currentDay = dayKey(now);
  return {
    dayWindow: currentDay,
    dayCount: state.dayWindow === currentDay ? state.dayCount : 0,
  };
}

export function canAttemptExtraction(): { ok: boolean; reason?: string } {
  const state = normalizedState();
  if (state.dayCount >= MAX_DAILY) {
    return {
      ok: false,
      reason: "Daily extraction limit reached (30/day). Try again tomorrow.",
    };
  }
  return { ok: true };
}

export function recordExtractionAttempt(): void {
  const now = new Date();
  const state = normalizedState();
  writeState({
    dayWindow: dayKey(now),
    dayCount: state.dayCount + 1,
  });
}
