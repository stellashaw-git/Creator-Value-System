/**
 * Maps OpenAI extraction → analyze form fields.
 * Isolated merge layer — does not change vision/scoring pipelines.
 */

import type { ExtractedSignals, ScreenshotLabel } from "./extract";
import { coerceMetricCount } from "./extract";
import {
  calculateRecentPostAverages,
  filterRecentPostMetricsByFinalType,
  type RecentPostAverages,
  type RecentPostMetricRow,
} from "./recent-post-aggregate";
import { averageFromGridCounts } from "./profile-grid-views";
import { computeEngagementMetrics, engagementDisplayFromMetrics } from "./engagement-metrics";
import { filterCommentLines } from "./comment-line-filter";
import type { Platform, Niche } from "./types";

const PURCHASE_PATTERNS = [
  /\blink\b/i,
  /where (did|do|to|can i)/i,
  /how (do|can) i (get|buy)/i,
  /price\??/i,
  /how much/i,
  /\bcode\b/i,
  /discount/i,
  /coupon/i,
  /\bbuy\b/i,
  /\bsize\??/i,
  /shipping/i,
  /\bdrop\b/i,
  /restock/i,
  /sold out/i,
  /need this/i,
  /want this/i,
  /add to cart/i,
];
const CURIOSITY_PATTERNS = [
  /\?$/,
  /\bwhy\b/i,
  /\bhow\b/i,
  /\bwhen\b/i,
  /\bwhat\b/i,
  /which one/i,
  /recommend/i,
  /any tips/i,
  /tell me more/i,
];
const TRUST_PATTERNS = [/trust/i, /legit/i, /real\??/i, /authentic/i, /verified/i];
const NEGATIVE_PATTERNS = [/scam/i, /fake/i, /bad/i, /worst/i, /don't buy/i];

export interface CommentIntelligenceBuckets {
  purchase_intent_comments: string[];
  curiosity_comments: string[];
  trust_comments: string[];
  generic_comments: string[];
  negative_comments: string[];
}

export interface ExtractionFormPatch {
  name?: string;
  creatorHandle?: string;
  displayName?: string;
  platform?: Platform;
  niche?: Niche;
  followers?: string;
  avgViews?: string;
  averageLikes?: string;
  averageComments?: string;
  averageReposts?: string;
  averageShares?: string;
  averageSaves?: string;
  followers30DaysAgo?: string;
  comments?: string;
  recentPostMetrics: RecentPostMetricRow[];
  recentPostCount: number;
  commentIntelligence: CommentIntelligenceBuckets;
  postAverages: RecentPostAverages;
  engagementDisplay: string;
  profileDetailsIncomplete?: boolean;
}

function coerceOptionalCount(v: unknown): number | null {
  return coerceMetricCount(v);
}

function pickCount(...values: unknown[]): number | null {
  for (const v of values) {
    const n = coerceOptionalCount(v);
    if (n !== null) return n;
  }
  return null;
}

function classifyCommentLine(text: string): keyof CommentIntelligenceBuckets {
  const t = text.trim();
  if (!t) return "generic_comments";
  if (NEGATIVE_PATTERNS.some((re) => re.test(t))) return "negative_comments";
  if (PURCHASE_PATTERNS.some((re) => re.test(t))) return "purchase_intent_comments";
  if (CURIOSITY_PATTERNS.some((re) => re.test(t))) return "curiosity_comments";
  if (TRUST_PATTERNS.some((re) => re.test(t))) return "trust_comments";
  return "generic_comments";
}

export function deriveCommentIntelligence(
  data: ExtractedSignals
): CommentIntelligenceBuckets {
  const buckets: CommentIntelligenceBuckets = {
    purchase_intent_comments: filterCommentLines(data.purchase_intent_comments),
    curiosity_comments: filterCommentLines(data.curiosity_comments),
    trust_comments: filterCommentLines(data.trust_comments),
    generic_comments: filterCommentLines(data.generic_comments),
    negative_comments: filterCommentLines(data.negative_comments),
  };

  const hasApiBuckets =
    buckets.purchase_intent_comments.length +
      buckets.curiosity_comments.length +
      buckets.trust_comments.length +
      buckets.generic_comments.length +
      buckets.negative_comments.length >
    0;

  if (hasApiBuckets) return buckets;

  for (const line of filterCommentLines(data.sample_comments)) {
    const key = classifyCommentLine(line);
    if (!buckets[key].includes(line)) {
      buckets[key].push(line);
    }
  }
  return buckets;
}

function buildSyntheticPostRow(data: ExtractedSignals): RecentPostMetricRow | null {
  const likes_count = pickCount(data.avg_likes, data.likes_count, data.likes);
  const comments_count = pickCount(data.avg_comments, data.comments_count);
  const reposts_count = pickCount(data.avg_reposts, data.reposts_count);
  const shares_count = pickCount(data.avg_shares, data.shares);
  const saves_count = pickCount(data.avg_saves, data.saves_count);
  const views_count = pickCount(data.avg_views, data.views_count, data.average_views);

  if (
    likes_count === null &&
    comments_count === null &&
    reposts_count === null &&
    shares_count === null &&
    saves_count === null &&
    views_count === null
  ) {
    return null;
  }

  return {
    screenshot_id: "screenshot_1",
    likes_count,
    comments_count,
    reposts_count,
    shares_count,
    saves_count,
    views_count,
  };
}

function resolveAvgViews(data: ExtractedSignals, rowAvg: number | null): number | null {
  if (rowAvg !== null) return rowAvg;
  const topLevel = pickCount(data.avg_views, data.average_views, data.views_count);
  if (topLevel !== null) return topLevel;
  const grid = data.profile_grid_view_counts;
  if (Array.isArray(grid) && grid.length > 0) {
    return averageFromGridCounts(grid);
  }
  return null;
}

/** Resolve post averages from rows tagged Recent Post in finalTypes (user-corrected labels). */
export function resolveExtractionPostAverages(
  data: ExtractedSignals,
  finalTypes?: ScreenshotLabel[]
): RecentPostAverages {
  const hasPost = finalTypes ? finalTypes.includes("post") : true;
  const postIndices = finalTypes
    ? finalTypes.map((t, i) => (t === "post" ? i : -1)).filter((i) => i >= 0)
    : [];
  const expectedPostCount = postIndices.length;
  const singlePostLabel = expectedPostCount === 1;

  let rows = [...(data.recent_post_metrics ?? [])];
  if (finalTypes?.length) {
    rows = filterRecentPostMetricsByFinalType(rows, finalTypes);
  }

  const topLevel = {
    likes: pickCount(data.avg_likes, data.likes_count, data.likes),
    comments: pickCount(data.avg_comments, data.comments_count),
    reposts: pickCount(data.avg_reposts, data.reposts_count),
    shares: pickCount(data.avg_shares, data.shares),
    saves: pickCount(data.avg_saves, data.saves_count),
    views: pickCount(data.avg_views, data.views_count, data.average_views),
  };

  if (!hasPost) {
    return calculateRecentPostAverages([]);
  }

  if (rows.length === 0 && hasPost) {
    const synthetic = buildSyntheticPostRow(data);
    if (synthetic) rows = [synthetic];
  } else if (rows.length > 0) {
    rows = rows.map((row) => ({
      ...row,
      likes_count:
        row.likes_count ?? (singlePostLabel && rows.length === 1 ? topLevel.likes : null),
      comments_count:
        row.comments_count ??
        (singlePostLabel && rows.length === 1 ? topLevel.comments : null),
      reposts_count:
        row.reposts_count ?? (singlePostLabel && rows.length === 1 ? topLevel.reposts : null),
      shares_count:
        row.shares_count ?? (singlePostLabel && rows.length === 1 ? topLevel.shares : null),
      saves_count:
        row.saves_count ?? (singlePostLabel && rows.length === 1 ? topLevel.saves : null),
      views_count: row.views_count ?? null,
    }));
  }

  let avgs = calculateRecentPostAverages(rows);

  avgs = {
    ...avgs,
    avg_likes: avgs.avg_likes ?? (singlePostLabel ? topLevel.likes : null),
    avg_comments: avgs.avg_comments ?? (singlePostLabel ? topLevel.comments : null),
    avg_reposts: avgs.avg_reposts ?? (singlePostLabel ? topLevel.reposts : null),
    avg_shares: avgs.avg_shares ?? (singlePostLabel ? topLevel.shares : null),
    avg_saves: avgs.avg_saves ?? (singlePostLabel ? topLevel.saves : null),
    avg_views: resolveAvgViews(data, avgs.avg_views),
  };

  if (expectedPostCount > 1 && rows.length < expectedPostCount) {
    console.warn("[extraction-form-map] fewer post metric rows than Recent Post labels", {
      expectedPostCount,
      rowCount: rows.length,
      postIndices,
    });
  }

  console.log("[extraction-form-map] recent post averages", {
    recent_post_screenshots_used: postIndices,
    raw_recent_post_metrics: rows,
    calculated_averages: {
      avg_likes: avgs.avg_likes,
      avg_comments: avgs.avg_comments,
      avg_reposts: avgs.avg_reposts,
      avg_shares: avgs.avg_shares,
      avg_saves: avgs.avg_saves,
      avg_views: avgs.avg_views,
    },
  });

  return { ...avgs, recent_post_metrics: rows, recent_post_count: rows.length };
}

function resolveFollowers(data: ExtractedSignals): number | null {
  return pickCount(data.followers, data.subscribers);
}

function uniqueCommentLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

export function mapExtractionToFormPatch(
  data: ExtractedSignals,
  options: {
    platforms: readonly Platform[];
    niches: readonly Niche[];
    resolvedPlatform: Platform | null;
    finalTypes?: ScreenshotLabel[];
    current: {
      name: string;
      followers: string;
      averageComments: string;
    };
  }
): ExtractionFormPatch {
  const postAverages = resolveExtractionPostAverages(data, options.finalTypes);
  const commentIntelligence = deriveCommentIntelligence(data);

  const bucketLines = uniqueCommentLines([
    ...commentIntelligence.purchase_intent_comments,
    ...commentIntelligence.curiosity_comments,
    ...commentIntelligence.trust_comments,
    ...commentIntelligence.generic_comments,
    ...commentIntelligence.negative_comments,
  ]);
  const commentLines =
    bucketLines.length > 0
      ? bucketLines
      : uniqueCommentLines(data.sample_comments);

  const followersNum = resolveFollowers(data);
  const followersStr =
    followersNum !== null && followersNum > 0 ? String(followersNum) : undefined;

  const patch: ExtractionFormPatch = {
    recentPostMetrics: postAverages.recent_post_metrics,
    recentPostCount: postAverages.recent_post_count,
    commentIntelligence,
    postAverages,
    engagementDisplay: "Not enough data",
  };

  const handle =
    data.creator_handle ?? data.creator_name ?? data.display_name;
  if (handle) {
    patch.name = handle;
    if (data.creator_handle) patch.creatorHandle = data.creator_handle;
  }
  if (data.display_name) patch.displayName = data.display_name;
  if (options.resolvedPlatform) patch.platform = options.resolvedPlatform;
  if (data.niche && options.niches.includes(data.niche as Niche)) {
    patch.niche = data.niche as Niche;
  }

  if (followersStr) patch.followers = followersStr;

  const hasProfileScreenshot = options.finalTypes?.includes("profile") ?? false;
  if (hasProfileScreenshot) {
    const missingIdentity = !data.creator_handle && !data.creator_name && !data.display_name;
    const missingFollowers = followersNum === null || followersNum <= 0;
    patch.profileDetailsIncomplete = missingIdentity || missingFollowers;
  }

  const metric = (v: number | null): string | undefined =>
    v !== null && v >= 0 ? String(v) : undefined;

  patch.avgViews = metric(resolveAvgViews(data, postAverages.avg_views));
  patch.averageLikes = metric(postAverages.avg_likes);
  patch.averageComments = metric(postAverages.avg_comments);
  patch.averageReposts = metric(postAverages.avg_reposts);
  patch.averageShares = metric(postAverages.avg_shares);
  patch.averageSaves = metric(postAverages.avg_saves);

  if (commentLines.length > 0) {
    patch.comments = commentLines.join("\n");
  }

  if (typeof data.growth_30d === "number" && Number.isFinite(data.growth_30d) && followersNum) {
    const raw = data.growth_30d;
    const gDec = Math.abs(raw) <= 1 ? raw : raw / 100;
    if (Number.isFinite(gDec) && gDec > -0.99) {
      patch.followers30DaysAgo = String(Math.round(followersNum / (1 + gDec)));
    }
  }

  const f = followersNum ?? (options.current.followers.trim() ? Number(options.current.followers) : 0);
  if (f > 0) {
    const engagementInputs = {
      followers: f,
      averageLikes: postAverages.avg_likes ?? undefined,
      averageComments: postAverages.avg_comments ?? undefined,
      averageReposts: postAverages.avg_reposts ?? undefined,
      averageShares: postAverages.avg_shares ?? undefined,
      averageSaves: postAverages.avg_saves ?? undefined,
      averageViews: postAverages.avg_views ?? undefined,
    };
    console.log("[extraction-form-map] engagement calculation inputs", engagementInputs);
    const metrics = computeEngagementMetrics(engagementInputs);
    console.log("[extraction-form-map] engagement calculation result", {
      basicEngagementRate: metrics.basicEngagementRate,
      viewBasedEngagementRate: metrics.viewBasedEngagementRate,
      likesOnlyFallback: metrics.likesOnlyFallback,
      components: metrics.engagementComponentsUsed,
    });
    patch.engagementDisplay = engagementDisplayFromMetrics(metrics);
  }

  return patch;
}

export function logExtractionFormMapping(
  data: ExtractedSignals,
  patch: ExtractionFormPatch,
  meta: {
    avgCommentsBefore: string;
    finalTypes?: ScreenshotLabel[];
    classifications?: Array<{
      filename: string;
      detectedType: string;
      finalType: string;
      typeUsedForExtraction: string;
    }>;
  }
): void {
  console.log("[analyze] extraction mapping", {
    final_types: meta.finalTypes,
    screenshot_classifications: meta.classifications,
    profile_screenshots_used: meta.classifications
      ?.map((c, i) => (c.finalType === "profile" ? i : -1))
      .filter((i) => i >= 0),
    raw_profile_extraction: {
      creator_handle: data.creator_handle,
      creator_name: data.creator_name,
      display_name: data.display_name,
      followers: data.followers,
      subscribers: data.subscribers,
      bio: data.bio,
      platform: data.platform,
      detected_platform: data.detected_platform,
      niche: data.niche,
    },
    normalized_profile_values: {
      name: patch.name,
      creatorHandle: patch.creatorHandle,
      displayName: patch.displayName,
      followers: patch.followers,
      platform: patch.platform,
      niche: patch.niche,
    },
    profile_details_incomplete: patch.profileDetailsIncomplete,
    recent_post_screenshots_used: meta.classifications
      ?.map((c, i) => (c.finalType === "post" ? i : -1))
      .filter((i) => i >= 0),
    raw_recent_post_metrics: patch.postAverages.recent_post_metrics,
    calculated_averages: {
      avg_likes: patch.postAverages.avg_likes,
      avg_comments: patch.postAverages.avg_comments,
      avg_reposts: patch.postAverages.avg_reposts,
      avg_shares: patch.postAverages.avg_shares,
      avg_saves: patch.postAverages.avg_saves,
      avg_views: patch.postAverages.avg_views,
    },
    avg_comments_before: meta.avgCommentsBefore,
    avg_comments_after: patch.averageComments ?? "",
    comment_intelligence: patch.commentIntelligence,
    engagement_display: patch.engagementDisplay,
    final_form_patch: {
      name: patch.name,
      followers: patch.followers,
      platform: patch.platform,
      niche: patch.niche,
      averageLikes: patch.averageLikes,
      averageComments: patch.averageComments,
      averageReposts: patch.averageReposts,
      averageShares: patch.averageShares,
      averageSaves: patch.averageSaves,
      avgViews: patch.avgViews,
      comments_lines: patch.comments?.split("\n").length ?? 0,
    },
  });
  console.log("[analyze] final form state after merge", {
    name: patch.name ?? "",
    followers: patch.followers ?? "",
    platform: patch.platform ?? data.platform ?? "",
    niche: patch.niche ?? data.niche ?? "",
    final_avg_fields: {
      averageLikes: patch.averageLikes ?? "",
      averageComments: patch.averageComments ?? "",
      averageReposts: patch.averageReposts ?? "",
      averageShares: patch.averageShares ?? "",
      averageSaves: patch.averageSaves ?? "",
      avgViews: patch.avgViews ?? "",
    },
  });
}
