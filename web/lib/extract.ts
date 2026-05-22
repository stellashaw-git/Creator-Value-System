/**
 * Screenshot extraction — types + mock data for the no-API-key path.
 *
 * Numbers are normalized: "12.5K" → 12500, "1.2M" → 1200000.
 * engagement_rate and growth_30d are PERCENTAGES (e.g. 4.6, not 0.046).
 */

import {
  normalizeDetectedPlatform,
  normalizePlatformConfidence,
  type PlatformConfidence,
} from "./platform-detect";
import type { Platform } from "./types";

export type ConfidenceLevel = "high" | "medium" | "low";
export type { PlatformConfidence };

export type ScreenshotLabel =
  | "profile"
  | "post"
  | "comments"
  | "analytics"
  | "other";

export const SCREENSHOT_LABEL_OPTIONS: {
  id: ScreenshotLabel;
  label: string;
}[] = [
  { id: "profile", label: "Profile" },
  { id: "post", label: "Recent Post" },
  { id: "comments", label: "Comments" },
  { id: "analytics", label: "Analytics" },
  { id: "other", label: "Other" },
];

export const DEFAULT_LABEL_SEQUENCE: ScreenshotLabel[] = [
  "profile",
  "post",
  "comments",
  "analytics",
  "other",
];

export interface ExtractionMeta {
  labels: ScreenshotLabel[];
  detectedPlatform: Platform | null;
  platformConfidence: PlatformConfidence;
  platformOverride: Platform | null;
  /** Auto-suggested types by upload order (before user edits). */
  screenshotTypesDetected: string[];
}

export interface ExtractedSignals {
  creator_name: string | null;
  /** Canonical platform (from detected_platform or legacy platform field). */
  platform: string | null;
  detected_platform: string | null;
  platform_confidence: PlatformConfidence;
  platform_detection_notes: string;
  bio: string | null;
  niche: string | null;
  followers: number | null;
  following: number | null;
  subscribers: number | null;
  average_views: number | null;
  /** Legacy — synced from likes_count when present */
  likes: number | null;
  comments_count: number | null;
  shares: number | null;
  likes_count: number | null;
  reposts_count: number | null;
  saves_count: number | null;
  views_count: number | null;
  engagement_rate: number | null;
  growth_30d: number | null;
  sample_comments: string[];
  purchase_intent_comments: string[];
  curiosity_comments: string[];
  generic_comments: string[];
  visible_post_signals: string[];
  extraction_notes: string[];
  confidence: Partial<Record<string, ConfidenceLevel>>;
  missing_fields: string[];
  notes: string;
}

export type ExtractionMode = "openai" | "mock" | "mock_fallback";

export interface ExtractionResponse {
  extraction: ExtractedSignals;
  mode: ExtractionMode;
  warning?: string;
  images_received?: number;
}

