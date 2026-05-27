/**
 * WorthyIQ — Pure scoring logic + rule-based agent output.
 * Side-effect free. Same function shape used by the API route.
 */

import {
  analyzeCommentSample,
  commercialSignalPct,
  intentScoreFromSample,
} from "./comment-intent";
import { computeEngagementMetrics } from "./engagement-metrics";
import type { CampaignGoal } from "./intelligence-types";
import { buildSignalInsights, spreadMemoLine } from "./signal-insights";
import type {
  Action,
  AnalyzeInput,
  CommentIntent,
  Decision,
  DecisionConfidence,
  DecisionMemo,
  GapState,
  IntentConfidence,
  NextAction,
  OutreachMessages,
  Quality,
  RecommendedRole,
  Report,
  SectionLine,
  Verdict,
} from "./types";

type EngagementRateBasis = "views" | "followers" | "proxy";
type ReachTier = "weak" | "decent" | "strong" | "breakout";

interface ScoringEngagementRate {
  rate: number;
  basis: EngagementRateBasis;
}

// ---------- 0. Comment classification (uploaded sample only) ----------

function commentIntentAnalysis(comments: string[]): CommentIntent {
  return analyzeCommentSample(comments);
}

export function isEngagementKnown(input: AnalyzeInput): boolean {
  if (
    typeof input.engagementRate === "number" &&
    Number.isFinite(input.engagementRate) &&
    input.engagementRate >= 0
  ) {
    return true;
  }
  const hasLikes =
    typeof input.averageLikes === "number" && input.averageLikes >= 0;
  const hasComments =
    typeof input.averageComments === "number" && input.averageComments >= 0;
  return hasLikes && hasComments;
}

export function isGrowthKnown(input: AnalyzeInput): boolean {
  return typeof input.growthRate30d === "number" && Number.isFinite(input.growthRate30d);
}

function impliedEngagementRate(avgViews: number, followers: number): number {
  const vtr = followers > 0 ? avgViews / followers : 0;
  return Math.min(0.08, Math.max(0.025, vtr * 0.055));
}

/** Prefer (likes + comments + shares + saves) / views when views exist. */
function viewsBasedEngagementRate(input: AnalyzeInput): number | null {
  const views = input.avgViews;
  if (!views || views <= 0) return null;

  const has = (v: number | undefined) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0;

  const sum =
    (has(input.averageLikes) ? input.averageLikes! : 0) +
    (has(input.averageComments) ? input.averageComments! : 0) +
    (has(input.averageReposts) ? input.averageReposts! : 0) +
    (has(input.averageShares) ? input.averageShares! : 0) +
    (has(input.averageSaves) ? input.averageSaves! : 0);

  if (sum <= 0) {
    if (has(input.averageLikes) && input.averageLikes! > 0) {
      return Math.min(1, input.averageLikes! / views);
    }
    return null;
  }
  return Math.min(1, sum / views);
}

function scoringEngagementRate(input: AnalyzeInput): ScoringEngagementRate {
  const viewsEr = viewsBasedEngagementRate(input);
  if (viewsEr !== null) {
    return { rate: viewsEr, basis: "views" };
  }

  const computed = computeEngagementMetrics({
    followers: input.followers,
    averageLikes: input.averageLikes,
    averageComments: input.averageComments,
    averageReposts: input.averageReposts,
    averageShares: input.averageShares,
    averageSaves: input.averageSaves,
    averageViews: input.avgViews > 0 ? input.avgViews : undefined,
  });
  const followerEr =
    computed.expandedEngagementRate ??
    computed.basicEngagementRate ??
    (isEngagementKnown(input) ? input.engagementRate : undefined);
  if (typeof followerEr === "number" && Number.isFinite(followerEr)) {
    return { rate: Math.min(1, Math.max(0, followerEr)), basis: "followers" };
  }
  return {
    rate: impliedEngagementRate(input.avgViews, input.followers),
    basis: "proxy",
  };
}

function formatEngagementRateForDisplay(input: AnalyzeInput): string {
  const { rate, basis } = scoringEngagementRate(input);
  const pct = (rate * 100).toFixed(1);
  if (basis === "views") {
    return `${pct}% engagement vs views (likes + comments + shares + saves)`;
  }
  if (basis === "followers") {
    return `${pct}% engagement vs followers`;
  }
  return `~${pct}% reach-based engagement proxy`;
}

function reachTier(followers: number, avgViews: number): { tier: ReachTier; ratio: number; label: string } {
  const ratio = followers > 0 && avgViews > 0 ? avgViews / followers : 0;
  if (ratio >= 0.5) return { tier: "breakout", ratio, label: "Breakout reach" };
  if (ratio >= 0.25) return { tier: "strong", ratio, label: "Strong reach" };
  if (ratio >= 0.1) return { tier: "decent", ratio, label: "Decent reach" };
  return { tier: "weak", ratio, label: "Weak reach" };
}

function isAwarenessGoal(goal?: CampaignGoal): boolean {
  return (
    goal === "Awareness" ||
    goal === "UGC" ||
    goal === "Product Launch" ||
    goal === "Community Growth"
  );
}

