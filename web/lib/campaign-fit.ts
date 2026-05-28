import type { CampaignGoal } from "./intelligence-types";
import type { Decision, Report } from "./types";

export type CampaignFit = "High" | "Medium" | "Low";

function isAwarenessGoal(goal?: CampaignGoal): boolean {
  return (
    goal === "Awareness" ||
    goal === "UGC" ||
    goal === "Product Launch" ||
    goal === "Community Growth"
  );
}

function goalConditionedFitScore(report: Report): number {
  const { brandFit, pillarScores, commentIntent, input } = report;
  const goal = input.campaignGoal;

  if (isAwarenessGoal(goal)) {
    return Math.round(
      pillarScores.reach * 0.4 +
        pillarScores.engagement * 0.35 +
        brandFit.score * 0.25
    );
  }

  if (goal === "Conversion") {
    const score = Math.round(
      brandFit.score * 0.35 +
        pillarScores.intent * 0.4 +
        pillarScores.reach * 0.15 +
        pillarScores.engagement * 0.1
    );
    if (commentIntent.intentConfidence === "low") {
      return Math.min(score, 58);
    }
    return score;
  }

  return brandFit.score;
}

function hasMegaDistribution(input: Report["input"], reach: number): boolean {
  return input.followers >= 1_000_000 && input.avgViews >= 150_000 && reach >= 72;
}

export function campaignFitFromReport(report: Report): CampaignFit {
  const score = goalConditionedFitScore(report);
  const goal = report.input.campaignGoal;
  const { decision, pillarScores, input } = report;
  const strongReach = pillarScores.reach >= 65;
  const mega = hasMegaDistribution(input, pillarScores.reach);

  if (decision === "Not Recommended") {
    if (
      (isAwarenessGoal(goal) || !goal) &&
      strongReach &&
      pillarScores.engagement >= 35
    ) {
      return score >= 45 ? "Medium" : "Low";
    }
    return "Low";
  }

  if (decision === "Watchlist" && (mega || (strongReach && pillarScores.engagement >= 38))) {
    if (score >= 50 || mega) return "Medium";
    if (score >= 40) return "Medium";
  }

  if (decision === "Strong Candidate" && score >= 50) return "High";
  if (score >= 65) return "High";
  if (score >= 45 || (strongReach && decision === "Watchlist")) return "Medium";
  return "Low";
}

export function shouldWorkWithCreator(decision: Decision): string {
  if (decision === "Strong Candidate") return "Yes — worth reaching out";
  if (decision === "Watchlist") return "Not yet — compare others or run a small test first";
  return "No — skip for now";
}

export function campaignFitTone(fit: CampaignFit): "green" | "amber" | "red" {
  if (fit === "High") return "green";
  if (fit === "Medium") return "amber";
  return "red";
}