export function labelDisplayName(id: ScreenshotLabel): string {
  return SCREENSHOT_LABEL_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

export const EMPTY_EXTRACTION: ExtractedSignals = {
  creator_name: null,
  platform: null,
  detected_platform: null,
  platform_confidence: "medium",
  platform_detection_notes: "",
  bio: null,
  niche: null,
  followers: null,
  following: null,
  subscribers: null,
  average_views: null,
  likes: null,
  comments_count: null,
  shares: null,
  likes_count: null,
  reposts_count: null,
  saves_count: null,
  views_count: null,
  engagement_rate: null,
  growth_30d: null,
  sample_comments: [],
  purchase_intent_comments: [],
  curiosity_comments: [],
  generic_comments: [],
  visible_post_signals: [],
  extraction_notes: [],
  confidence: {},
  missing_fields: [],
  notes: "",
};

export const MOCK_EXTRACTION: ExtractedSignals = {
  creator_name: "Maya Ortega",
  platform: "Instagram",
  detected_platform: "Instagram",
  platform_confidence: "high",
  platform_detection_notes: "Instagram profile grid and heart/comment icon row visible.",
  bio: "fitness coach · supplements + form check",
  niche: "Fitness",
  followers: 82400,
  following: 1240,
  subscribers: null,
  average_views: 24500,
  likes: 3850,
  comments_count: 142,
  shares: 210,
  likes_count: 3850,
  reposts_count: 48,
  saves_count: 520,
  views_count: 24500,
  engagement_rate: 4.6,
  growth_30d: 11,
  sample_comments: [
    "where did you get this?",
    "link pls 🙏",
    "price?",
    "code please",
    "is this on amazon?",
    "which one do you recommend?",
    "love this vibe",
    "🔥🔥🔥",
    "stunning",
    "size?",
  ],
  purchase_intent_comments: [
    "where did you get this?",
    "link pls 🙏",
    "price?",
    "code please",
    "is this on amazon?",
    "size?",
  ],
  curiosity_comments: ["which one do you recommend?", "what brand?"],
  generic_comments: ["love this vibe", "🔥🔥🔥", "stunning", "yes!"],
  visible_post_signals: [
    "Profile: 82.4K followers · 1.2K following",
    "Most recent post: 24.5K views · 3,850 likes · 142 comments",
    "Bio mentions fitness coaching + supplements affiliate",
  ],
  confidence: {
    creator_name: "high",
    platform: "high",
    followers: "high",
    average_views: "medium",
    comments: "medium",
    engagement_rate: "medium",
    growth_30d: "low",
    niche: "high",
  },
  extraction_notes: [],
  missing_fields: ["growth_30d (estimated)", "subscribers"],
  notes:
    "Demo mock — no OPENAI_API_KEY set. Set the key in web/.env.local for live vision extraction.",
};

function coerceCount(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/** Normalize vision output; map _count fields to legacy likes/shares/views. */
export function normalizeExtractedSignals(
  parsed: Partial<ExtractedSignals>,
  platformOverride?: Platform | null
): ExtractedSignals {
  const likes_count = coerceCount(parsed.likes_count ?? parsed.likes);
  const comments_count = coerceCount(parsed.comments_count);
  const reposts_count = coerceCount(parsed.reposts_count);
  const shares_count = coerceCount(parsed.shares);
  const saves_count = coerceCount(parsed.saves_count);
  const views_count = coerceCount(parsed.views_count ?? parsed.average_views);

  const detectedRaw =
    typeof parsed.detected_platform === "string"
      ? parsed.detected_platform
      : typeof parsed.platform === "string"
        ? parsed.platform
        : null;
  const detected = normalizeDetectedPlatform(detectedRaw);
  const platform_confidence = normalizePlatformConfidence(parsed.platform_confidence);
  const platform_detection_notes =
    typeof parsed.platform_detection_notes === "string"
      ? parsed.platform_detection_notes.trim()
      : "";

  const finalPlatform = platformOverride ?? detected;

  let followers = coerceCount(parsed.followers);
  const subscribers = coerceCount(parsed.subscribers);
  if (!followers && subscribers && finalPlatform === "YouTube") {
    followers = subscribers;
  }

  const base: ExtractedSignals = {
    ...EMPTY_EXTRACTION,
    ...parsed,
    creator_name:
      typeof parsed.creator_name === "string" ? parsed.creator_name.trim() || null : null,
    detected_platform: detected,
    platform_confidence,
    platform_detection_notes,
    platform: finalPlatform,
    followers,
    following: coerceCount(parsed.following),
    subscribers,
    average_views: views_count ?? coerceCount(parsed.average_views),
    likes: likes_count,
    likes_count,
    comments_count,
    shares: shares_count,
    reposts_count,
    saves_count,
    views_count,
    engagement_rate:
      typeof parsed.engagement_rate === "number" && Number.isFinite(parsed.engagement_rate)
        ? parsed.engagement_rate
        : null,
    growth_30d:
      typeof parsed.growth_30d === "number" && Number.isFinite(parsed.growth_30d)
        ? parsed.growth_30d
        : null,
    sample_comments: Array.isArray(parsed.sample_comments) ? parsed.sample_comments : [],
    purchase_intent_comments: Array.isArray(parsed.purchase_intent_comments)
      ? parsed.purchase_intent_comments
      : [],
    curiosity_comments: Array.isArray(parsed.curiosity_comments)
      ? parsed.curiosity_comments
      : [],
    generic_comments: Array.isArray(parsed.generic_comments) ? parsed.generic_comments : [],
    visible_post_signals: Array.isArray(parsed.visible_post_signals)
      ? parsed.visible_post_signals
      : [],
    extraction_notes: Array.isArray(parsed.extraction_notes)
      ? parsed.extraction_notes
      : [],
    confidence:
      parsed.confidence && typeof parsed.confidence === "object" ? parsed.confidence : {},
    missing_fields: Array.isArray(parsed.missing_fields) ? parsed.missing_fields : [],
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
  };

  return base;
}
