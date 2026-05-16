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
  | "High traffic, weak monetization"
  | "Low traffic, strong potential";
export type Action = "Sign" | "Pilot test" | "Monitor" | "Pass";
export type Decision = "Strong Candidate" | "Watchlist" | "Not Recommended";
export type DecisionConfidence = "High" | "Medium" | "Low";
export type ActionPriority = "now" | "next" | "watch";

export interface AnalyzeInput {
  name: string;
  platform: Platform;
  niche: Niche;
  followers: number;
  avgViews: number;
  engagementRate: number;
  growthRate30d: number;
  comments: string[];
  brandCategory?: string;
}

export interface CommentIntent {
  total: number;
  purchasePct: number;
  curiosityPct: number;
  passivePct: number;
  interpretation: string;
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
  decisionRationale: string;
  decisionConfidence: DecisionConfidence;
  decisionConfidenceReason: string;

  // NEW — Agent outputs
  memo: DecisionMemo;
  outreach: OutreachMessages;
  nextActions: NextAction[];

  // Meta
  mode: "openai" | "rule_based";
}