function isConversionGoal(goal?: CampaignGoal): boolean {
  return goal === "Conversion";
}

function pillarWeights(
  intentConfidence: IntentConfidence,
  campaignGoal?: CampaignGoal
): {
  engagement: number;
  reach: number;
  growth: number;
  intent: number;
} {
  if (isAwarenessGoal(campaignGoal)) {
    const intent =
      intentConfidence === "high" ? 0.08 : intentConfidence === "medium" ? 0.05 : 0.02;
    return { reach: 0.38, engagement: 0.35, growth: 0.22, intent };
  }
  if (isConversionGoal(campaignGoal)) {
    const intent =
      intentConfidence === "high" ? 0.18 : intentConfidence === "medium" ? 0.12 : 0.08;
    return { reach: 0.28, engagement: 0.3, growth: 0.2, intent };
  }
  const intent =
    intentConfidence === "high" ? 0.15 : intentConfidence === "medium" ? 0.1 : 0.05;
  return { reach: 0.32, engagement: 0.33, growth: 0.22, intent };
}

/** Neutral ~8.5% 30d growth when history is missing — avoids heavy penalty. */
const NEUTRAL_GROWTH_EFFECT = 0.085;

function scoringGrowthRate(input: AnalyzeInput): number {
  if (isGrowthKnown(input)) return Math.max(-1, Math.min(5, input.growthRate30d!));
  return NEUTRAL_GROWTH_EFFECT;
}

// ---------- 1–4. Pillar scores (0–100) ----------

function engagementScore(er: number, basis: EngagementRateBasis): number {
  const target = basis === "views" ? 0.06 : basis === "followers" ? 0.05 : 0.04;
  return Math.round(Math.min(100, (er / target) * 100));
}

function reachScore(followers: number, avgViews: number): number {
  if (followers > 0 && avgViews > 0) {
    const { tier } = reachTier(followers, avgViews);
    const tierBase =
      tier === "breakout" ? 92 : tier === "strong" ? 78 : tier === "decent" ? 55 : 25;
    const fBoost = Math.min(18, Math.max(0, (Math.log10(Math.max(1, followers)) - 2) * 6));
    const vBoost = Math.min(12, Math.max(0, (Math.log10(Math.max(1, avgViews)) - 1.5) * 5));
    return Math.round(Math.min(100, tierBase + fBoost * 0.4 + vBoost * 0.35));
  }

  const f = Math.max(1, followers);
  const v = Math.max(1, avgViews);
  const fScore = Math.min(100, (Math.log10(f) - 2) * 20);
  const vScore = avgViews > 0 ? Math.min(100, (Math.log10(v) - 1.5) * 22) : 0;
  return Math.round(Math.max(0, fScore * 0.65 + vScore * 0.35));
}

function growthScore(rate: number): number {
  const score = 20 + Math.min(80, (rate / 0.25) * 80);
  return Math.round(Math.max(0, Math.min(100, score)));
}

function intentScore(intent: CommentIntent): number {
  return intentScoreFromSample(intent);
}

function creatorArchetypeLabel(
  reach: number,
  engagement: number,
  growth: number,
  commentIntent: CommentIntent,
  followers: number,
  avgViews: number
): string {
  const { tier } = reachTier(followers, avgViews);
  const commercial = commercialSignalPct(commentIntent);
  if (
    commentIntent.intentConfidence !== "low" &&
    (commentIntent.purchasePct >= 15 || commercial >= 35)
  ) {
    return "Conversion Creator";
  }
  if (tier === "breakout" || (reach >= 75 && engagement >= 55)) {
    return "Viral Distribution Creator";
  }
  if (
    engagement >= 60 &&
    (commentIntent.productCuriosityPct >= 25 || commentIntent.curiosityPct >= 25)
  ) {
    return "Community Creator";
  }
  if (reach >= 65 || growth >= 65) {
    return "Awareness Creator";
  }
  return "Awareness Creator";
}

function recommendedRole(
  reach: number,
  engagement: number,
  growth: number,
  commentIntent: CommentIntent,
  followers: number,
  avgViews: number
): RecommendedRole {
  const label = creatorArchetypeLabel(
    reach,
    engagement,
    growth,
    commentIntent,
    followers,
    avgViews
  );
  if (label === "Conversion Creator") return "Conversion";
  if (label === "Viral Distribution Creator") return "Distribution";
  if (label === "Community Creator") return "Community";
  return "Awareness";
}

// ---------- 5. Snapshot verdict lines ----------

function monetizationVerdict(
  overall: number,
  intent: number,
  reach: number,
  intentConfidence: IntentConfidence
): SectionLine<Verdict> {
  if (overall >= 70 && intent >= 60 && intentConfidence !== "low") {
    return {
      label: "High",
      detail:
        "Uploaded signals suggest conversion-friendly audience behavior with meaningful reach — worth exploring paid collaboration.",
    };
  }
  if (reach >= 65 && intentConfidence === "low") {
    return {
      label: "Medium",
      detail:
        "Reach is strong in uploads, but purchase-intent evidence is under-sampled — treat as awareness / top-of-funnel until comment evidence improves.",
    };
  }
  if (reach >= 65 && intent < 45) {
    return {
      label: "Medium",
      detail:
        "Visible reach is strong; uploaded comments do not yet prove conversion intent — brands may price this as awareness-first with optional conversion upside.",
    };
  }
  if (overall >= 50) {
    return {
      label: "Medium",
      detail:
        "Mixed commercial signals in uploads — engagement looks workable, but purchase intent is not clearly proven yet.",
    };
  }
  return {
    label: "Low",
    detail:
      "Based on uploaded evidence, conversion signals are thin — consider only if campaign goals are reach-first or you can run a low-risk pilot.",
  };
}

