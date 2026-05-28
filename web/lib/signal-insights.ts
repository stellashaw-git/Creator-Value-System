import type { AnalyzeInput, CommentIntent } from "./types";
import {
  computeEngagementMetrics,
  dataCompletenessScore,
} from "./engagement-metrics";

export type EvidenceConfidenceLevel = "Low" | "Moderate" | "High";

export interface SignalInsights {
  engagementQuality: string;
  spreadSignal: string;
  repostShareSignal: string;
  dataCompleteness: string;
  monetizationSignal: string;
  evidenceConfidence: string;
  evidenceConfidenceLevel: EvidenceConfidenceLevel;
  purchaseIntentNote: string;
  reachConfidence: string;
  reachConfidenceLevel: EvidenceConfidenceLevel;
  intentConfidenceDetail: string;
}

export const PURCHASE_INTENT_NOTE =
  "Commercial intent is inferred from uploaded comment samples and visible engagement — not direct sales or platform analytics.";

function countUploadedType(uploaded: string[] | undefined, label: string): number {
  return (uploaded ?? []).filter((t) => t === label).length;
}

export function buildEvidenceConfidence(
  input: AnalyzeInput,
  commentIntent: CommentIntent
): { level: EvidenceConfidenceLevel; detail: string } {
  const uploaded = input.screenshotTypesUploaded ?? [];
  const recentPosts = Math.max(
    countUploadedType(uploaded, "Recent Post"),
    input.recentPostCount ?? 0
  );
  const commentShots = countUploadedType(uploaded, "Comments");
  const analyticsShots = countUploadedType(uploaded, "Analytics");

  let points = 0;
  const factors: string[] = [];

  if (recentPosts >= 2) {
    points += 30;
    factors.push(`${recentPosts} recent post screenshots`);
  } else if (recentPosts === 1) {
    points += 15;
    factors.push("1 recent post screenshot");
  }

  if (analyticsShots >= 1) {
    points += 20;
    factors.push(`${analyticsShots} analytics screenshot${analyticsShots > 1 ? "s" : ""}`);
  }

  if (commentShots >= 2) {
    points += 20;
    factors.push(`${commentShots} comment screenshots`);
  } else if (commentShots === 1) {
    points += 10;
    factors.push("1 comment screenshot");
  }

  const hasReposts = (input.averageReposts ?? 0) > 0;
  const hasShares = (input.averageShares ?? 0) > 0;
  if (hasReposts || hasShares) {
    points += 12;
    factors.push("visible repost/share metrics");
  }

  const m = computeEngagementMetrics({
    followers: input.followers,
    averageLikes: input.averageLikes,
    averageComments: input.averageComments,
    averageReposts: input.averageReposts,
    averageShares: input.averageShares,
    averageSaves: input.averageSaves,
    averageViews: input.avgViews > 0 ? input.avgViews : undefined,
  });
  if (
    m.engagementComponentsUsed.includes("likes") &&
    m.engagementComponentsUsed.includes("comments")
  ) {
    points += 10;
  }

  if (input.avgViews > 0) {
    points += 8;
    factors.push("average views visible in uploads");
  }
  if ((input.averageSaves ?? 0) > 0 || (input.averageShares ?? 0) > 0) {
    points += 5;
    factors.push("saves/shares visible in post metrics");
  }

  if (uploaded.length === 1 && uploaded[0] === "Profile") points -= 15;
  if (commentShots === 0 && commentIntent.total === 0) points -= 10;
  if (m.engagementComponentsUsed.length < 2) points -= 8;
  if (commentIntent.intentConfidence === "low" && commentIntent.total > 0) {
    factors.push("small comment sample — intent read is low confidence");
  }

  const level: EvidenceConfidenceLevel =
    points >= 55 ? "High" : points >= 28 ? "Moderate" : "Low";

  const basis =
    factors.length > 0
      ? factors.join(", ")
      : "limited uploaded screenshots";

  const detail = `${level} confidence — based on ${basis}. Uploaded evidence may not represent broader sponsored-content behavior.`;

  return { level, detail };
}

function buildReachConfidence(input: AnalyzeInput): {
  level: EvidenceConfidenceLevel;
  detail: string;
} {
  const followers = input.followers;
  const views = input.avgViews;
  const ratio = followers > 0 && views > 0 ? views / followers : 0;

  if (followers >= 1_000_000 && views >= 200_000) {
    return {
      level: "High",
      detail: `High reach confidence — ${(followers / 1_000_000).toFixed(1)}M followers with ~${Math.round(views / 1000)}K average views in uploads indicates strong distribution power.`,
    };
  }
  if (followers >= 1_000_000 && views >= 100_000) {
    return {
      level: "High",
      detail: `High reach confidence — mega-tier follower count with strong per-post view delivery in uploads (views/followers ≈ ${(ratio * 100).toFixed(0)}%).`,
    };
  }
  if (followers >= 250_000 && views >= 80_000) {
    return {
      level: "High",
      detail: `High reach confidence — macro audience with solid view delivery in uploads.`,
    };
  }
  if (followers >= 50_000 && (views >= 30_000 || ratio >= 0.15)) {
    return {
      level: "Moderate",
      detail: `Moderate reach confidence — rising/macro tier with workable view delivery in uploads.`,
    };
  }
  if (followers >= 10_000) {
    return {
      level: "Moderate",
      detail: "Moderate reach confidence — follower scale is visible; add more post screenshots to confirm view consistency.",
    };
  }
  return {
    level: "Low",
    detail: "Low reach confidence — limited follower or view data in uploads.",
  };
}

