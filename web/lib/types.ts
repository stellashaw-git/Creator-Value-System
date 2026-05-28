import type { CampaignGoal } from "./intelligence-types";
import type { RecentPostMetricRow } from "./recent-post-aggregate";

export type Platform =
  | "Instagram"
  | "TikTok"
  | "YouTube"
  | "X / Twitter"
  | "Xiaohongshu / RED"
  | "Other";
export type Niche =
  | "Beauty"
  | "Fashion"
  | "Fitness"
  | "Lifestyle"
  | "Luxury"
  | "Tech"
  | "Food"
  | "Gaming"
  | "Other";

export type Verdict = "High" | "Medium" | "Low";
export type Quality = "Strong" | "Moderate" | "Weak" | "Average";
export type GapState =
  | "Strong monetization"
  | "Balanced"
  | "High traffic, under-sampled intent"
  | "High traffic, limited conversion evidence"
  | "Low traffic, strong potential";
export type Action = "Sign" | "Pilot test" | "Monitor" | "Pass";
export type Decision = "Strong Candidate" | "Watchlist" | "Not Recommended";
export type DecisionConfidence = "High" | "Medium" | "Low";
export type ActionPriority = "now" | "next" | "watch";
/** Primary creator role for campaign mix planning (separate from overall score). */
export type RecommendedRole =
  | "Awareness"
  | "Community"
  | "Conversion"
  | "Distribution"
  | "BrandFit";

export interface AnalyzeInput {
  /** Primary creator identifier — typically the visible handle. */
  name: string;
  creatorHandle?: string;
  displayName?: string;
  platform: Platform;
  niche: Niche;
  followers: number;
  avgViews: number;
  /** 0–1 when computed from (averageLikes + averageComments) / followers, or legacy body. Omitted = unknown / not enough data. */
  engagementRate?: number;
  /** Decimal change vs followers 30d ago, e.g. 0.11 = +11%. Omitted = unknown. */
  growthRate30d?: number;
  /** Optional inputs used to derive engagementRate. */
  averageLikes?: number;
  averageComments?: number;
  averageReposts?: number;
  averageShares?: number;
  averageSaves?: number;
  /** Optional; with current followers yields growthRate30d. */
  followers30DaysAgo?: number;
  /** Tags from screenshot upload (Profile, Recent Post, …). */
  screenshotTypesUploaded?: string[];
  /** Auto-suggested labels at upload time (before user edits). */
  screenshotTypesDetected?: string[];
  /** Per-post metrics from Recent Post screenshots (when aggregated). */
  recentPostMetrics?: RecentPostMetricRow[];
  recentPostCount?: number;
  engagementComponentsUsed?: string[];
  detectedPlatform?: string;
  platformConfidence?: "high" | "medium" | "low";
  platformOverride?: string;
  comments: string[];
  /** Brand vertical (optional campaign context). */
  brandCategory?: string;
  /** Optional campaign objective for fit scoring context. */
  campaignGoal?: CampaignGoal;
}

export type IntentConfidence = "low" | "medium" | "high";

export interface CommentIntent {
  /** Number of comment lines in the uploaded sample analyzed */
  total: number;
  /** Strong purchase intent (link, price, buy, brand) */
  purchasePct: number;
  /** Product curiosity — where-from, what product, shade, etc. */
  productCuriosityPct: number;
  /** Style / replication — save outfit, recreate look */
  styleReplicationPct: number;
  /** Passive admiration — low positive, not penalized as negative */
  passivePct: number;
  /** @deprecated alias — equals productCuriosityPct */
  curiosityPct: number;
  interpretation: string;
  /** Sample-based narrative for reports (not "% purchase intent" alone) */
  commercialSummary: string;
  /** Confidence in commercial-intent read from uploaded comment sample size */
  intentConfidence: IntentConfidence;
}

export interface SectionLine<T extends string = string> {
  label: T;
  detail: string;
}

// New: Decision memo (the investor-style narrative)
export interface DecisionMemo {
  executiveSummary: string;
  whyMatters: string;
  commercialUpside: string;
  audienceSignal: string;
  monetizationGap: string;
  riskFactors: string;
  recommendedStrategy: string;
  /** Soft archetype label (wording only — e.g. Awareness Creator) */
  creatorArchetype?: string;
}

// Outreach message templates (brand / MCN / casual warm DM)
export interface OutreachMessages {
  brand: string;
  mcn: string;
  warmDm: string;
}

// New: Action plan items
export interface NextAction {
  title: string;
  detail: string;
  priority: ActionPriority;
}

export interface SignalInsights {
  engagementQuality: string;
  spreadSignal: string;
  repostShareSignal: string;
  dataCompleteness: string;
  /** Concise monetization read for the report header. */
  monetizationSignal: string;
  /** Evidence quality from uploaded screenshots (Low | Moderate | High). */
  evidenceConfidence: string;
  evidenceConfidenceLevel: "Low" | "Moderate" | "High";
  /** Footnote near purchase-intent signals. */
  purchaseIntentNote: string;
  /** Reach / distribution read from followers + views in uploads. */
  reachConfidence?: string;
  reachConfidenceLevel?: "Low" | "Moderate" | "High";
  /** Purchase-intent read from comment sample only. */
  intentConfidenceDetail?: string;
}

export interface Report {
  input: AnalyzeInput;

  // Snapshot pillars
  overallScore: number;
  pillarScores: {
    engagement: number;
    reach: number;
    growth: number;
    intent: number;
  };

  // Compact labeled signals (used in snapshot card)
  monetization: SectionLine<Verdict>;
  growth: SectionLine<Quality>;
  engagement: SectionLine<Quality>;
  commentIntent: CommentIntent;
  gap: SectionLine<GapState>;
  brandFit: { score: number; detail: string; category?: string };
  action: SectionLine<Action>;

  // Final decision
  decision: Decision;
  /** Best-fit role given pillars — not the same as overall score or decision label. */
  recommendedRole: RecommendedRole;
  decisionRationale: string;
  decisionConfidence: DecisionConfidence;
  decisionConfidenceReason: string;

  // NEW — Agent outputs
  memo: DecisionMemo;
  outreach: OutreachMessages;
  nextActions: NextAction[];

  signalInsights?: SignalInsights;

  // Meta
  mode: "openai" | "rule_based";
}
