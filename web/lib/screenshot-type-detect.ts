/**
 * Deterministic screenshot type scoring from vision-reported visual signals + OCR snippets.
 * Profile / comments / analytics use the original highest-score classifier (restored).
 * Recent Post adds vertical-layout rules only — v3 layered overrides removed.
 */

import type { ConfidenceLevel, ScreenshotLabel } from "./extract";
import { normalizeStringList } from "./vision-response-normalize";

export interface PerImageVisionHints {
  visual_signals?: string[];
  ocr_snippets?: string[];
  llm_suggested_type?: string | null;
}

export interface ScreenshotTypeDetection {
  image_index: number;
  auto_detected_type: ScreenshotLabel;
  detection_confidence: ConfidenceLevel;
  detection_reasons: string[];
  /** UI compatibility — derived from score winner */
  rule_reason: string;
  classification_reason: string;
  classifier_version: string;
  profile_score: number;
  recent_post_score: number;
  comments_score: number;
  analytics_score: number;
  visual_signals: string[];
  ocr_snippets: string[];
  llm_suggested_type: ScreenshotLabel | null;
}

export const CLASSIFIER_VERSION = "v4-score-2";

const LEGACY_CLASSIFIER_VERSIONS = new Set(["v3", "v2", "v1", "v4-score"]);

export function isLegacyClassification(det: ScreenshotTypeDetection): boolean {
  return (
    LEGACY_CLASSIFIER_VERSIONS.has(det.classifier_version) ||
    det.classification_reason === "llm fallback" ||
    det.classification_reason === "unknown"
  );
}

export interface PerImageClassificationHints {
  image_index: number;
  visual_signals: string[];
  ocr_snippets: string[];
  llm_suggested_type?: string | null;
}

export function buildPerImageClassificationHints(
  perImage: Array<{
    image_index?: number;
    visual_signals?: unknown;
    ocr_snippets?: unknown;
    llm_suggested_type?: unknown;
  }>
): PerImageClassificationHints[] {
  return perImage.map((entry, i) => ({
    image_index: typeof entry.image_index === "number" ? entry.image_index : i,
    visual_signals: normalizeStringList(entry.visual_signals),
    ocr_snippets: normalizeStringList(entry.ocr_snippets),
    llm_suggested_type:
      typeof entry.llm_suggested_type === "string" ? entry.llm_suggested_type : null,
  }));
}

function hintsForIndex(
  imageIndex: number,
  perImageHints: PerImageClassificationHints[] | undefined,
  det?: ScreenshotTypeDetection
): Required<Pick<PerImageVisionHints, "visual_signals" | "ocr_snippets">> & {
  llm_suggested_type: string | null;
} {
  const hint =
    perImageHints?.find((h) => h.image_index === imageIndex) ?? perImageHints?.[imageIndex];
  const visual_signals = normalizeStringList(hint?.visual_signals ?? det?.visual_signals);
  const ocr_snippets = normalizeStringList(hint?.ocr_snippets ?? det?.ocr_snippets);
  const llm_suggested_type =
    hint?.llm_suggested_type ?? det?.llm_suggested_type ?? null;
  return { visual_signals, ocr_snippets, llm_suggested_type };
}

/** Re-run classifier when cached detections used legacy v3 layers or lack vision hints. */
export function refreshTypeDetections(
  detections: ScreenshotTypeDetection[] | undefined,
  perImageHints?: PerImageClassificationHints[]
): ScreenshotTypeDetection[] | undefined {
  if (!detections?.length) return detections;
  return detections.map((det) => {
    const hints = hintsForIndex(det.image_index, perImageHints, det);
    const hasSignals = hints.visual_signals.length > 0 || hints.ocr_snippets.length > 0;
    const isCurrent =
      det.classifier_version === CLASSIFIER_VERSION && !isLegacyClassification(det);

    if (isCurrent && hasSignals) {
      return det;
    }

    console.log("[screenshot-type-detect] refreshTypeDetections re-classifying", {
      image_index: det.image_index,
      prior_version: det.classifier_version,
      prior_reason: det.classification_reason,
      visual_signals_length: hints.visual_signals.length,
      ocr_snippets_length: hints.ocr_snippets.length,
    });

    return resolveScreenshotType(det.image_index, hints);
  });
}

