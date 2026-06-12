import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  FREE_EVALUATION_LIMIT,
  canRunFreeEvaluation,
  getTrialUsage,
  incrementTrialUsage,
} from "./trial";

function installBrowserMocks(): void {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("localStorage", storage);
}

describe("trial — daily evaluation limit", () => {
  beforeEach(() => {
    installBrowserMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T12:00:00"));
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts with full daily allowance", () => {
    expect(FREE_EVALUATION_LIMIT).toBe(10);
    expect(canRunFreeEvaluation()).toBe(true);
    expect(getTrialUsage().remaining).toBe(10);
  });

  it("increments only on explicit increment call", () => {
    incrementTrialUsage();
    incrementTrialUsage();
    const usage = getTrialUsage();
    expect(usage.used).toBe(2);
    expect(usage.remaining).toBe(8);
    expect(canRunFreeEvaluation()).toBe(true);
  });

  it("resets count when local date changes", () => {
    incrementTrialUsage();
    incrementTrialUsage();
    expect(getTrialUsage().used).toBe(2);

    vi.setSystemTime(new Date("2026-06-13T08:00:00"));
    expect(getTrialUsage().used).toBe(0);
    expect(getTrialUsage().remaining).toBe(10);
    expect(canRunFreeEvaluation()).toBe(true);
  });

  it("blocks after daily limit is reached", () => {
    for (let i = 0; i < FREE_EVALUATION_LIMIT; i++) {
      incrementTrialUsage();
    }
    expect(getTrialUsage().free_limit_reached).toBe(true);
    expect(canRunFreeEvaluation()).toBe(false);
  });
});
