/**
 * Screenshot extraction — types + mock data for the no-API-key path.
 *
 * Numbers are normalized: "12.5K" → 12500, "1.2M" → 1200000.
 * engagement_rate and growth_30d are PERCENTAGES (e.g. 4.6, not 0.046).
 */

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ExtractedSignals {
  creator_name: string | null;
  platform: string | null;
  bio: string | null;
  niche: string | null;
  followers: number | null;
  following: number | null;
  subscribers: number | null;
  average_views: number | null;
  likes: number | null;
  comments_count: number | null;
  shares: number | null;
  engagement_rate: number | null;
  growth_30d: number | null;
  sample_comments: string[];
  purchase_intent_comments: string[];
  curiosity_comments: string[];
  generic_comments: string[];
  visible_post_signals: string[];
  confidence: Partial<Record<string, ConfidenceLevel>>;
  missing_fields: string[];
  notes: string;
}

export type ExtractionMode = "openai" | "mock" | "mock_fallback";

export interface ExtractionResponse {
  extraction: ExtractedSignals;
  mode: ExtractionMode;
  warning?: string;
  images_received?: number;
}

export const EMPTY_EXTRACTION: ExtractedSignals = {
  creator_name: null,
  platform: null,
  bio: null,
  niche: null,
  followers: null,
  following: null,
  subscribers: null,
  average_views: null,
  likes: null,
  comments_count: null,
  shares: null,
  engagement_rate: null,
  growth_30d: null,
  sample_comments: [],
  purchase_intent_comments: [],
  curiosity_comments: [],
  generic_comments: [],
  visible_post_signals: [],
  confidence: {},
  missing_fields: [],
  notes: "",
};

export const MOCK_EXTRACTION: ExtractedSignals = {
  creator_name: "Maya Ortega",
  platform: "Instagram",
  bio: "fitness coach · supplements + form check",
  niche: "Fitness",
  followers: 82400,
  following: 1240,
  subscribers: null,
  average_views: 24500,
  likes: 3850,
  comments_count: 142,
  shares: null,
  engagement_rate: 4.6,
  growth_30d: 11,
  sample_comments: [
    "where did you get this?",
    "link pls 🙏",
    "price?",
    "code please",
    "is this on amazon?",
    "which one do you recommend?",
    "love this vibe",
    "🔥🔥🔥",
    "stunning",
    "size?",
  ],
  purchase_intent_comments: [
    "where did you get this?",
    "link pls 🙏",
    "price?",
    "code please",
    "is this on amazon?",
    "size?",
  ],
  curiosity_comments: ["which one do you recommend?", "what brand?"],
  generic_comments: ["love this vibe", "🔥🔥🔥", "stunning", "yes!"],
  visible_post_signals: [
    "Profile: 82.4K followers · 1.2K following",
    "Most recent post: 24.5K views · 3,850 likes · 142 comments",
    "Bio mentions fitness coaching + supplements affiliate",
  ],
  confidence: {
    creator_name: "high",
    platform: "high",
    followers: "high",
    average_views: "medium",
    comments: "medium",
    engagement_rate: "medium",
    growth_30d: "low",
    niche: "high",
  },
  missing_fields: ["growth_30d (estimated)", "subscribers", "shares"],
  notes:
    "Demo mock — no OPENAI_API_KEY set. Set the key in web/.env.local for live vision extraction.",
};
