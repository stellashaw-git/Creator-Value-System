/**
 * Screenshot extraction — types + mock data for the no-API-key path.
 *
 * Numbers are normalized: "12.5K" → 12500, "1.2M" → 1200000.
 * engagement_rate and growth_30d are PERCENTAGES (e.g. 4.6, not 0.046).
 */

import type {
  PerImageClassificationHints,
  ScreenshotTypeDetection,
} from "./screenshot-type-detect";
import type { RecentPostMetricRow } from "./recent-post-aggregate";
import { calculateRecentPostAverages } from "./recent-post-aggregate";
import {
  normalizeDetectedPlatform,
  normalizePlatformConfidence,
  type PlatformConfidence,
} from "./platform-detect";
import { filterCommentLines } from "./comment-line-filter";
import type { Platform } from "./types";

export type ConfidenceLevel = "high" | "medium" | "low";
export type { PlatformConfidence, ScreenshotTypeDetection, PerImageClassificationHints };
export type { RecentPostMetricRow } from "./recent-post-aggregate";

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
  /** Auto-detected types from heuristics + vision (before user override). */
  screenshotTypesDetected: string[];
  /** Per-image type detection details. */
  typeDetections?: ScreenshotTypeDetection[];
  /** Final types used for extraction routing (override ?? auto). */
  finalTypes?: ScreenshotLabel[];
  /** True when a profile screenshot lacked handle or follower count. */
  profileDetailsIncomplete?: boolean;
}

export interface ExtractedSignals {
  /** Backward-compatible primary identifier — mirrors creator_handle when present. */
  creator_name: string | null;
  /** Visible @handle / username — copied exactly from screenshot. */
  creator_handle: string | null;
  /** Visible display name when shown separately from handle. */
  display_name: string | null;
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
  recent_post_metrics: RecentPostMetricRow[];
  recent_post_count: number;
  avg_likes: number | null;
  avg_comments: number | null;
  avg_reposts: number | null;
  avg_shares: number | null;
  avg_saves: number | null;
  avg_views: number | null;
  /** Reels grid thumbnail view counts from profile screenshots */
  profile_grid_view_counts?: number[];
  sample_comments: string[];
  purchase_intent_comments: string[];
  curiosity_comments: string[];
  generic_comments: string[];
  trust_comments: string[];
  negative_comments: string[];
  comment_extraction_confidence: ConfidenceLevel | null;
  detected_comment_language: string | null;
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
  type_detections?: ScreenshotTypeDetection[];
  final_types?: ScreenshotLabel[];
  /** Vision per-image hints for rule classifier (survives cache refresh). */
  per_image_hints?: PerImageClassificationHints[];
  cached?: boolean;
  usage?: {
    model: string;
    images_sent: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    estimated_cost_usd?: number;
  };
}

