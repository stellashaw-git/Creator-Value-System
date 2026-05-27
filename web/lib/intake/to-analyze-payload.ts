import type { AnalyzeInput, Platform } from "@/lib/types";
import type { CreatorIntakeProfile } from "./types";

/**
 * Maps URL intake identity → analyze form hints only.
 * Phase 1: no metrics; screenshot extraction remains source of truth for numbers.
 */
export function intakeProfileToAnalyzeHints(
  profile: CreatorIntakeProfile
): Partial<AnalyzeInput> {
  const handle = profile.handle.replace(/^@/, "");
  return {
    name: handle,
    creatorHandle: handle,
    platform: profile.platform as Platform,
    detectedPlatform: profile.platform,
    platformConfidence: "low",
  };
}

/** Build a mock profile for tests / preview scaffolding (no fetch). */
export function mockIntakeProfile(
  platform: Platform,
  handle: string,
  profileUrl: string
): CreatorIntakeProfile {
  return {
    platform,
    handle,
    profileUrl,
    source: "url_intake",
    fetchedAt: new Date().toISOString(),
  };
}
