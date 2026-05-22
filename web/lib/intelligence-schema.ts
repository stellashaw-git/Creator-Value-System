/**
 * Canonical intelligence schema — stable shape for localStorage today and
 * Supabase / Airtable / Sheets adapters tomorrow. Report + dataset stay source
 * of truth; this module normalizes exports.
 */

import { campaignFitFromReport } from "./campaign-fit";
import type { SavedEvaluation } from "./dataset";
import {
  userWorkflowFromRow,
  performanceToOutcomeStatus,
} from "./dataset";
import type { CampaignContext, OutcomeStatus, UserWorkflow } from "./intelligence-types";
import type { Report } from "./types";

export type {
  BrandCategoryTag,
  CampaignGoal,
  CampaignContext,
  OutcomeStatus,
  UserWorkflow,
} from "./intelligence-types";
export { BRAND_CATEGORY_TAGS, CAMPAIGN_GOALS, DEFAULT_USER_WORKFLOW } from "./intelligence-types";

/** Normalized evaluation snapshot (learning-loop input). */
export interface CreatorEvaluationSnapshot {
  evaluation_id: string;
  creator_name: string;
  platform: string;
  niche: string;
  followers: number;
  engagement_rate: number | null;
  comments_signal: string;
  commercial_score: number;
  campaign_fit: string;
  recommendation: string;
  confidence: string;
  timestamp: string;
  brand_category?: string;
  campaign_goal?: string;
}

/** Full intelligence record for export / future persistence. */
export interface IntelligenceRecord {
  schema_version: 1;
  creator_evaluation: CreatorEvaluationSnapshot;
  user_workflow: UserWorkflow;
  outcome_status: OutcomeStatus;
  followed_recommendation?: string;
  campaign_context?: CampaignContext;
  updated_at: string;
}

function commentsSignal(report: Report): string {
  const c = report.commentIntent;
  return c.interpretation || `${c.total} comments sampled`;
}

export function snapshotFromReport(
  row: SavedEvaluation
): CreatorEvaluationSnapshot {
  const { input, report } = { input: row.report.input, report: row.report };
  return {
    evaluation_id: row.id,
    creator_name: input.name,
    platform: input.platform,
    niche: input.niche,
    followers: input.followers,
    engagement_rate:
      typeof input.engagementRate === "number" ? input.engagementRate : null,
    comments_signal: commentsSignal(report),
    commercial_score: report.overallScore,
    campaign_fit: campaignFitFromReport(report),
    recommendation: report.decision,
    confidence: report.decisionConfidence,
    timestamp: row.createdAt,
    brand_category: input.brandCategory,
    campaign_goal: input.campaignGoal,
  };
}

export function toIntelligenceRecord(row: SavedEvaluation): IntelligenceRecord {
  return {
    schema_version: 1,
    creator_evaluation: snapshotFromReport(row),
    user_workflow: userWorkflowFromRow(row),
    outcome_status: performanceToOutcomeStatus(row.outcome.performance),
    followed_recommendation: row.followedRecommendation,
    campaign_context: {
      brand_category: row.report.input.brandCategory,
      campaign_goal: row.report.input.campaignGoal,
    },
    updated_at: row.updatedAt,
  };
}

export function exportIntelligenceBundle(rows: SavedEvaluation[]): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      records: rows.map(toIntelligenceRecord),
    },
    null,
    2
  );
}