function growthSignal(growth: number, rate: number | undefined): SectionLine<Quality> {
  if (rate === undefined || !Number.isFinite(rate)) {
    return {
      label: "Moderate",
      detail:
        "30-day follower growth was not provided — growth pillar uses a neutral baseline so the overall score is not skewed.",
    };
  }
  if (growth >= 75) return { label: "Strong", detail: `+${Math.round(rate * 100)}% in 30 days — clear upward momentum.` };
  if (growth >= 45) return { label: "Moderate", detail: `+${Math.round(rate * 100)}% in 30 days — steady, not breakout.` };
  return { label: "Weak", detail: `+${Math.round(rate * 100)}% in 30 days — momentum has stalled.` };
}

function engagementQuality(
  engagement: number,
  er: ScoringEngagementRate,
  reachLabel: string
): SectionLine<Quality> {
  const erPct = (er.rate * 100).toFixed(1);
  if (er.basis === "views") {
    if (engagement >= 70) {
      return {
        label: "Strong",
        detail: `${erPct}% engagement vs views — audience is actively responding relative to exposure. ${reachLabel}.`,
      };
    }
    if (engagement >= 40) {
      return {
        label: "Average",
        detail: `${erPct}% engagement vs views — workable band for this tier. ${reachLabel}.`,
      };
    }
    return {
      label: "Weak",
      detail: `${erPct}% engagement vs views — interactions look light relative to views. ${reachLabel}.`,
    };
  }
  if (er.basis === "followers") {
    if (engagement >= 70) {
      return {
        label: "Strong",
        detail: `${erPct}% engagement vs followers — audience is actively responding. Views were not available; follower-based ER used.`,
      };
    }
    if (engagement >= 40) {
      return {
        label: "Average",
        detail: `${erPct}% engagement vs followers — normal band for this tier. Views were not available; follower-based ER used.`,
      };
    }
    return {
      label: "Weak",
      detail: `${erPct}% engagement vs followers — interactions are below typical tier expectations. Views were not available; follower-based ER used.`,
    };
  }
  return {
    label: engagement >= 55 ? "Average" : "Weak",
    detail: `Limited engagement inputs — reach-based proxy (~${erPct}% equivalent ER). ${reachLabel}.`,
  };
}

function trafficVsMonetizationGap(
  reach: number,
  intent: number,
  intentConfidence: IntentConfidence
): SectionLine<GapState> {
  if (reach >= 60 && intent >= 60 && intentConfidence !== "low") {
    return {
      label: "Strong monetization",
      detail:
        "Uploaded signals suggest both reach and purchase-oriented comment patterns — engagement may support conversion.",
    };
  }
  if (reach >= 60 && intentConfidence === "low") {
    return {
      label: "High traffic, under-sampled intent",
      detail:
        "Audience reach looks real in uploads, but the comment sample is too small to judge conversion — missing evidence, not negative evidence.",
    };
  }
  if (reach >= 60 && intent < 45 && intentConfidence !== "low") {
    return {
      label: "High traffic, weak monetization",
      detail:
        "Audience size appears real in uploads, but comment sample shows limited buying language — common when admiration outpaces commerce intent.",
    };
  }
  if (reach >= 60 && intent < 45) {
    return {
      label: "High traffic, under-sampled intent",
      detail:
        "Reach is strong but purchase-intent evidence is limited — treat as under-sampled, not weak monetization.",
    };
  }
  if (reach < 40 && intent >= 60 && intentConfidence !== "low") {
    return {
      label: "Low traffic, strong potential",
      detail:
        "Smaller audience in uploads, but comment sample shows relatively stronger commercial language — may punch above follower count.",
    };
  }
  return {
    label: "Balanced",
    detail:
      "Reach and intent signals in uploads sit at a similar tier — no major mismatch, but no standout commercial edge either.",
  };
}

// ---------- 6. Brand fit ----------

const NICHE_BRAND_AFFINITY: Record<string, string[]> = {
  Beauty: ["beauty", "skincare", "makeup", "cosmetics", "fragrance"],
  Fashion: ["fashion", "apparel", "clothing", "accessories", "shoes"],
  Fitness: ["fitness", "supplements", "athletic", "activewear", "wellness"],
  Lifestyle: ["lifestyle", "home", "travel", "wellness", "food"],
  Luxury: ["luxury", "watches", "jewelry", "fashion", "automotive"],
  Tech: ["tech", "software", "saas", "gadgets", "electronics"],
  Food: ["food", "beverage", "restaurant", "meal kit", "snacks"],
  Gaming: ["gaming", "esports", "peripherals", "energy drinks", "streaming"],
  Other: [],
};