export function labelDisplayName(id: ScreenshotLabel): string {
  return SCREENSHOT_LABEL_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

export const EMPTY_EXTRACTION: ExtractedSignals = {
  creator_name: null,
  creator_handle: null,
  display_name: null,
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
  recent_post_metrics: [],
  recent_post_count: 0,
  avg_likes: null,
  avg_comments: null,
  avg_reposts: null,
  avg_shares: null,
  avg_saves: null,
  avg_views: null,
  sample_comments: [],
  purchase_intent_comments: [],
  curiosity_comments: [],
  generic_comments: [],
  trust_comments: [],
  negative_comments: [],
  comment_extraction_confidence: null,
  detected_comment_language: null,
  visible_post_signals: [],
  extraction_notes: [],
  confidence: {},
  missing_fields: [],
  notes: "",
};

export const MOCK_EXTRACTION: ExtractedSignals = {
  creator_name: "stella_shaww123",
  creator_handle: "stella_shaww123",
  display_name: "Stella Shaw",
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
  recent_post_metrics: [
    {
      screenshot_id: "screenshot_2",
      likes_count: 3200,
      comments_count: 120,
      reposts_count: 40,
      shares_count: 180,
      saves_count: 480,
      views_count: 22000,
    },
    {
      screenshot_id: "screenshot_3",
      likes_count: 4500,
      comments_count: 164,
      reposts_count: 56,
      shares_count: 240,
      saves_count: 560,
      views_count: 27000,
    },
  ],
  recent_post_count: 2,
  avg_likes: 3850,
  avg_comments: 142,
  avg_reposts: 48,
  avg_shares: 210,
  avg_saves: 520,
  avg_views: 24500,
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
  trust_comments: ["which one do you recommend?", "what brand?"],
  negative_comments: [],
  comment_extraction_confidence: "medium",
  detected_comment_language: "en",
  visible_post_signals: [
    "Profile: 82.4K followers · 1.2K following",
    "Most recent post: 24.5K views · 3,850 likes · 142 comments",
    "Bio mentions fitness coaching + supplements affiliate",
  ],
  confidence: {
    creator_name: "high",
    creator_handle: "high",
    display_name: "medium",
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
  return coerceMetricCount(v);
}

/** Parse counts including K/M/B suffixes (e.g. 82.4K → 82400). */
export function coerceMetricCount(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v);
  const s = String(v).trim().replace(/,/g, "").replace(/\s+/g, "");
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s*([kmb])?$/i);
  if (!m) {
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  const suffix = (m[2] || "").toLowerCase();
  if (suffix === "k") n *= 1_000;
  else if (suffix === "m") n *= 1_000_000;
  else if (suffix === "b") n *= 1_000_000_000;
  return Math.round(n);
}

function normalizeConfidenceLevel(v: unknown): ConfidenceLevel | null {
  if (v === "high" || v === "medium" || v === "low") return v;
  return null;
}

function normalizeVisibleText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.replace(/^\s+|\s+$/g, "");
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCreatorIdentity(parsed: Partial<ExtractedSignals>): {
  creator_handle: string | null;
  display_name: string | null;
  creator_name: string | null;
} {
  const creator_handle =
    normalizeVisibleText(parsed.creator_handle) ??
    normalizeVisibleText(parsed.creator_name);
  const display_name = normalizeVisibleText(parsed.display_name);
  const creator_name = creator_handle ?? display_name ?? null;
  return { creator_handle, display_name, creator_name };
}

function normalizeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
}

