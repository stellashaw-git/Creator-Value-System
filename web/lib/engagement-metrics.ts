/**
 * Engagement rates from visible post metrics (decimal 0–1 for scoring).
 */

export interface PostMetricInputs {
  followers: number;
  averageLikes?: number;
  averageComments?: number;
  averageReposts?: number;
  averageShares?: number;
  averageSaves?: number;
  averageViews?: number;
  /** Insights screenshot % (e.g. 4.6) */
  extractedRatePercent?: number | null;
}

export interface EngagementMetricsResult {
  basicEngagementRate: number | null;
  expandedEngagementRate: number | null;
  /** (avg_likes + avg_comments) / avg_views when views are available */
  viewBasedEngagementRate: number | null;
  shareRate: number | null;
  engagementComponentsUsed: string[];
  /** Basic rate used likes only because comments were missing */
  likesOnlyFallback?: boolean;
}

function parsePct(raw: number | null | undefined): number | undefined {
  if (raw === null || raw === undefined || !Number.isFinite(raw) || raw < 0) return undefined;
  if (raw <= 1) return raw * 100;
  if (raw <= 100) return raw;
  return undefined;
}

export function computeEngagementMetrics(
  input: PostMetricInputs
): EngagementMetricsResult {
  const { followers } = input;
  const components: string[] = [];
  if (!followers || followers <= 0) {
    return {
      basicEngagementRate: null,
      expandedEngagementRate: null,
      viewBasedEngagementRate: null,
      shareRate: null,
      engagementComponentsUsed: [],
    };
  }

  const likes = input.averageLikes;
  const comments = input.averageComments;
  const reposts = input.averageReposts;
  const shares = input.averageShares;
  const saves = input.averageSaves;
  const views = input.averageViews;

  const has = (v: number | undefined) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0;

  if (has(likes)) components.push("likes");
  if (has(comments)) components.push("comments");
  if (has(reposts)) components.push("reposts");
  if (has(shares)) components.push("shares");
  if (has(saves)) components.push("saves");

  let basic: number | null = null;
  let likesOnlyFallback = false;
  if (has(likes) && has(comments)) {
    basic = Math.min(1, ((likes ?? 0) + (comments ?? 0)) / followers);
  } else if (has(likes)) {
    basic = Math.min(1, (likes ?? 0) / followers);
    likesOnlyFallback = true;
  }

  let viewBased: number | null = null;
  if (has(likes) && has(comments) && has(views) && views! > 0) {
    viewBased = Math.min(1, ((likes ?? 0) + (comments ?? 0)) / views!);
  }

  let expanded: number | null = null;
  if (components.length >= 2) {
    const sum =
      (likes ?? 0) +
      (comments ?? 0) +
      (reposts ?? 0) +
      (shares ?? 0) +
      (saves ?? 0);
    if (sum > 0) expanded = Math.min(1, sum / followers);
  } else {
    expanded = basic;
  }

  const pct = parsePct(input.extractedRatePercent);
  if (expanded === null && pct !== undefined) expanded = Math.min(1, pct / 100);
  if (basic === null && pct !== undefined) basic = Math.min(1, pct / 100);

  let shareRate: number | null = null;
  if (has(shares)) {
    if (has(views) && views! > 0) shareRate = Math.min(1, shares! / views!);
    else shareRate = Math.min(1, shares! / followers);
  }

  return {
    basicEngagementRate: basic,
    expandedEngagementRate: expanded ?? basic,
    viewBasedEngagementRate: viewBased,
    shareRate,
    engagementComponentsUsed: components,
    likesOnlyFallback: likesOnlyFallback || undefined,
  };
}

export function dataCompletenessScore(components: string[]): number {
  const weights: Record<string, number> = {
    likes: 25,
    comments: 25,
    followers: 20,
    reposts: 10,
    shares: 10,
    saves: 10,
  };
  let score = 0;
  for (const c of components) score += weights[c] ?? 5;
  if (components.includes("likes") && components.includes("comments")) score += 10;
  return Math.min(100, score);
}

export function engagementDisplayFromMetrics(m: EngagementMetricsResult): string {
  const er = m.basicEngagementRate ?? m.expandedEngagementRate;
  if (er === null) return "Not enough data";
  let s = `${(er * 100).toFixed(2)}%`;
  if (m.viewBasedEngagementRate !== null) {
    s += ` · ${(m.viewBasedEngagementRate * 100).toFixed(2)}% view-based`;
  }
  s += " — Follower-based engagement rate. Views not required.";
  if (m.likesOnlyFallback) {
    s += " (comments unavailable; likes-only estimate)";
  }
  return s;
}