function brandFitScoreBase(
  intent: number,
  reach: number,
  engagement: number,
  intentConfidence: IntentConfidence,
  campaignGoal?: CampaignGoal
): number {
  if (isAwarenessGoal(campaignGoal)) {
    return reach * 0.55 + engagement * 0.35 + intent * 0.1;
  }
  if (intentConfidence === "low") {
    return reach * 0.5 + engagement * 0.3 + intent * 0.2;
  }
  if (isConversionGoal(campaignGoal)) {
    return intent * 0.55 + reach * 0.3 + engagement * 0.15;
  }
  return intent * 0.6 + reach * 0.4;
}

function brandFit(
  niche: string,
  intent: number,
  reach: number,
  engagement: number,
  brandCategory?: string,
  intentConfidence?: IntentConfidence,
  campaignGoal?: CampaignGoal
): Report["brandFit"] {
  const base = brandFitScoreBase(
    intent,
    reach,
    engagement,
    intentConfidence ?? "low",
    campaignGoal
  );
  if (!brandCategory || !brandCategory.trim()) {
    const goalHint = isAwarenessGoal(campaignGoal)
      ? " Awareness goal weights reach + engagement over comment intent."
      : isConversionGoal(campaignGoal)
        ? " Conversion goal weights purchase-intent signals more heavily."
        : "";
    return {
      score: Math.round(base),
      detail: `Generic fit based on niche + commercial signal.${goalHint} Add a brand category for a tighter read.`,
    };
  }
  const cat = brandCategory.trim().toLowerCase();
  const affinity = NICHE_BRAND_AFFINITY[niche] || [];
  const matched = affinity.some((kw) => cat.includes(kw) || kw.includes(cat));
  const adjustment = matched ? 15 : -15;
  const score = Math.max(0, Math.min(100, Math.round(base + adjustment)));
  const detail = matched
    ? `Niche-native fit for ${brandCategory} — creator's audience already shares the category's vocabulary.`
    : `${brandCategory} sits outside the creator's natural niche. Possible with a custom angle, but harder to justify.`;
  return { score, detail, category: brandCategory };
}

// ---------- 7. Recommended action ----------

function recommendedAction(decision: Decision, growth: number): SectionLine<Action> {
  if (decision === "Strong Candidate") return { label: "Sign", detail: "Move from outreach to deal terms this week. Don't let competitors get there first." };
  if (decision === "Watchlist") {
    if (growth >= 70) return { label: "Pilot test", detail: "Run one paid post with clear KPIs. Growth trajectory justifies a low-risk first test." };
    return { label: "Monitor", detail: "Re-evaluate in 30 days. Track engagement direction and intent comments before any spend." };
  }
  return { label: "Pass", detail: "Signal is too weak across pillars to justify partnership cost right now." };
}

// ---------- 8. Final decision ----------

function finalDecision(
  overall: number,
  engagement: number,
  growth: number,
  intent: number,
  reach: number,
  intentConfidence: IntentConfidence,
  campaignGoal?: CampaignGoal
): { decision: Decision; rationale: string } {
  const strongReach = reach >= 65;
  const decentEngagement = engagement >= 38;
  const lowIntentEvidence = intentConfidence === "low";
  const strong = [engagement, growth, intent].filter((s) => s >= 65).length;
  const awareness = isAwarenessGoal(campaignGoal);
  const conversion = isConversionGoal(campaignGoal);

  if (strongReach && decentEngagement && lowIntentEvidence) {
    if (awareness && overall >= 58) {
      return {
        decision: "Strong Candidate",
        rationale:
          "Strong reach and engagement for an awareness campaign — comment sample is too small for conversion reads, but distribution metrics support a top-of-funnel partnership.",
      };
    }
    return {
      decision: "Watchlist",
      rationale: awareness
        ? "Strong reach and engagement for your stated awareness goal — comment sample is too small for conversion reads. Lean top-of-funnel candidate."
        : "Strong reach and workable engagement on uploaded metrics — comment sample is too small for conversion reads. Lean awareness / top-of-funnel candidate rather than a hard pass.",
    };
  }

  if (awareness && strongReach && engagement >= 40 && overall >= 58) {
    return {
      decision: "Strong Candidate",
      rationale:
        "Reach and engagement align with your stated awareness goal — distribution power outweighs thin conversion evidence in uploads.",
    };
  }

  const meetsDefaultStrongBar =
    overall >= 68 && (strong >= 2 || (strongReach && engagement >= 55));
  const meetsAwarenessStrongBar =
    awareness && overall >= 62 && strongReach && engagement >= 45;

  if (meetsDefaultStrongBar || meetsAwarenessStrongBar) {
    if (conversion && lowIntentEvidence) {
      return {
        decision: "Watchlist",
        rationale:
          "Overall signals are solid, but your conversion goal needs stronger purchase-intent evidence — re-sample comments or run a conversion pilot before escalating.",
      };
    }
    if (conversion && intentConfidence === "medium" && intent < 50) {
      return {
        decision: "Watchlist",
        rationale:
          "Mixed conversion signals — reach and engagement may support a test, but purchase-intent language in uploads is not yet strong enough for a conversion-forward Strong Candidate call.",
      };
    }
    return {
      decision: "Strong Candidate",
      rationale: conversion
        ? "Multiple uploaded commercial signals align for your conversion goal — pending your risk tolerance and offer fit."
        : awareness
          ? "Reach and engagement support your stated awareness objective — proceed with top-of-funnel KPIs."
          : "Multiple uploaded commercial signals align — this profile may support measurable campaign ROI, pending your risk tolerance.",
    };
  }

  if (overall >= 42 || (strongReach && decentEngagement)) {
    return {
      decision: "Watchlist",
      rationale: awareness
        ? "Partial signals support an awareness-first read — reach may justify a low-risk test even when conversion evidence is thin."
        : "Mixed or partial uploaded signals — reach and engagement may support awareness-first campaigns; re-check conversion evidence before larger spend.",
    };
  }

  if (strongReach && reach >= 70) {
    return {
      decision: "Watchlist",
      rationale:
        "Reach strength is the standout signal in uploads — consider awareness-first partnership even when conversion evidence is thin.",
    };
  }

  if (awareness && strongReach && decentEngagement) {
    return {
      decision: "Watchlist",
      rationale:
        "For your awareness campaign, reach and engagement in uploads outweigh thin conversion evidence — worth a shortlist or pilot.",
    };
  }

  return {
    decision: "Not Recommended",
    rationale: conversion
      ? "Uploaded evidence is weak for your conversion-focused campaign — consider only if you can run a low-risk test or gather stronger intent data."
      : "Uploaded evidence is weak across reach and engagement — allocating budget here may skew toward low-impact spend unless new uploads change the picture.",
  };
}