type SignalRule = { pattern: RegExp; weight: number; reason: string };

/** Original profile rules — unchanged from first working score-based classifier. */
const PROFILE_RULES: SignalRule[] = [
  { pattern: /\bfollow\b(?!ers)/i, weight: 2, reason: "Follow button" },
  { pattern: /\bmessage\b/i, weight: 2, reason: "Message button" },
  { pattern: /\bemail\b/i, weight: 2, reason: "Email button" },
  { pattern: /\bfollowers?\b/i, weight: 2, reason: "Follower count" },
  { pattern: /\bfollowing\b/i, weight: 2, reason: "Following count" },
  { pattern: /\bbio\b/i, weight: 2, reason: "Profile bio" },
  { pattern: /\bhighlight/i, weight: 2, reason: "Profile highlights" },
  { pattern: /\bprofile grid\b|\bgrid\b.*\bpost/i, weight: 2, reason: "Profile grid" },
  {
    pattern: /\bposts?\b.*\bfollowers?\b|\bfollowers?\b.*\bposts?\b/i,
    weight: 1,
    reason: "Posts + followers header",
  },
  { pattern: /\blink in bio\b|\bbio link\b/i, weight: 2, reason: "Link in bio" },
  { pattern: /\busername\b|\b@/i, weight: 1, reason: "Username header" },
  { pattern: /\bsubscribe\b/i, weight: 1, reason: "Subscribe button (profile)" },
];

/** Original post rules + vertical Reels/TikTok layout (post-only refinement). */
const POST_RULES: SignalRule[] = [
  { pattern: /\bengagement row\b|\bicon row\b/i, weight: 3, reason: "Engagement icon row" },
  { pattern: /\bheart icon\b|\blike icon\b|\b❤/i, weight: 2, reason: "Heart/like icon" },
  { pattern: /\bcomment icon\b|\bspeech bubble\b/i, weight: 2, reason: "Comment icon" },
  { pattern: /\brepost\b|\bretweet\b|\bshare icon\b|\brepost icon\b/i, weight: 2, reason: "Repost/share icon" },
  { pattern: /\bbookmark\b|\bsave icon\b/i, weight: 2, reason: "Bookmark icon" },
  {
    pattern: /\blikes?\b.*\bcomments?\b|\bcomments?\b.*\blikes?\b/i,
    weight: 2,
    reason: "Likes + comments text",
  },
  { pattern: /\bcaption\b/i, weight: 2, reason: "Post caption" },
  { pattern: /\bpost date\b|\b\d+[hdw]\s+ago\b/i, weight: 1, reason: "Post date" },
  { pattern: /\bsingle post\b|\bpost image\b|\bpost video\b/i, weight: 2, reason: "Single post media" },
  { pattern: /\bviews?\b.*\blikes?\b/i, weight: 1, reason: "Views + likes on post" },
  {
    pattern:
      /\bright[\s-]?(side|column|edge).*?(heart|like|speech|comment|share|repost|bookmark)/i,
    weight: 5,
    reason: "Vertical engagement column on right",
  },
  {
    pattern: /\b(vertical|stacked)\s+(engagement|icons?|metrics?)\b/i,
    weight: 4,
    reason: "Vertical engagement stack",
  },
  {
    pattern: /\bengagement\s+(icons?|metrics?)\s+on\s+(the\s+)?right\b/i,
    weight: 4,
    reason: "Engagement icons on right",
  },
  {
    pattern: /\bfull[\s-]?screen\b.*\b(reel|video|post)\b|\b(reel|tiktok)\s+player\b/i,
    weight: 3,
    reason: "Full-screen reel/post player",
  },
  { pattern: /\bliked by\b/i, weight: 3, reason: "Liked by row" },
  { pattern: /\binstagram post\b|\bfeed post\b/i, weight: 2, reason: "Instagram feed post" },
];

