/**
 * Extraction pipeline: classify → finalType → route → merge.
 * User-selected labels (batch.labels) are always source of truth for routing.
 */

import type { ExtractedSignals, ScreenshotLabel } from "./extract";
import { coerceMetricCount } from "./extract";
import {
  applyRecentPostAggregation,
  buildRecentPostMetricsFromVision,
  type PerImagePostMetricsInput,
} from "./recent-post-aggregate";
import {
  aggregateProfileGridViews,
  mergeProfileGridViewsInto,
} from "./profile-grid-views";
import type { ScreenshotTypeDetection } from "./screenshot-type-detect";
import type { ConfidenceLevel } from "./extract";
import { filterCommentLines } from "./comment-line-filter";
import { normalizeStringList } from "./vision-response-normalize";

export interface ScreenshotClassification {
  image_index: number;
  filename: string;
  detectedType: ScreenshotLabel;
  finalType: ScreenshotLabel;
  confidence: ConfidenceLevel;
  typeUsedForExtraction: ScreenshotLabel;
}

/** Step 2 — user label is always finalType (never auto-detected alone). */
export function resolveFinalTypes(
  typeDetections: ScreenshotTypeDetection[],
  userLabels: ScreenshotLabel[]
): ScreenshotLabel[] {
  return typeDetections.map(
    (_, i) => userLabels[i] ?? typeDetections[i]?.auto_detected_type ?? "other"
  );
}

/** Step 1 — classification record per screenshot. */
export function buildScreenshotClassifications(
  typeDetections: ScreenshotTypeDetection[],
  userLabels: ScreenshotLabel[],
  filenames: string[]
): ScreenshotClassification[] {
  return typeDetections.map((det, i) => {
    const finalType = userLabels[i] ?? det.auto_detected_type;
    return {
      image_index: i,
      filename: filenames[i] ?? `screenshot_${i + 1}`,
      detectedType: det.auto_detected_type,
      finalType,
      confidence: det.detection_confidence,
      typeUsedForExtraction: finalType,
    };
  });
}

function normalizeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
}

function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function perImageEntry(
  perImage: PerImagePostMetricsInput[],
  index: number
): PerImagePostMetricsInput | undefined {
  if (!Array.isArray(perImage)) return undefined;
  return perImage.find((p) => p.image_index === index) ?? perImage[index];
}

function pickString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function parseHandleFromText(text: string): string | null {
  const at = text.match(/@([a-zA-Z0-9._]{2,30})/);
  if (at) return at[1];
  const handle = text.match(/\b([a-zA-Z0-9._]{2,30})\b/);
  if (handle && /username|handle/i.test(text)) return handle[1];
  return null;
}

function parseFollowersFromText(text: string): number | null {
  const withLabel = text.match(/([\d,.]+)\s*([kmb])?\s*followers?/i);
  if (withLabel) {
    return coerceMetricCount(`${withLabel[1]}${withLabel[2] ?? ""}`);
  }
  if (/follower/i.test(text)) {
    const num = text.match(/([\d,.]+)\s*([kmb])?/i);
    if (num) return coerceMetricCount(`${num[1]}${num[2] ?? ""}`);
  }
  return null;
}

function mergeProfileField(
  out: Record<string, unknown>,
  key: string,
  value: unknown,
  normalized: Record<string, unknown>
): void {
  if (value === null || value === undefined || value === "") return;
  const current = out[key];
  if (current !== null && current !== undefined && current !== "") return;
  out[key] = value;
  normalized[key] = value;
}

/** Pull profile fields from profile-tagged per_image entries + OCR. */
function mergeProfileFromPerImage(
  out: Record<string, unknown>,
  perImage: PerImagePostMetricsInput[],
  finalTypes: ScreenshotLabel[],
  imageCount: number,
  parsed: Record<string, unknown>
): {
  profileIndices: number[];
  raw: Record<string, unknown>;
  normalized: Record<string, unknown>;
} {
  const profileIndices: number[] = [];
  for (let i = 0; i < imageCount; i++) {
    if (finalTypes[i] === "profile") profileIndices.push(i);
  }

  const raw: Record<string, unknown> = {
    top_level: {
      creator_handle: parsed.creator_handle,
      creator_name: parsed.creator_name,
      display_name: parsed.display_name,
      followers: parsed.followers,
      bio: parsed.bio,
      niche: parsed.niche,
    },
  };
  const normalized: Record<string, unknown> = {};

  if (profileIndices.length === 0) {
    return { profileIndices, raw, normalized };
  }

  for (const key of [
    "creator_handle",
    "creator_name",
    "display_name",
    "bio",
    "niche",
    "followers",
    "following",
  ] as const) {
    mergeProfileField(out, key, parsed[key], normalized);
    if (key === "followers" || key === "following") {
      mergeProfileField(out, key, coerceMetricCount(parsed[key]), normalized);
    }
  }

  for (const i of profileIndices) {
    const entry = (perImageEntry(perImage, i) ?? {}) as Record<string, unknown>;
    raw[`per_image_${i}`] = entry;

    mergeProfileField(out, "creator_handle", pickString(entry.creator_handle), normalized);
    mergeProfileField(out, "creator_name", pickString(entry.creator_name), normalized);
    mergeProfileField(out, "display_name", pickString(entry.display_name), normalized);
    mergeProfileField(out, "bio", pickString(entry.bio), normalized);
    mergeProfileField(out, "niche", pickString(entry.niche), normalized);
    mergeProfileField(out, "followers", coerceMetricCount(entry.followers), normalized);
    mergeProfileField(out, "following", coerceMetricCount(entry.following), normalized);

    const ocr = normalizeStringList(entry.ocr_snippets);
    for (const snippet of ocr) {
      if (!out.creator_handle && !out.creator_name) {
        const handle = parseHandleFromText(snippet);
        if (handle) mergeProfileField(out, "creator_handle", handle, normalized);
      }
      if (!out.followers) {
        const followers = parseFollowersFromText(snippet);
        if (followers !== null) mergeProfileField(out, "followers", followers, normalized);
      }
    }
  }

  console.log("[extraction-pipeline] profile screenshots used", profileIndices);
  console.log("[extraction-pipeline] raw profile extraction result", raw);
  console.log("[extraction-pipeline] normalized profile values", normalized);

  return { profileIndices, raw, normalized };
}