function decisionConfidence(
  decision: Decision,
  pillars: number[],
  commentTotal: number
): { confidence: DecisionConfidence; reason: string } {
  const strong = pillars.filter((p) => p >= 65).length;
  const weak = pillars.filter((p) => p < 40).length;
  const mean = pillars.reduce((a, b) => a + b, 0) / pillars.length;
  const variance = pillars.reduce((a, b) => a + (b - mean) ** 2, 0) / pillars.length;
  const stdev = Math.sqrt(variance);

  // No sample = inherent uncertainty on the intent dimension — not a negative read.
  if (commentTotal === 0) {
    return {
      confidence: "Low",
      reason:
        "Confidence is capped — no comment sample was provided, so purchase intent is unmeasured (neutral baseline applied, not penalized as zero intent).",
    };
  }

  if (decision === "Strong Candidate" && strong >= 3) {
    return {
      confidence: "High",
      reason: `${strong} of 4 commercial pillars cross the strong threshold. Pillar agreement is tight, so the call carries weight.`,
    };
  }

  if (decision === "Not Recommended" && weak >= 3) {
    return {
      confidence: "High",
      reason: `${weak} of 4 pillars sit below the tier baseline. There is no contradicting signal to soften the call.`,
    };
  }

  if (stdev > 22) {
    return {
      confidence: "Low",
      reason: `Pillar scores diverge widely (σ ≈ ${stdev.toFixed(0)}). One or two dimensions are pulling the decision in opposite directions — re-evaluate after the next 30 days of activity.`,
    };
  }

  if (stdev <= 12) {
    return {
      confidence: "High",
      reason: `Pillar scores agree closely (σ ≈ ${stdev.toFixed(0)}). The decision is supported uniformly across signals, not driven by a single outlier.`,
    };
  }

  return {
    confidence: "Medium",
    reason: `Pillar scores mostly align with moderate spread (σ ≈ ${stdev.toFixed(0)}). The decision is directionally sound but worth a second look before committing significant budget.`,
  };
}

// ============================================================================
// AGENT OUTPUT — Decision Memo / Outreach / Next Actions (rule-based)
// ============================================================================