/** Comment-thread rules — avoid matching reel engagement ("181 comments", "180K heart"). */
const COMMENTS_RULES: SignalRule[] = [
  {
    pattern: /\bcomments\b(?![\s:]*[\d,.]+\s*([kmb])?\b)/i,
    weight: 3,
    reason: '"Comments" header',
  },
  {
    pattern: /\bcomment row\b|\brepeated comment\b|\bmultiple comment/i,
    weight: 3,
    reason: "Repeated comment rows",
  },
  { pattern: /\breply\b/i, weight: 2, reason: "Reply labels" },
  {
    pattern: /\busername.*comment\b|\bcomment.*username\b/i,
    weight: 2,
    reason: "Username + comment text",
  },
  { pattern: /\bcomment like\b|\bheart.*comment\b/i, weight: 1, reason: "Comment like counts" },
  { pattern: /\bview all comments\b|\badd a comment\b/i, weight: 2, reason: "Comment thread UI" },
  { pattern: /\b\d+\s+replies\b/i, weight: 2, reason: "Reply count rows" },
  { pattern: /\bsee translation\b/i, weight: 2, reason: "See translation" },
  {
    pattern: /\b(top|newest|for you)\s+comments\b|\bcomments\s+(header|tab|sheet)\b/i,
    weight: 4,
    reason: "Comments tab/header",
  },
];

/** Original analytics rules — unchanged. */
const ANALYTICS_RULES: SignalRule[] = [
  { pattern: /\banalytics\b|\binsights\b/i, weight: 3, reason: "Analytics/insights header" },
  { pattern: /\breach\b|\bimpressions\b/i, weight: 2, reason: "Reach/impressions" },
  { pattern: /\baudience\b|\bdemographics\b/i, weight: 2, reason: "Audience demographics" },
  { pattern: /\bengagement rate\b/i, weight: 2, reason: "Engagement rate metric" },
  { pattern: /\boverview\b.*\bmetric/i, weight: 1, reason: "Metrics overview" },
  { pattern: /\bchart\b|\bgraph\b/i, weight: 1, reason: "Chart/graph UI" },
  { pattern: /\baccounts reached\b|\bprofile visits\b/i, weight: 2, reason: "Dashboard KPI labels" },
];

const VALID_LABELS: ScreenshotLabel[] = [
  "profile",
  "post",
  "comments",
  "analytics",
  "other",
];

function normalizeLabel(raw: string | null | undefined): ScreenshotLabel | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (s === "profile") return "profile";
  if (s === "post" || s === "recent post" || s === "recent_post") return "post";
  if (s === "comments" || s === "comment") return "comments";
  if (s === "analytics") return "analytics";
  if (s === "other") return "other";
  return null;
}

function scoreRules(combined: string, rules: SignalRule[]): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  for (const rule of rules) {
    if (rule.pattern.test(combined)) {
      score += rule.weight;
      reasons.push(rule.reason);
    }
  }
  return { score, reasons };
}

function scoreLabel(label: ScreenshotLabel): keyof Pick<
  ScreenshotTypeDetection,
  "profile_score" | "recent_post_score" | "comments_score" | "analytics_score"
> {
  switch (label) {
    case "profile":
      return "profile_score";
    case "post":
      return "recent_post_score";
    case "comments":
      return "comments_score";
    case "analytics":
      return "analytics_score";
    default:
      return "profile_score";
  }
}

function countMatches(combined: string, pattern: RegExp): number {
  return (combined.match(pattern) ?? []).length;
}

/** OCR like "181 comments" / "180k heart" — post engagement, not a comment thread. */
function hasPostEngagementMetricTokens(combined: string): boolean {
  return (
    /\b[\d,.]+\s*([kmb])?\s*comments?\b/i.test(combined) ||
    /\b[\d,.]+\s*([kmb])?\s*(heart|hearts?|likes?)\b/i.test(combined) ||
    /\b(heart|like)\s*icon\b/i.test(combined)
  );
}

