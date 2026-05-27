import type { Platform } from "@/lib/types";

export type IntakeConfidence = "low" | "medium" | "high";

/** Screenshot types that improve confidence when public fetch is unavailable. */
export type IntakeNudge = "profile" | "recent_post" | "comments" | "analytics";

export interface ParsedCreatorUrl {
  platform: Platform;
  handle: string;
  normalizedUrl: string;
}

export interface CreatorIntakeProfile {
  platform: Platform;
  handle: string;
  displayName?: string;
  profileUrl: string;
  source: "url_intake";
  fetchedAt: string;
}

export interface IntakePreviewSuccess {
  platform: Platform;
  handle: string;
  profile: null;
  confidence: IntakeConfidence;
  nudge: IntakeNudge[];
}

export interface IntakePreviewError {
  error: string;
}

export type IntakePreviewResponse = IntakePreviewSuccess | IntakePreviewError;

export function isIntakePreviewError(
  r: IntakePreviewResponse
): r is IntakePreviewError {
  return "error" in r;
}