function buildMemo(report: {
  input: AnalyzeInput;
  overall: number;
  pillars: { engagement: number; reach: number; growth: number; intent: number };
  commentIntent: CommentIntent;
  decision: Decision;
  gap: GapState;
  brandFitScore: number;
}): DecisionMemo {
  const { input, pillars, commentIntent, decision, gap, brandFitScore } = report;
  const followersK = input.followers >= 1_000_000
    ? `${(input.followers / 1_000_000).toFixed(1)}M`
    : `${Math.round(input.followers / 1000)}K`;

  const erPct =
    isEngagementKnown(input) ||
    input.engagementComponentsUsed?.length ||
    input.avgViews > 0
      ? formatEngagementRateForDisplay(input)
      : "limited engagement inputs (add post screenshots for likes, comments, shares)";
  const growthPct = isGrowthKnown(input) ? `${Math.round(input.growthRate30d! * 100)}%` : "unknown";
  const reachInfo = reachTier(input.followers, input.avgViews);
  const archetype = creatorArchetypeLabel(
    pillars.reach,
    pillars.engagement,
    pillars.growth,
    commentIntent,
    input.followers,
    input.avgViews
  );

  // Executive summary — concise, evidence-aware
  let executiveSummary: string;
  if (decision === "Strong Candidate") {
    executiveSummary = `${input.name} (${followersK} on ${input.platform}, ${archetype}) shows ${erPct}${growthPct === "unknown" ? "" : ` and +${growthPct} 30-day growth`}. ${reachInfo.label} (views/followers ≈ ${(reachInfo.ratio * 100).toFixed(0)}%). Current visible signals suggest commercial potential — treat as a candidate for outreach, not a guaranteed converter.`;
  } else if (decision === "Watchlist") {
    executiveSummary = `${input.name} (${followersK} on ${input.platform}, ${archetype}) shows ${reachInfo.label} with ${erPct}${growthPct === "unknown" ? "" : ` and +${growthPct} growth`}. ${commentIntent.intentConfidence === "low" ? "Purchase-intent evidence is limited in uploads — lean awareness / top-of-funnel candidate." : "Evidence is incomplete; a low-risk test may be appropriate before larger spend."}`;
  } else {
    executiveSummary = `${input.name} (${followersK} on ${input.platform}) shows limited commercial evidence in uploads (${erPct}, ${reachInfo.label}). Partnership economics look uncertain from the current sample.`;
  }

  const whyMatters = `For ${input.niche.toLowerCase()} campaigns, uploaded engagement and comment patterns help estimate whether an audience may respond to sponsored content — not whether they will buy.${input.campaignGoal ? ` Your stated goal is ${input.campaignGoal} — this evaluation weights signals accordingly.` : ""} ${input.brandCategory ? `Category fit with ${input.brandCategory} is one lens; conversion still depends on offer and creative.` : "Niche context matters, but the uploaded sample is only a partial view."}`;

  const upsideDrivers: string[] = [];
  if (pillars.reach >= 60) {
    upsideDrivers.push(`${reachInfo.label} (${followersK} followers, views/followers ≈ ${(reachInfo.ratio * 100).toFixed(0)}%)`);
  }
  if (pillars.intent >= 60 && commentIntent.intentConfidence !== "low") {
    upsideDrivers.push(commentIntent.commercialSummary);
  }
  if (pillars.engagement >= 60) {
    upsideDrivers.push(erPct);
  }
  if (pillars.growth >= 60 && isGrowthKnown(input)) {
    upsideDrivers.push(`+${growthPct} 30-day growth in uploaded profile/analytics data`);
  }
  if (brandFitScore >= 60)
    upsideDrivers.push(`${brandFitScore}/100 brand-fit score vs your category inputs`);
  const spreadLine = spreadMemoLine(input);
  if (spreadLine && !spreadLine.startsWith("Share/repost data not")) {
    upsideDrivers.push(spreadLine.replace(/\.$/, ""));
  }
  const commercialUpside =
    upsideDrivers.length > 0
      ? `Possible upside based on uploads: ${upsideDrivers.join("; ")}. These are directional signals — not proof of sponsored-post performance.`
      : `Uploaded evidence does not yet show a standout commercial dimension. Re-check after more post or comment screenshots.`;

  const audienceSignal =
    commentIntent.total > 0
      ? `Uploaded comment sample (${commentIntent.total} lines, ${commentIntent.intentConfidence} confidence): ${commentIntent.commercialSummary} ${commentIntent.interpretation}`
      : `No comments were uploaded — audience intent is not measured from comments in this evaluation (neutral baseline applied).`;

  let monetizationGap: string;
  if (gap === "Strong monetization") {
    monetizationGap =
      "Uploaded reach and comment patterns both look workable — remaining uncertainty is mostly offer, creative, and pricing fit.";
  } else if (gap === "High traffic, under-sampled intent") {
    monetizationGap =
      "Reach appears stronger than the comment evidence supports — treat as awareness-first until a larger comment sample is available.";
  } else if (gap === "High traffic, weak monetization") {
    monetizationGap =
      "Reach appears stronger than purchase-intent language in uploads — brands may need awareness-first framing or stronger CTAs.";
  } else if (gap === "Low traffic, strong potential") {
    monetizationGap =
      "Comment sample suggests relatively stronger commercial language, but audience scale in uploads is limited — upside may be niche, not mass.";
  } else {
    monetizationGap =
      "Reach and intent signals in uploads sit at a similar level — no clear structural gap, but also no clear premium lever.";
  }

  const risks: string[] = [];
  if (pillars.engagement < 40) risks.push("engagement metrics in uploads sit below typical tier expectations");
  if (pillars.growth < 40 && isGrowthKnown(input)) risks.push("30-day growth signal looks soft in uploaded data");
  if (
    pillars.intent < 40 &&
    commentIntent.intentConfidence !== "low" &&
    commercialSignalPct(commentIntent) < 20
  ) {
    risks.push("uploaded comment sample shows limited commercial or product curiosity language");
  }
  if (commentIntent.intentConfidence === "low" && commentIntent.total > 0) {
    risks.push("comment sample is too small for firm purchase-intent conclusions");
  }
  if (commentIntent.total === 0) risks.push("no comment sample was uploaded — intent uses neutral baseline");
  if (input.brandCategory && brandFitScore < 50)
    risks.push(`${input.brandCategory} may sit outside the creator's natural niche`);
  const riskFactors =
    risks.length > 0
      ? `Caveats from limited evidence: ${risks.join("; ")}. Any of these may shift with fuller screenshots or a pilot post.`
      : `No major red flags in the uploaded sample — still treat as partial evidence until campaign performance is observed.`;

  let recommendedStrategy: string;
  const goalPrefix = input.campaignGoal ? `For a ${input.campaignGoal} campaign: ` : "";
  if (decision === "Strong Candidate") {
    recommendedStrategy = `${goalPrefix}Consider outreach with a structured test (e.g. one or two paid posts with saves/reply KPIs). Move to larger fees only if the pilot matches uploaded signals.`;
  } else if (decision === "Watchlist") {
    recommendedStrategy = `${goalPrefix}Consider an awareness-first or gifting pilot (${archetype} profile). Re-evaluate conversion KPIs after 30 days with fresh post and comment screenshots (target 30+ comment lines).`;
  } else {
    recommendedStrategy = `${goalPrefix}Pass for now unless new uploads show stronger reach, engagement, or a larger comment sample with purchase-intent language.`;
  }

  return {
    executiveSummary,
    whyMatters,
    commercialUpside,
    audienceSignal,
    monetizationGap,
    riskFactors,
    recommendedStrategy,
    creatorArchetype: archetype,
  };
}