function isCommentThreadLayout(combined: string): boolean {
  return (
    countMatches(combined, /\breply\b/gi) >= 2 ||
    /\b(top|newest|for you)\s+comments\b/i.test(combined) ||
    /\bcomment thread\b/i.test(combined) ||
    /\bview all comments\b/i.test(combined) ||
    (/\bsee translation\b/i.test(combined) && countMatches(combined, /@\w+/g) >= 2)
  );
}

/** Post-only: full-screen reel with vertical icon stack (not a comment thread). */
function isVerticalRecentPostLayout(combined: string): boolean {
  const hasVertical =
    /\b(right[\s-]?(side|column|edge)|vertical\s+(column|stack)|engagement\s+on\s+the\s+right|stacked\s+on\s+the\s+right)\b/i.test(
      combined
    ) ||
    /\bfull[\s-]?screen\b.*\b(reel|video)\b/i.test(combined);
  const hasPostIcons =
    /\b(heart|like)\b/i.test(combined) &&
    (/\b(speech bubble|comment icon)\b/i.test(combined) ||
      hasPostEngagementMetricTokens(combined)) &&
    /\b(share|send|paper plane|repost|bookmark)\b/i.test(combined);
  return (hasVertical || hasPostEngagementMetricTokens(combined)) && hasPostIcons && !isCommentThreadLayout(combined);
}

function scoreCommentsRules(combined: string): { score: number; reasons: string[] } {
  const base = scoreRules(combined, COMMENTS_RULES);
  if (!hasPostEngagementMetricTokens(combined) || isCommentThreadLayout(combined)) {
    return base;
  }
  let score = base.score;
  const reasons = [...base.reasons];
  if (/\bcomments\b/i.test(combined) && /\b[\d,.]+\s*([kmb])?\s*comments?\b/i.test(combined)) {
    score = Math.max(0, score - 3);
    const idx = reasons.findIndex((r) => r.includes("Comments"));
    if (idx >= 0) reasons.splice(idx, 1);
  }
  return { score, reasons };
}

function classificationReasonLabel(
  type: ScreenshotLabel,
  confidence: ConfidenceLevel,
  usedLlmFallback: boolean
): string {
  if (usedLlmFallback) return "llm fallback";
  if (confidence === "low" && type === "other") return "unknown";
  const band = confidence === "high" ? "strong" : confidence === "medium" ? "weak" : "unknown";
  if (type === "profile") return `${band} profile`;
  if (type === "post") return `${band} recent post`;
  if (type === "comments") return `${band} comments`;
  if (type === "analytics") return `${band} analytics`;
  return "unknown";
}

