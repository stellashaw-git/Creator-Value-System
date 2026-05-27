export const FOUNDING_EVALUATION_LIMIT = 100;

export type EarlyAccessRole =
  | "Founder"
  | "Brand Owner"
  | "Marketing"
  | "Agency"
  | "Creator Manager"
  | "Other";

export const EARLY_ACCESS_ROLES: EarlyAccessRole[] = [
  "Founder",
  "Brand Owner",
  "Marketing",
  "Agency",
  "Creator Manager",
  "Other",
];

export interface EarlyAccessSubmission {
  email: string;
  companyName?: string;
  role?: EarlyAccessRole | "";
  challenge?: string;
  submittedAt: string;
}

interface EarlyAccessState {
  early_access_submitted: boolean;
  prompt_dismissed: boolean;
  submission?: EarlyAccessSubmission;
}

const STORAGE_KEY = "worthyiq.early-access.v1";

const isBrowser = (): boolean => typeof window !== "undefined";

function readState(): EarlyAccessState {
  if (!isBrowser()) {
    return { early_access_submitted: false, prompt_dismissed: false };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { early_access_submitted: false, prompt_dismissed: false };
    }
    const parsed = JSON.parse(raw) as Partial<EarlyAccessState>;
    return {
      early_access_submitted: Boolean(parsed.early_access_submitted),
      prompt_dismissed: Boolean(parsed.prompt_dismissed),
      submission:
        parsed.submission && typeof parsed.submission === "object"
          ? (parsed.submission as EarlyAccessSubmission)
          : undefined,
    };
  } catch {
    return { early_access_submitted: false, prompt_dismissed: false };
  }
}

function writeState(state: EarlyAccessState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota / disabled
  }
}

export function isEarlyAccessGranted(): boolean {
  return readState().early_access_submitted;
}

export function dismissEarlyAccessPrompt(): void {
  const state = readState();
  writeState({ ...state, prompt_dismissed: true });
}

export function shouldShowEarlyAccessPrompt(): boolean {
  const state = readState();
  return !state.early_access_submitted && !state.prompt_dismissed;
}

export function saveEarlyAccessSubmission(
  submission: Omit<EarlyAccessSubmission, "submittedAt">
): EarlyAccessSubmission {
  const row: EarlyAccessSubmission = {
    ...submission,
    submittedAt: new Date().toISOString(),
  };
  writeState({
    early_access_submitted: true,
    prompt_dismissed: false,
    submission: row,
  });
  return row;
}

export async function submitEarlyAccess(
  submission: Omit<EarlyAccessSubmission, "submittedAt">
): Promise<{ ok: boolean; saved: EarlyAccessSubmission }> {
  const saved = saveEarlyAccessSubmission(submission);
  try {
    await fetch("/api/early-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saved),
    });
  } catch {
    // local save already succeeded
  }
  return { ok: true, saved };
}