/**
 * Step 3 — route vision output by finalType only.
 * Profile / post / comments / analytics fields are isolated per rules.
 */
export function mergeExtractionByFinalType(
  parsed: Record<string, unknown>,
  perImage: PerImagePostMetricsInput[],
  finalTypes: ScreenshotLabel[],
  imageCount: number
): Record<string, unknown> {
  const hasProfile = finalTypes.includes("profile");
  const hasPost = finalTypes.includes("post");
  const hasComments = finalTypes.includes("comments");
  const hasAnalytics = finalTypes.includes("analytics");
  void hasAnalytics;

  const out: Record<string, unknown> = { ...parsed };

  if (hasProfile) {
    mergeProfileFromPerImage(out, perImage, finalTypes, imageCount, parsed);
  } else {
    out.creator_handle = null;
    out.creator_name = null;
    out.display_name = null;
    out.followers = null;
    out.following = null;
    out.bio = null;
    out.niche = null;
  }

  if (!hasComments) {
    out.sample_comments = [];
    out.purchase_intent_comments = [];
    out.curiosity_comments = [];
    out.trust_comments = [];
    out.generic_comments = [];
    out.negative_comments = [];
    out.comment_extraction_confidence = null;
    out.detected_comment_language = null;
  } else {
    const ocrComments: string[] = [];
    for (let i = 0; i < imageCount; i++) {
      if (finalTypes[i] !== "comments") continue;
      ocrComments.push(...normalizeStringList(perImageEntry(perImage, i)?.ocr_snippets));
    }
    const apiComments = normalizeStringArray(parsed.sample_comments);
    const merged = uniqueLines([...apiComments, ...ocrComments]);
    const filteredComments = filterCommentLines(merged);
    out.sample_comments = filteredComments;
    if (filteredComments.length === 0 && merged.length > 0) {
      console.log("[extraction-pipeline] all comment lines were metric/UI chrome", {
        dropped: merged.slice(0, 8),
      });
    }
    console.log("[extraction-pipeline] comments after filter", {
      before: apiComments.length + ocrComments.length,
      after: (out.sample_comments as string[]).length,
    });
  }

  if (!hasAnalytics) {
    // Analytics-only fields stay null unless an analytics screenshot is labeled
  }

  const gridViews = aggregateProfileGridViews(
    perImage,
    finalTypes,
    imageCount,
    [
      coerceMetricCount(out.followers),
      coerceMetricCount(out.following),
      coerceMetricCount(parsed.subscribers),
    ].filter((n): n is number => n !== null),
    parsed
  );

  if (!hasPost) {
    return mergeProfileGridViewsInto(
      applyRecentPostAggregation(out, {
        recent_post_metrics: [],
        recent_post_count: 0,
        avg_likes: null,
        avg_comments: null,
        avg_reposts: null,
        avg_shares: null,
        avg_saves: null,
        avg_views: null,
        aggregation_notes: [],
      }),
      gridViews
    );
  }

  const postAgg = buildRecentPostMetricsFromVision(
    perImage,
    finalTypes,
    imageCount,
    parsed
  );
  return mergeProfileGridViewsInto(applyRecentPostAggregation(out, postAgg), gridViews);
}

export function logExtractionPipeline(
  classifications: ScreenshotClassification[],
  parsed: Record<string, unknown>,
  extraction: ExtractedSignals,
  formPatch: Record<string, unknown>
): void {
  console.log("[extraction-pipeline] classifications", classifications.map((c) => ({
    filename: c.filename,
    detectedType: c.detectedType,
    finalType: c.finalType,
    typeUsedForExtraction: c.typeUsedForExtraction,
    confidence: c.confidence,
  })));
  console.log("[extraction-pipeline] raw per-image", parsed.per_image);
  console.log("[extraction-pipeline] normalized extraction", {
    creator_handle: extraction.creator_handle,
    creator_name: extraction.creator_name,
    followers: extraction.followers,
    niche: extraction.niche,
    platform: extraction.platform,
    recent_post_count: extraction.recent_post_count,
    recent_post_metrics: extraction.recent_post_metrics,
    avg_likes: extraction.avg_likes,
    avg_comments: extraction.avg_comments,
    avg_reposts: extraction.avg_reposts,
    avg_shares: extraction.avg_shares,
    avg_saves: extraction.avg_saves,
    avg_views: extraction.avg_views,
    sample_comments_count: extraction.sample_comments.length,
    purchase_intent_count: extraction.purchase_intent_comments.length,
  });
  console.log("[extraction-pipeline] final merged form values", formPatch);
}