export function resolveScreenshotType(
  imageIndex: number,
  hints: PerImageVisionHints
): ScreenshotTypeDetection {
  const visual_signals = normalizeStringList(hints.visual_signals);
  const ocr_snippets = normalizeStringList(hints.ocr_snippets);
  const combined = [...visual_signals, ...ocr_snippets].join(" ").toLowerCase();

  const profile = scoreRules(combined, PROFILE_RULES);
  const post = scoreRules(combined, POST_RULES);
  const comments = scoreCommentsRules(combined);
  const analytics = scoreRules(combined, ANALYTICS_RULES);

  if (isVerticalRecentPostLayout(combined)) {
    post.score += 5;
    post.reasons.push("Vertical post layout boost");
    if (!isCommentThreadLayout(combined)) {
      comments.score = 0;
      comments.reasons = [];
    }
    console.log("[screenshot-type-detect] vertical recent post boost", { image_index: imageIndex });
  }

  const llm_suggested_type = normalizeLabel(hints.llm_suggested_type);
  if (llm_suggested_type && llm_suggested_type !== "other") {
    const key = scoreLabel(llm_suggested_type);
    if (key === "profile_score") profile.score += 1;
    else if (key === "recent_post_score") post.score += 1;
    else if (key === "comments_score") comments.score += 1;
    else if (key === "analytics_score") analytics.score += 1;
  }

  const scores = (
    [
      { type: "profile" as const, score: profile.score, reasons: profile.reasons },
      { type: "post" as const, score: post.score, reasons: post.reasons },
      { type: "comments" as const, score: comments.score, reasons: comments.reasons },
      { type: "analytics" as const, score: analytics.score, reasons: analytics.reasons },
    ] satisfies { type: ScreenshotLabel; score: number; reasons: string[] }[]
  ).sort((a, b) => b.score - a.score);

  const top = scores[0]!;
  const second: { type: ScreenshotLabel; score: number; reasons: string[] } =
    scores[1] ?? { type: "other", score: 0, reasons: [] };

  let auto_detected_type: ScreenshotLabel =
    top.score > 0 ? top.type : llm_suggested_type ?? "other";

  const usedLlmFallback = top.score === 0 && Boolean(llm_suggested_type);

  if (
    isVerticalRecentPostLayout(combined) &&
    post.score >= 3 &&
    auto_detected_type !== "post" &&
    top.score - post.score <= 4
  ) {
    auto_detected_type = "post";
    console.log("[screenshot-type-detect] vertical post wins over", top.type, {
      image_index: imageIndex,
      post_score: post.score,
      top_score: top.score,
    });
  }

  let detection_confidence: ConfidenceLevel = "low";
  if (top.score >= 4 || (top.score >= 2 && top.score - second.score >= 2)) {
    detection_confidence = "high";
  } else if (top.score >= 2) {
    detection_confidence = "medium";
  }

  if (
    llm_suggested_type &&
    llm_suggested_type === auto_detected_type &&
    detection_confidence === "medium"
  ) {
    detection_confidence = "high";
  }

  const winnerReasons =
    auto_detected_type === top.type
      ? top.reasons
      : scores.find((s) => s.type === auto_detected_type)?.reasons ?? top.reasons;

  const detection_reasons =
    winnerReasons.length > 0
      ? winnerReasons.slice(0, 6)
      : llm_suggested_type
        ? [`LLM suggested: ${llm_suggested_type}`]
        : ["No strong heuristic matches"];

  const classification_reason = classificationReasonLabel(
    auto_detected_type,
    detection_confidence,
    usedLlmFallback
  );

  console.log("[screenshot-type-detect]", {
    image_index: imageIndex,
    classifier_version: CLASSIFIER_VERSION,
    profile_score: profile.score,
    recent_post_score: post.score,
    comments_score: comments.score,
    analytics_score: analytics.score,
    auto_detected_type,
    classification_reason,
    vertical_post: isVerticalRecentPostLayout(combined),
  });

  return {
    image_index: imageIndex,
    auto_detected_type,
    detection_confidence,
    detection_reasons,
    rule_reason: classification_reason,
    classification_reason,
    classifier_version: CLASSIFIER_VERSION,
    profile_score: profile.score,
    recent_post_score: post.score,
    comments_score: comments.score,
    analytics_score: analytics.score,
    visual_signals,
    ocr_snippets,
    llm_suggested_type,
  };
}

/** final_type = user override when set, else auto_detected. Re-extract uses all user labels. */
export function resolveFinalTypes(
  autoDetections: ScreenshotTypeDetection[],
  userLabels: ScreenshotLabel[],
  labelOverrides: boolean[],
  reExtract = false
): ScreenshotLabel[] {
  if (reExtract) {
    return autoDetections.map((_, i) => userLabels[i] ?? "other");
  }
  return autoDetections.map((det, i) => {
    if (labelOverrides[i] && userLabels[i]) return userLabels[i];
    return det.auto_detected_type;
  });
}

export function isValidScreenshotLabel(x: unknown): x is ScreenshotLabel {
  return VALID_LABELS.includes(x as ScreenshotLabel);
}
