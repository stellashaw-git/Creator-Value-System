import type { Platform } from "./types";

export type PlatformConfidence = "high" | "medium" | "low";

const CANONICAL_PLATFORMS: Platform[] = [
  "Instagram",
  "TikTok",
  "YouTube",
  "X / Twitter",
  "Xiaohongshu / RED",
  "Other",
];

/** Map vision / alias strings to canonical Platform values. */
export function normalizeDetectedPlatform(raw: string | null | undefined): Platform | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("instagram") || s === "ig") return "Instagram";
  if (s.includes("tiktok") || s === "tt") return "TikTok";
  if (s.includes("youtube") || s === "yt") return "YouTube";
  if (
    s.includes("twitter") ||
    s.includes("x /") ||
    s === "x" ||
    s.includes(" 𝕏")
  ) {
    return "X / Twitter";
  }
  if (
    s.includes("xiaohongshu") ||
    s.includes("red") ||
    s.includes("xhs") ||
    s.includes("little red")
  ) {
    return "Xiaohongshu / RED";
  }
  if (s === "other" || s.includes("unknown")) return "Other";
  const exact = CANONICAL_PLATFORMS.find((p) => p.toLowerCase() === s);
  return exact ?? null;
}

export function normalizePlatformConfidence(
  raw: string | null | undefined
): PlatformConfidence {
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "medium";
}

export const PLATFORM_OVERRIDE_OPTIONS: Platform[] = CANONICAL_PLATFORMS;

export function platformConfidenceLabel(c: PlatformConfidence): string {
  if (c === "high") return "High confidence";
  if (c === "medium") return "Medium confidence";
  return "Low confidence";
}