function normalizeRecentPostMetrics(v: unknown): RecentPostMetricRow[] {
  if (!Array.isArray(v)) return [];
  const rows: RecentPostMetricRow[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    rows.push({
      screenshot_id:
        typeof row.screenshot_id === "string" && row.screenshot_id.trim()
          ? row.screenshot_id.trim()
          : `screenshot_${rows.length + 1}`,
      likes_count: coerceCount(row.likes_count ?? row.likes),
      comments_count: coerceCount(row.comments_count ?? row.comments),
      reposts_count: coerceCount(row.reposts_count ?? row.reposts),
      shares_count: coerceCount(row.shares_count ?? row.shares),
      saves_count: coerceCount(row.saves_count ?? row.saves),
      views_count: coerceCount(row.views_count ?? row.views ?? row.average_views),
    });
  }
  return rows;
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

  const identity = normalizeCreatorIdentity(parsed);

  const base: ExtractedSignals = {
    ...EMPTY_EXTRACTION,
    ...parsed,
    creator_name: identity.creator_name,
    creator_handle: identity.creator_handle,
    display_name: identity.display_name,
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
    sample_comments: filterCommentLines(normalizeStringArray(parsed.sample_comments)),
    purchase_intent_comments: filterCommentLines(
      normalizeStringArray(parsed.purchase_intent_comments)
    ),
    curiosity_comments: filterCommentLines(normalizeStringArray(parsed.curiosity_comments)),
    generic_comments: filterCommentLines(normalizeStringArray(parsed.generic_comments)),
    trust_comments: filterCommentLines(normalizeStringArray(parsed.trust_comments)),
    negative_comments: filterCommentLines(normalizeStringArray(parsed.negative_comments)),
    comment_extraction_confidence: normalizeConfidenceLevel(
      parsed.comment_extraction_confidence
    ),
    detected_comment_language:
      typeof parsed.detected_comment_language === "string" &&
      parsed.detected_comment_language.trim()
        ? parsed.detected_comment_language.trim()
        : null,
    visible_post_signals: normalizeStringArray(parsed.visible_post_signals),
    extraction_notes: Array.isArray(parsed.extraction_notes)
      ? parsed.extraction_notes
      : [],
    confidence:
      parsed.confidence && typeof parsed.confidence === "object" ? parsed.confidence : {},
    missing_fields: Array.isArray(parsed.missing_fields) ? parsed.missing_fields : [],
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
    recent_post_metrics: normalizeRecentPostMetrics(parsed.recent_post_metrics),
    recent_post_count:
      typeof parsed.recent_post_count === "number" && parsed.recent_post_count >= 0
        ? parsed.recent_post_count
        : 0,
    avg_likes: coerceCount(parsed.avg_likes),
    avg_comments: coerceCount(parsed.avg_comments),
    avg_reposts: coerceCount(parsed.avg_reposts),
    avg_shares: coerceCount(parsed.avg_shares),
    avg_saves: coerceCount(parsed.avg_saves),
    avg_views: coerceCount(parsed.avg_views),
    profile_grid_view_counts: Array.isArray(parsed.profile_grid_view_counts)
      ? parsed.profile_grid_view_counts
          .map((v) => coerceCount(v))
          .filter((n): n is number => n !== null)
      : [],
  };

  const mergeAvg = (
    fromRows: number | null,
    fromParsed: number | null,
    fromTopLevel: number | null
  ): number | null => fromRows ?? fromParsed ?? fromTopLevel;

  let metricRows = base.recent_post_metrics;
  const singlePostRow = metricRows.length === 1 && base.recent_post_count <= 1;
  if (singlePostRow) {
    const row = metricRows[0];
    metricRows = [
      {
        ...row,
        likes_count: row.likes_count ?? likes_count ?? base.likes,
        comments_count: row.comments_count ?? comments_count,
        reposts_count: row.reposts_count ?? reposts_count,
        shares_count: row.shares_count ?? shares_count,
        saves_count: row.saves_count ?? saves_count,
        views_count: row.views_count,
      },
    ];
  }

  const postAvgs = calculateRecentPostAverages(metricRows);
  const avg_likes = mergeAvg(
    postAvgs.avg_likes,
    base.recent_post_count > 1 ? null : base.avg_likes,
    singlePostRow ? likes_count ?? base.likes : null
  );
  const multiPost = base.recent_post_count > 1;
  const avg_comments = mergeAvg(
    postAvgs.avg_comments,
    multiPost ? null : base.avg_comments,
    singlePostRow ? comments_count : null
  );
  const avg_reposts = mergeAvg(
    postAvgs.avg_reposts,
    multiPost ? null : base.avg_reposts,
    singlePostRow ? reposts_count : null
  );
  const avg_shares = mergeAvg(
    postAvgs.avg_shares,
    multiPost ? null : base.avg_shares,
    singlePostRow ? shares_count : null
  );
  const avg_saves = mergeAvg(
    postAvgs.avg_saves,
    multiPost ? null : base.avg_saves,
    singlePostRow ? saves_count : null
  );
  const avg_views =
    base.avg_views ??
    postAvgs.avg_views ??
    (postAvgs.recent_post_count === 0 ? (views_count ?? base.average_views) : null);

  return {
    ...base,
    recent_post_metrics: postAvgs.recent_post_metrics,
    recent_post_count: postAvgs.recent_post_count,
    avg_likes,
    avg_comments,
    avg_reposts,
    avg_shares,
    avg_saves,
    avg_views,
    ...(postAvgs.recent_post_count > 0
      ? {
          likes: avg_likes ?? base.likes,
          likes_count: avg_likes ?? base.likes_count,
          comments_count: avg_comments ?? base.comments_count,
          reposts_count: avg_reposts ?? base.reposts_count,
          shares: avg_shares ?? base.shares,
          saves_count: avg_saves ?? base.saves_count,
          views_count: avg_views,
          average_views: avg_views,
        }
      : {}),
  };
}
