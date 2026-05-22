import type { AnalyzeInput } from "./types";
import {
  computeEngagementMetrics,
  dataCompletenessScore,
  type EngagementMetricsResult,
} from "./engagement-metrics";

export interface SignalInsights {
  engagementQuality: string;
  spreadSignal: string;
  repostShareSignal: string;
  dataCompleteness: string;
}

export function buildSignalInsights(input: AnalyzeInput): SignalInsights {
  const m = computeEngagementMetrics({
    followers: input.followers,
    averageLikes: input.averageLikes,
    averageComments: input.averageComments,
    averageReposts: input.averageReposts,
    averageShares: input.averageShares,
    averageSaves: input.averageSaves,
    averageViews: input.avgViews > 0 ? input.avgViews : undefined,
  });

  const components = [
    ...m.engagementComponentsUsed,
    input.followers > 0 ? "followers" : "",
  ].filter(Boolean);
  const completeness = dataCompletenessScore(components);

  const engagementQuality =
    m.expandedEngagementRate !== null
      ? `${(m.expandedEngagementRate * 100).toFixed(1)}% expanded ER (${m.engagementComponentsUsed.join(" + ") || "limited"})`
      : m.basicEngagementRate !== null
        ? `${(m.basicEngagementRate * 100).toFixed(1)}% basic ER (likes + comments)`
        : "Limited engagement data";

  let spreadSignal = "Spread metrics not visible in uploads.";
  if (input.averageShares !== undefined && input.averageShares > 0) {
    spreadSignal =
      m.shareRate !== null
        ? `Share activity visible — share rate ~${(m.shareRate * 100).toFixed(2)}% vs ${input.avgViews ? "views" : "followers"}.`
        : `${input.averageShares.toLocaleString()} avg shares per post suggests distribution beyond the feed.`;
  }

  let repostShareSignal = "Repost/share data not available from uploaded screenshots.";
  const hasReposts = (input.averageReposts ?? 0) > 0;
  const hasShares = (input.averageShares ?? 0) > 0;
  if (hasReposts || hasShares) {
    const parts: string[] = [];
    if (hasReposts) parts.push(`${input.averageReposts!.toLocaleString()} reposts/post`);
    if (hasShares) parts.push(`${input.averageShares!.toLocaleString()} shares/post`);
    repostShareSignal = `Strong repost/share activity (${parts.join(", ")}) suggests audience willingness to distribute this creator's content.`;
  }
  if ((input.averageSaves ?? 0) > 0) {
    repostShareSignal += ` Saves (${input.averageSaves!.toLocaleString()}/post) signal consideration intent.`;
  }

  const dataCompleteness =
    completeness >= 70
      ? "High — core metrics captured from screenshots."
      : completeness >= 45
        ? "Moderate — some engagement metrics missing; confidence adjusted slightly."
        : "Low — add profile + post + comments screenshots for a stronger read.";

  return {
    engagementQuality,
    spreadSignal,
    repostShareSignal,
    dataCompleteness,
  };
}

export function spreadMemoLine(input: AnalyzeInput): string | null {
  const hasReposts = (input.averageReposts ?? 0) > 0;
  const hasShares = (input.averageShares ?? 0) > 0;
  if (!hasReposts && !hasShares) {
    return "Share/repost data not available from uploaded screenshots.";
  }
  return buildSignalInsights(input).repostShareSignal;
}
