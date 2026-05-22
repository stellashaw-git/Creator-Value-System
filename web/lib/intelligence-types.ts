/** Shared intelligence types (no dataset imports — avoids circular deps). */

export interface UserWorkflow {
  saved: boolean;
  shortlisted: boolean;
  contacted: boolean;
  campaign_launched: boolean;
}

export type OutcomeStatus = "strong" | "ok" | "weak" | "unknown";

export type BrandCategoryTag =
  | "Beauty"
  | "Fashion"
  | "Tech"
  | "Luxury"
  | "Fitness"
  | "Food"
  | "Other";

export const BRAND_CATEGORY_TAGS: BrandCategoryTag[] = [
  "Beauty",
  "Fashion",
  "Tech",
  "Luxury",
  "Fitness",
  "Food",
  "Other",
];

export type CampaignGoal =
  | "Awareness"
  | "Conversion"
  | "UGC"
  | "Product Launch"
  | "Community Growth";

export const CAMPAIGN_GOALS: CampaignGoal[] = [
  "Awareness",
  "Conversion",
  "UGC",
  "Product Launch",
  "Community Growth",
];

export const DEFAULT_USER_WORKFLOW: UserWorkflow = {
  saved: true,
  shortlisted: false,
  contacted: false,
  campaign_launched: false,
};

export interface CampaignContext {
  brand_category?: string;
  campaign_goal?: CampaignGoal;
}
