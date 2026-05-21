export type BudgetRange =
  | "Under $1k / month"
  | "$1k–$5k / month"
  | "$5k–$20k / month"
  | "$20k+ / month"
  | "Not sure yet";

export const BUDGET_RANGES: BudgetRange[] = [
  "Under $1k / month",
  "$1k–$5k / month",
  "$5k–$20k / month",
  "$20k+ / month",
  "Not sure yet",
];

export interface WaitlistEntry {
  id: string;
  createdAt: string;
  email: string;
  companyName: string;
  role: string;
  budgetRange: BudgetRange;
  creatorTypes: string;
  note?: string;
}

const STORAGE_KEY = "worthyiq.waitlist.v1";

const isBrowser = (): boolean => typeof window !== "undefined";

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function listWaitlistEntries(): WaitlistEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as WaitlistEntry[];
  } catch {
    return [];
  }
}

export function saveWaitlistEntry(
  entry: Omit<WaitlistEntry, "id" | "createdAt">
): WaitlistEntry {
  const row: WaitlistEntry = {
    ...entry,
    id: newId(),
    createdAt: new Date().toISOString(),
  };
  if (!isBrowser()) return row;
  try {
    const rows = listWaitlistEntries();
    rows.push(row);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // quota / disabled
  }
  return row;
}

export function exportWaitlistAsJSON(): string {
  return JSON.stringify(listWaitlistEntries(), null, 2);
}
