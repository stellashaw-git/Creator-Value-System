/**
 * Creator Intelligence Dataset — client-side persistence layer.
 *
 * Stores every creator evaluation locally so the product can later connect
 * creator signals to real campaign outcomes. localStorage-only by design —
 * the moat is the schema and the feedback loop, not the storage tech.
 */

import type { Report } from "./types";

export type CampaignStatus =
  | "Not started"
  | "Shortlisted"
  | "Contacted"
  | "In discussion"
  | "Campaign launched"
  | "Completed";

export const CAMPAIGN_STATUSES: CampaignStatus[] = [
  "Not started",
  "Shortlisted",
  "Contacted",
  "In discussion",
  "Campaign launched",
  "Completed",
];

export type OutcomePerformance = "Strong" | "OK" | "Weak" | "Unknown";

export const OUTCOME_PERFORMANCES: OutcomePerformance[] = [
  "Strong",
  "OK",
  "Weak",
  "Unknown",
];

export type FollowedRecommendation = "Yes" | "Modified" | "Ignored";

export const FOLLOWED_RECOMMENDATIONS: FollowedRecommendation[] = [
  "Yes",
  "Modified",
  "Ignored",
];

export interface CampaignOutcome {
  status: CampaignStatus;
  performance?: OutcomePerformance;
  budget?: number;
  estimatedROI?: number;
  actualROI?: number;
  conversionResult?: string;
  notes?: string;
  followUpDate?: string; // yyyy-mm-dd
}

export interface SavedEvaluation {
  id: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  report: Report;
  outcome: CampaignOutcome;
  /** Did the brand follow WorthyIQ's recommendation for this creator? */
  followedRecommendation?: FollowedRecommendation;
}

const STORAGE_KEY = "worthyiq.evaluations.v1";

const isBrowser = (): boolean => typeof window !== "undefined";

function readAll(): SavedEvaluation[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedEvaluation[];
  } catch {
    return [];
  }
}

function writeAll(rows: SavedEvaluation[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // quota exceeded or storage disabled — silently no-op for demo
  }
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function listEvaluations(): SavedEvaluation[] {
  return readAll().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getEvaluation(id: string): SavedEvaluation | undefined {
  return readAll().find((row) => row.id === id);
}

export function saveEvaluation(report: Report): SavedEvaluation {
  const now = new Date().toISOString();
  const row: SavedEvaluation = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    report,
    outcome: { status: "Not started" },
  };
  const rows = readAll();
  rows.push(row);
  writeAll(rows);
  return row;
}

export function updateOutcome(
  id: string,
  outcome: CampaignOutcome
): SavedEvaluation | undefined {
  return updateEvaluationFeedback(id, { outcome });
}

export interface EvaluationFeedbackPatch {
  outcome?: Partial<CampaignOutcome>;
  followedRecommendation?: FollowedRecommendation;
}

export function updateEvaluationFeedback(
  id: string,
  patch: EvaluationFeedbackPatch
): SavedEvaluation | undefined {
  const rows = readAll();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return undefined;
  const prev = rows[idx];
  rows[idx] = {
    ...prev,
    outcome: patch.outcome ? { ...prev.outcome, ...patch.outcome } : prev.outcome,
    followedRecommendation:
      patch.followedRecommendation !== undefined
        ? patch.followedRecommendation
        : prev.followedRecommendation,
    updatedAt: new Date().toISOString(),
  };
  writeAll(rows);
  return rows[idx];
}

/** Short label for tables and chips */
export function pipelineStatusLabel(status: CampaignStatus): string {
  switch (status) {
    case "Not started":
      return "Not started";
    case "Shortlisted":
      return "Shortlisted";
    case "Contacted":
      return "Contacted";
    case "In discussion":
      return "In discussion";
    case "Campaign launched":
      return "Launched";
    case "Completed":
      return "Completed";
    default:
      return status;
  }
}

export function deleteEvaluation(id: string): void {
  writeAll(readAll().filter((r) => r.id !== id));
}

export interface DatasetStats {
  total: number;
  strong: number;
  watchlist: number;
  notRecommended: number;
  campaignsLaunched: number;
  campaignsCompleted: number;
  avgEstimatedROI: number | null;
  avgActualROI: number | null;
}

export function computeStats(rows: SavedEvaluation[]): DatasetStats {
  let strong = 0;
  let watchlist = 0;
  let notRecommended = 0;
  let launched = 0;
  let completed = 0;
  let estROISum = 0;
  let estROIN = 0;
  let actROISum = 0;
  let actROIN = 0;

  for (const r of rows) {
    if (r.report.decision === "Strong Candidate") strong++;
    else if (r.report.decision === "Watchlist") watchlist++;
    else if (r.report.decision === "Not Recommended") notRecommended++;

    if (
      r.outcome.status === "Campaign launched" ||
      r.outcome.status === "Completed"
    )
      launched++;
    if (r.outcome.status === "Completed") completed++;

    if (typeof r.outcome.estimatedROI === "number") {
      estROISum += r.outcome.estimatedROI;
      estROIN++;
    }
    if (typeof r.outcome.actualROI === "number") {
      actROISum += r.outcome.actualROI;
      actROIN++;
    }
  }

  return {
    total: rows.length,
    strong,
    watchlist,
    notRecommended,
    campaignsLaunched: launched,
    campaignsCompleted: completed,
    avgEstimatedROI: estROIN > 0 ? estROISum / estROIN : null,
    avgActualROI: actROIN > 0 ? actROISum / actROIN : null,
  };
}

export function exportAllAsJSON(): string {
  return JSON.stringify(listEvaluations(), null, 2);
}