function buildOutreach(
  input: AnalyzeInput,
  decision: Decision,
  reach: number
): OutreachMessages {
  const name = input.name;
  const niche = input.niche.toLowerCase();
  const followersK = input.followers >= 1_000_000
    ? `${(input.followers / 1_000_000).toFixed(1)}M`
    : `${Math.round(input.followers / 1000)}K`;
  const erPct = (scoringEngagementRate(input).rate * 100).toFixed(1);
  const growthSnippet = isGrowthKnown(input)
    ? `+${Math.round(input.growthRate30d! * 100)}% in 30 days`
    : "steady audience build at your current tier";
  const category = input.brandCategory || `${input.niche}-adjacent`;

  const brand = `Hi ${name},

I've been watching your ${niche} content — your ${erPct}% engagement rate stands out at the ${followersK} tier, and the audience reads as commercially engaged.

We're a ${category} brand looking for 2–3 creators to run a paid product-fit test next quarter. Fixed fee, two posts, clear KPIs on saves and comment intent. No long contract.

Open to a 15-minute intro this week?

— [Your name]`;

  const mcn = `Hi ${name},

Quick note from [MCN Name]. Your trajectory in ${niche} (${followersK} followers, ${growthSnippet}) puts you in the bracket we typically sign for representation.

What we offer: pre-vetted brand deals, rate-card upgrades, contract review, and access to our talent network. We earn only when you do — no upfront commitments.

Would it be useful to compare what you're seeing in inbound deals vs. our current market rate for your tier?

— [Your name]`;

  const warmDm = `hey ${name} — ${niche} content has been on my radar lately. the ${erPct}% engagement is honestly rare at your size.

quick question: are you fielding brand inquiries directly right now, or going through someone? happy to share what i'm seeing on rate ranges for your tier if useful.

— [Your name]`;

  if (decision === "Not Recommended") {
    const strongReach = reach >= 65;
    if (strongReach) {
      return {
        brand: `Hi ${name},

I've been enjoying your ${niche} content — ${followersK} tier with strong distribution (${erPct}% engagement). For awareness campaigns we typically shortlist profiles at your reach band even when comment samples are thin.

We're not moving to paid budget on conversion KPIs yet, but happy to stay in touch for top-of-funnel tests or gifting pilots if timing aligns.

— [Your name]`,
        mcn,
        warmDm,
      };
    }
    return {
      brand: `Hi ${name},

I've enjoyed your ${niche} content. Honest read: we typically wait for stronger reach, engagement, or a fuller comment sample before we commit paid budget.

Worth staying in touch — happy to re-engage when those signals shift. If you have a recent campaign performance recap I should look at, that would change the picture.

— [Your name]`,
      mcn,
      warmDm,
    };
  }

  return { brand, mcn, warmDm };
}

function buildNextActions(decision: Decision, growth: number, intent: number, hasComments: boolean): NextAction[] {
  if (decision === "Strong Candidate") {
    return [
      {
        priority: "now",
        title: "Send brand outreach this week",
        detail: "Open with a 2-post paid placement at fixed fee plus an affiliate kicker on the second post.",
      },
      {
        priority: "next",
        title: "Request audience demographic data",
        detail: "Ask for an age / geography / gender breakdown screenshot from their analytics before contract.",
      },
      {
        priority: "watch",
        title: "Track post-deal performance",
        detail: "Compare saves, comment intent, and follower growth in the 30 days after the paid post lands.",
      },
    ];
  }
  if (decision === "Watchlist") {
    return [
      {
        priority: "now",
        title: growth >= 70
          ? "Run a single-post pilot with explicit KPIs"
          : "Request recent campaign performance recap",
        detail: growth >= 70
          ? "Low-cost test on the conversion side — KPIs on saves, replies, and intent-laden comments."
          : "Before any spend, get a recap of their last paid post: views, saves, link clicks if available.",
      },
      {
        priority: "next",
        title: "Offer affiliate-first partnership",
        detail: "Skip the fixed fee. Offer a 15–20% revenue share so the creator carries the conversion risk.",
      },
      {
        priority: "watch",
        title: "Place on a 30-day watchlist",
        detail: hasComments
          ? "Re-pull comment intent in 30 days. If purchase % rises, escalate from watchlist to pilot."
          : "Re-evaluate after 30 days with a fresh comment sample (15–30 recent posts).",
      },
    ];
  }
  // Not Recommended
  return [
    {
      priority: "now",
      title: "Decline politely, keep door open",
      detail: "Send a short note explaining the signal threshold you'd need to see before engaging.",
    },
    {
      priority: "next",
      title: "Add to long-tail tracker",
      detail: intent >= 40
        ? "Intent isn't zero — re-screen in 60 days if engagement quality moves up."
        : "Skip active tracking. Re-screen only if a category shift or viral moment changes the inputs.",
    },
    {
      priority: "watch",
      title: "Audit your inbound filter",
      detail: "If multiple profiles in this shape are reaching you, tighten your inbound criteria upstream.",
    },
  ];
}