function buildIntentConfidenceDetail(commentIntent: CommentIntent): string {
  if (commentIntent.total === 0) {
    return "Intent confidence: low — no comment sample uploaded (unmeasured, not absent commercial value).";
  }
  const level =
    commentIntent.intentConfidence === "high"
      ? "high"
      : commentIntent.intentConfidence === "medium"
        ? "moderate"
        : "low";
  return `Intent confidence: ${level} — based on ${commentIntent.total} uploaded comment lines; ${commentIntent.intentConfidence === "low" ? "under-sampled for conversion conclusions" : "sample supports directional commercial reads"}.`;
}

export function buildMonetizationSignal(
  commentIntent: CommentIntent,
  campaignGoal?: AnalyzeInput["campaignGoal"]
): string {
  const goalNote =
    campaignGoal === "Awareness" ||
    campaignGoal === "UGC" ||
    campaignGoal === "Product Launch" ||
    campaignGoal === "Community Growth"
      ? " For awareness campaigns, reach and engagement matter more than comment purchase language."
      : campaignGoal === "Conversion"
        ? " For conversion campaigns, purchase-intent evidence carries more weight once the sample is large enough."
        : "";

  if (commentIntent.total === 0) {
    return `No uploaded comments were analyzed — commercial intent is unmeasured (missing evidence, not negative evidence). The current read relies on reach and engagement metrics.${goalNote}`;
  }

  return `${commentIntent.commercialSummary} (based on ${commentIntent.total} uploaded comment lines, ${commentIntent.intentConfidence} confidence).${goalNote} ${commentIntent.interpretation}`;
}

export function buildSignalInsights(
  input: AnalyzeInput,
  commentIntent: CommentIntent
): SignalInsights {
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
      ? `Visible signals indicate ~${(m.expandedEngagementRate * 100).toFixed(1)}% expanded ER (${m.engagementComponentsUsed.join(" + ") || "limited inputs"})`
      : m.basicEngagementRate !== null
        ? `Visible signals indicate ~${(m.basicEngagementRate * 100).toFixed(1)}% basic ER (likes + comments)`
        : "Limited engagement data in uploads";

  let spreadSignal = "Spread metrics were not visible in uploaded screenshots.";
  if (input.averageShares !== undefined && input.averageShares > 0) {
    spreadSignal =
      m.shareRate !== null
        ? `Uploaded post metrics show share activity — estimated share rate ~${(m.shareRate * 100).toFixed(2)}% vs ${input.avgViews ? "views" : "followers"}.`
        : `${input.averageShares.toLocaleString()} avg shares per post in uploads suggests some distribution beyond the feed.`;
  }

  let repostShareSignal =
    "Repost/share data was not available from uploaded screenshots.";
  const hasReposts = (input.averageReposts ?? 0) > 0;
  const hasShares = (input.averageShares ?? 0) > 0;
  if (hasReposts || hasShares) {
    const parts: string[] = [];
    if (hasReposts) parts.push(`${input.averageReposts!.toLocaleString()} reposts/post`);
    if (hasShares) parts.push(`${input.averageShares!.toLocaleString()} shares/post`);
    repostShareSignal = `Uploaded post metrics show repost/share activity (${parts.join(", ")}), which may indicate willingness to redistribute content — evidence is limited to the sample shown.`;
  }
  if ((input.averageSaves ?? 0) > 0) {
    repostShareSignal += ` Saves (${input.averageSaves!.toLocaleString()}/post in uploads) may signal consideration intent.`;
  }

  const dataCompleteness =
    completeness >= 70
      ? "High — core metrics captured from uploads."
      : completeness >= 45
        ? "Moderate — some engagement metrics missing from uploads."
        : "Low — add profile, post, and comment screenshots for a stronger read.";

  const evidence = buildEvidenceConfidence(input, commentIntent);
  const reachConf = buildReachConfidence(input);

  return {
    engagementQuality,
    spreadSignal,
    repostShareSignal,
    dataCompleteness,
    monetizationSignal: buildMonetizationSignal(commentIntent, input.campaignGoal),
    evidenceConfidence: evidence.detail,
    evidenceConfidenceLevel: evidence.level,
    purchaseIntentNote: PURCHASE_INTENT_NOTE,
    reachConfidence: reachConf.detail,
    reachConfidenceLevel: reachConf.level,
    intentConfidenceDetail: buildIntentConfidenceDetail(commentIntent),
  };
}

export function spreadMemoLine(input: AnalyzeInput): string | null {
  const hasReposts = (input.averageReposts ?? 0) > 0;
  const hasShares = (input.averageShares ?? 0) > 0;
  if (!hasReposts && !hasShares) {
    return "Share/repost data not available from uploaded screenshots.";
  }
  const parts: string[] = [];
  if (hasReposts) parts.push(`${input.averageReposts!.toLocaleString()} reposts/post in uploads`);
  if (hasShares) parts.push(`${input.averageShares!.toLocaleString()} shares/post in uploads`);
  return `Uploaded post metrics show repost/share activity (${parts.join(", ")}) — limited to visible screenshots.`;
}
