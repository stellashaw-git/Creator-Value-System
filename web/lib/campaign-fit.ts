import type { Decision, Report } from "./types";

export type CampaignFit = "High" | "Medium" | "Low";

export function campaignFitFromReport(report: Report): CampaignFit {
  if (report.decision === "Not Recommended") return "Low";
  const score = report.brandFit.score;
  if (report.decision === "Strong Candidate" && score >= 55) return "High";
  if (score >= 70) return "High";
  if (score >= 45) return "Medium";
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