// ---------- Top-level pipeline ----------

export function buildReport(input: AnalyzeInput, mode: "openai" | "rule_based" = "rule_based"): Report {
  const metrics = computeEngagementMetrics({
    followers: input.followers,
    averageLikes: input.averageLikes,
    averageComments: input.averageComments,
    averageReposts: input.averageReposts,
    averageShares: input.averageShares,
    averageSaves: input.averageSaves,
    averageViews: input.avgViews > 0 ? input.avgViews : undefined,
  });
  const inputEnriched: AnalyzeInput = {
    ...input,
    engagementRate:
      input.engagementRate ??
      metrics.expandedEngagementRate ??
      metrics.basicEngagementRate ??
      undefined,
    engagementComponentsUsed:
      input.engagementComponentsUsed ?? metrics.engagementComponentsUsed,
  };

  const commentIntent = commentIntentAnalysis(inputEnriched.comments);
  const erS = scoringEngagementRate(inputEnriched);
  const grS = scoringGrowthRate(inputEnriched);
  const engagement = engagementScore(erS.rate, erS.basis);
  const reach = reachScore(inputEnriched.followers, inputEnriched.avgViews);
  const growth = growthScore(grS);
  const intent = intentScore(commentIntent);
  const weights = pillarWeights(commentIntent.intentConfidence, inputEnriched.campaignGoal);

  const overallScore = Math.round(
    engagement * weights.engagement +
      reach * weights.reach +
      growth * weights.growth +
      intent * weights.intent
  );

  const role = recommendedRole(
    reach,
    engagement,
    growth,
    commentIntent,
    inputEnriched.followers,
    inputEnriched.avgViews
  );

  const reachInfo = reachTier(inputEnriched.followers, inputEnriched.avgViews);
  const monetization = monetizationVerdict(
    overallScore,
    intent,
    reach,
    commentIntent.intentConfidence
  );
  const growthSec = growthSignal(
    growth,
    isGrowthKnown(inputEnriched) ? inputEnriched.growthRate30d : undefined
  );
  const engagementSec = engagementQuality(engagement, erS, reachInfo.label);
  const gap = trafficVsMonetizationGap(reach, intent, commentIntent.intentConfidence);
  const fit = brandFit(
    inputEnriched.niche,
    intent,
    reach,
    engagement,
    inputEnriched.brandCategory,
    commentIntent.intentConfidence,
    inputEnriched.campaignGoal
  );
  const { decision, rationale } = finalDecision(
    overallScore,
    engagement,
    growth,
    intent,
    reach,
    commentIntent.intentConfidence,
    inputEnriched.campaignGoal
  );
  let { confidence, reason: confidenceReason } = decisionConfidence(
    decision,
    [engagement, reach, growth, intent],
    commentIntent.total
  );
  const metricCoverage = inputEnriched.engagementComponentsUsed?.length ?? 0;
  if (metricCoverage < 2 && confidence === "High") {
    confidence = "Medium";
    confidenceReason += " Partial engagement metrics — confidence adjusted slightly.";
  }
  const action = recommendedAction(decision, growth);

  const memo = buildMemo({
    input: inputEnriched,
    overall: overallScore,
    pillars: { engagement, reach, growth, intent },
    commentIntent,
    decision,
    gap: gap.label,
    brandFitScore: fit.score,
  });
  const outreach = buildOutreach(inputEnriched, decision, reach);
  const nextActions = buildNextActions(
    decision,
    growth,
    intent,
    inputEnriched.comments.length > 0
  );
  const signalInsights = buildSignalInsights(inputEnriched, commentIntent);

  return {
    input: inputEnriched,
    overallScore,
    pillarScores: { engagement, reach, growth, intent },
    monetization,
    growth: growthSec,
    engagement: engagementSec,
    commentIntent,
    gap,
    brandFit: fit,
    action,
    decision,
    recommendedRole: role,
    decisionRationale: rationale,
    decisionConfidence: confidence,
    decisionConfidenceReason: confidenceReason,
    memo,
    outreach,
    nextActions,
    signalInsights,
    mode,
  };
}
