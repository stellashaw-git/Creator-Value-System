/**
 * Canonical intelligence schema — stable shape for localStorage today and
 * Supabase / Airtable / Sheets adapters tomorrow. Report + dataset stay source
 * of truth; this module normalizes exports.
 */

import { campaignFitFromReport } from "./campaign-fit";
import {
  computeEngagementMetrics,
  dataCompletenessScore,
} from "./engagement-metrics";
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
  likes_count?: number | null;
  comments_count?: number | null;
  reposts_count?: number | null;
  shares_count?: number | null;
  saves_count?: number | null;
  views_count?: number | null;
  basic_engagement_rate?: number | null;
  expanded_engagement_rate?: number | null;
  share_rate?: number | null;
  engagement_components_used?: string[];
  screenshot_types_uploaded?: string[];
  screenshot_types_detected?: string[];
  data_completeness?: number | null;
  detected_platform?: string | null;
  platform_confidence?: string | null;
  platform_override?: string | null;
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
  const metrics = computeEngagementMetrics({
    followers: input.followers,
    averageLikes: input.averageLikes,
    averageComments: input.averageComments,
    averageReposts: input.averageReposts,
    averageShares: input.averageShares,
    averageSaves: input.averageSaves,
    averageViews: input.avgViews > 0 ? input.avgViews : undefined,
  });
  const completenessComponents = [
    ...metrics.engagementComponentsUsed,
    input.followers > 0 ? "followers" : "",
  ].filter(Boolean);

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
    likes_count: input.averageLikes ?? null,
    comments_count: input.averageComments ?? null,
    reposts_count: input.averageReposts ?? null,
    shares_count: input.averageShares ?? null,
    saves_count: input.averageSaves ?? null,
    views_count: input.avgViews > 0 ? input.avgViews : null,
    basic_engagement_rate: metrics.basicEngagementRate,
    expanded_engagement_rate: metrics.expandedEngagementRate,
    share_rate: metrics.shareRate,
    engagement_components_used:
      input.engagementComponentsUsed ?? metrics.engagementComponentsUsed,
    screenshot_types_uploaded: input.screenshotTypesUploaded,
    screenshot_types_detected: input.screenshotTypesDetected,
    data_completeness: dataCompletenessScore(completenessComponents),
    detected_platform: input.detectedPlatform ?? input.platform,
    platform_confidence: input.platformConfidence ?? null,
    platform_override: input.platformOverride ?? null,
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
