/**
 * WorthyIQ — Pure scoring logic + rule-based agent output.
 * Side-effect free. Same function shape used by the API route.
 */

import type {
  Action,
  AnalyzeInput,
  CommentIntent,
  Decision,
  DecisionConfidence,
  DecisionMemo,
  GapState,
  NextAction,
  OutreachMessages,
  Quality,
  Report,
  SectionLine,
  Verdict,
} from "./types";

// ---------- 0. Comment classification ----------

const PURCHASE_PATTERNS = [
  /\blink\b/i, /where (did|do|to|can i)/i, /how (do|can) i (get|buy)/i,
  /price\??/i, /how much/i, /\bcode\b/i, /discount/i, /coupon/i,
  /\bbuy\b/i, /\bsize\??/i, /shipping/i, /\bdrop\b/i, /restock/i,
  /sold out/i, /need this/i, /want this/i, /add to cart/i,
];
const CURIOSITY_PATTERNS = [
  /\?$/, /\bwhy\b/i, /\bhow\b/i, /\bwhen\b/i, /\bwhat\b/i,
  /which one/i, /recommend/i, /any tips/i, /tell me more/i,
];
const PASSIVE_PATTERNS = [
  /^[😍🔥❤️💕✨🥰😘👌🙌💖💯⭐️\s]+$/u,
  /^(love|cute|pretty|gorgeous|stunning|beautiful|amazing|wow|nice|so good)[\s!.]*$/i,
  /^(omg|yes|yas|queen|slay)[\s!.]*$/i,
];

function classify(text: string): "purchase" | "curiosity" | "passive" {
  const t = text.trim();
  if (!t) return "passive";
  if (PURCHASE_PATTERNS.some((re) => re.test(t))) return "purchase";
  if (CURIOSITY_PATTERNS.some((re) => re.test(t))) return "curiosity";
  if (PASSIVE_PATTERNS.some((re) => re.test(t))) return "passive";
  return "passive";
}

function commentIntentAnalysis(comments: string[]): CommentIntent {
  let purchase = 0, curiosity = 0, passive = 0;
  for (const c of comments) {
    const b = classify(c);
    if (b === "purchase") purchase++;
    else if (b === "curiosity") curiosity++;
    else passive++;
  }
  const total = purchase + curiosity + passive;
  if (total === 0) {
    return {
      total: 0,
      purchasePct: 0,
      curiosityPct: 0,
      passivePct: 100,
      interpretation:
        "No comment sample provided — defaulting to passive baseline. Add 10–30 recent comments for a real read.",
    };
  }
  const p = Math.round((purchase / total) * 100);
  const c = Math.round((curiosity / total) * 100);
  const pa = 100 - p - c;

  let interpretation: string;
  if (p >= 20) {
    interpretation = "Audience actively asks to buy — a strong commercial signal brands pay premium for.";
  } else if (p >= 8) {
    interpretation = "Early purchase intent is forming, but not yet the dominant pattern.";
  } else if (c >= 30) {
    interpretation = "Audience is curious but not buying — high engagement, weak conversion language.";
  } else {
    interpretation = "Audience is largely passive — engagement is decorative rather than commercial.";
  }
  return { total, purchasePct: p, curiosityPct: c, passivePct: pa, interpretation };
}

// ---------- 1–4. Pillar scores (0–100) ----------

function engagementScore(er: number, avgViews: number, followers: number): number {
  const erScore = Math.min(100, (er / 0.08) * 100);
  const vtr = followers > 0 ? avgViews / followers : 0;
  const vtrScore = Math.min(100, (vtr / 0.4) * 100);
  return Math.round(erScore * 0.75 + vtrScore * 0.25);
}

function reachScore(followers: number, avgViews: number): number {
  const f = Math.max(1, followers);
  const v = Math.max(1, avgViews);
  const fScore = Math.min(100, (Math.log10(f) - 2) * 20);
  const vScore = Math.min(100, (Math.log10(v) - 1.5) * 22);
  return Math.round(Math.max(0, fScore * 0.6 + vScore * 0.4));
}

function growthScore(rate: number): number {
  const score = 20 + Math.min(80, (rate / 0.25) * 80);
  return Math.round(Math.max(0, Math.min(100, score)));
}

function intentScore(intent: CommentIntent): number {
  if (intent.total === 0) return 25;
  const p = intent.purchasePct;
  const c = intent.curiosityPct;
  return Math.round(Math.min(100, p * 3 + c * 0.6));
}

// ---------- 5. Snapshot verdict lines ----------

function monetizationVerdict(overall: number, intent: number, reach: number): SectionLine<Verdict> {
  if (overall >= 70 && intent >= 60) {
    return { label: "High", detail: "Conversion-grade audience with meaningful reach — paid-deal-ready." };
  }
  if (reach >= 70 && intent < 40) {
    return { label: "Low", detail: "Traffic without intent — brands will price reach only, not conversion." };
  }
  if (overall >= 50) {
    return { label: "Medium", detail: "Solid engagement, mixed buying intent — pilot before scaling spend." };
  }
  return { label: "Low", detail: "Neither reach nor intent is strong enough to justify paid placements yet." };
}

function growthSignal(growth: number, rate: number): SectionLine<Quality> {
  if (growth >= 75) return { label: "Strong", detail: `+${Math.round(rate * 100)}% in 30 days — clear upward momentum.` };
  if (growth >= 45) return { label: "Moderate", detail: `+${Math.round(rate * 100)}% in 30 days — steady, not breakout.` };
  return { label: "Weak", detail: `+${Math.round(rate * 100)}% in 30 days — momentum has stalled.` };
}

function engagementQuality(engagement: number, er: number): SectionLine<Quality> {
  const erPct = (er * 100).toFixed(1);
  if (engagement >= 70) return { label: "Strong", detail: `${erPct}% ER — audience is actively responding, not just watching.` };
  if (engagement >= 40) return { label: "Average", detail: `${erPct}% ER — engagement is in the normal band for this tier.` };
  return { label: "Weak", detail: `${erPct}% ER — interactions are well below what brands expect at this scale.` };
}

function trafficVsMonetizationGap(reach: number, intent: number): SectionLine<GapState> {
  if (reach >= 60 && intent >= 60) return { label: "Strong monetization", detail: "Reach and buying intent both present — engagement supports conversion." };
  if (reach >= 60 && intent < 40) return { label: "High traffic, weak monetization", detail: "Audience size is real, but commercial language is missing — common aesthetic-account trap." };
  if (reach < 40 && intent >= 60) return { label: "Low traffic, strong potential", detail: "Small but commercially-minded audience — punches above their follower count." };
  return { label: "Balanced", detail: "Reach and intent are roughly aligned at the same tier — no major mismatch." };
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

function brandFit(niche: string, intent: number, reach: number, brandCategory?: string): Report["brandFit"] {
  const base = intent * 0.6 + reach * 0.4;
  if (!brandCategory || !brandCategory.trim()) {
    return { score: Math.round(base), detail: "Generic fit based on niche + commercial signal. Add a brand category for a tighter read." };
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

function finalDecision(overall: number, engagement: number, growth: number, intent: number): { decision: Decision; rationale: string } {
  const strong = [engagement, growth, intent].filter((s) => s >= 65).length;
  if (overall >= 70 && strong >= 2) {
    return {
      decision: "Strong Candidate",
      rationale: "Multiple commercial pillars are strong simultaneously — this is the profile that delivers measurable campaign ROI.",
    };
  }
  if (overall >= 45) {
    return {
      decision: "Watchlist",
      rationale: "Mixed signal — one or two pillars are working, others lag. Worth tracking, not committing campaign budget yet.",
    };
  }
  return {
    decision: "Not Recommended",
    rationale: "Pillars are weak across the board. Allocating campaign budget here would be reach-only spend with no conversion path.",
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

  // No sample = inherent uncertainty on the intent dimension.
  if (commentTotal === 0) {
    return {
      confidence: "Low",
      reason:
        "Confidence is capped — no comment sample was provided, so audience intent is inferred from a baseline, not measured.",
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

  const erPct = (input.engagementRate * 100).toFixed(1);
  const growthPct = Math.round(input.growthRate30d * 100);

  // Executive summary
  let executiveSummary: string;
  if (decision === "Strong Candidate") {
    executiveSummary = `${input.name} is a ${followersK}-follower ${input.niche.toLowerCase()} creator on ${input.platform} with ${erPct}% engagement and +${growthPct}% 30-day growth. Pillar scores converge on commercial readiness — this is a sign-now profile, not a watchlist.`;
  } else if (decision === "Watchlist") {
    executiveSummary = `${input.name} is a ${followersK}-follower ${input.niche.toLowerCase()} creator on ${input.platform} with ${erPct}% engagement and +${growthPct}% 30-day growth. Signal is mixed — one or two pillars are working, but commercial conversion isn't proven yet.`;
  } else {
    executiveSummary = `${input.name} is a ${followersK}-follower ${input.niche.toLowerCase()} creator on ${input.platform} with ${erPct}% engagement. Pillar scores are weak across reach, intent, or growth — partnership economics don't pencil out at current signal.`;
  }

  // Why this creator matters
  const audienceShape = pillars.intent >= 60
    ? "audiences that already speak in purchase language"
    : pillars.engagement >= 60
      ? "engaged communities that respond, not just watch"
      : "a recognizable presence in the niche";
  const whyMatters = `${input.niche} creators with ${audienceShape} are the shortest path to brand-paid conversion. ${input.brandCategory ? `For ${input.brandCategory} brands specifically, the niche overlap is a natural anchor.` : "Niche fit is more durable than reach, and this profile is anchored in a real vertical."}`;

  // Commercial upside
  const upsideDrivers: string[] = [];
  if (pillars.intent >= 60) upsideDrivers.push(`${commentIntent.purchasePct}% of comments already carry purchase language`);
  if (pillars.engagement >= 60) upsideDrivers.push(`${erPct}% engagement materially exceeds the tier baseline`);
  if (pillars.growth >= 60) upsideDrivers.push(`+${growthPct}% 30-day growth widens the audience ceiling fast`);
  if (brandFitScore >= 60) upsideDrivers.push(`${brandFitScore}/100 brand-fit score signals a natural commercial alignment`);
  const commercialUpside = upsideDrivers.length > 0
    ? `The commercial upside concentrates in ${upsideDrivers.length} dimension${upsideDrivers.length > 1 ? "s" : ""}: ${upsideDrivers.join("; ")}. Together, these are the levers brands price into deal value.`
    : `Commercial upside is muted at the moment — the standout pillars haven't separated from the tier baseline. Watch the next 30 days for one dimension to break out.`;

  // Audience signal
  const audienceSignal = commentIntent.total > 0
    ? `Audience signal reads as: ${commentIntent.purchasePct}% purchase intent · ${commentIntent.curiosityPct}% curiosity · ${commentIntent.passivePct}% passive. ${commentIntent.interpretation}`
    : `Audience signal is unread — no comments were sampled. Add 15–30 recent comments to convert this from a directional estimate to a real read.`;

  // Monetization gap
  let monetizationGap: string;
  if (gap === "Strong monetization") {
    monetizationGap = "No structural gap to call out — reach and intent are both present. The remaining lift is packaging: rate card, deck, and a tighter brand-side pitch.";
  } else if (gap === "High traffic, weak monetization") {
    monetizationGap = "The gap is conversion language. Reach is real, but comments don't ask to buy — meaning a brand pays for impressions, not action. Fixing this is the #1 lever for deal value.";
  } else if (gap === "Low traffic, strong potential") {
    monetizationGap = "The gap is scale. Commercial language is already strong, but audience size limits the absolute deal ceiling. Compound the existing intent into reach to unlock the next tier of pricing.";
  } else {
    monetizationGap = "The gap is balance. Reach and intent sit at the same tier — fine, but unremarkable. Without a standout dimension, deal negotiations default to tier median.";
  }

  // Risk factors
  const risks: string[] = [];
  if (pillars.engagement < 40) risks.push("engagement quality is below the tier baseline");
  if (pillars.growth < 40) risks.push("growth has stalled in the last 30 days");
  if (pillars.intent < 40) risks.push("comment intent is decorative rather than commercial");
  if (commentIntent.total === 0) risks.push("no audience sample was provided");
  if (input.brandCategory && brandFitScore < 50) risks.push(`${input.brandCategory} sits outside the natural niche`);
  const riskFactors = risks.length > 0
    ? `Key risks to flag: ${risks.join("; ")}. Each is recoverable, but they compound when stacked.`
    : `No structural risks at this snapshot — the pillars are aligned. Monitor for over-saturation if sponsored posts begin to outnumber editorial content.`;

  // Recommended strategy
  let recommendedStrategy: string;
  if (decision === "Strong Candidate") {
    recommendedStrategy = `Move to terms within 7 days. Lead with a 2-post paid placement at fixed fee plus an affiliate kicker on the second post — that structure tests the conversion claim without committing to a long-form contract.`;
  } else if (decision === "Watchlist") {
    recommendedStrategy = `Run a low-cost pilot (one paid post with explicit KPIs on saves, replies, and intent-laden comments). Re-evaluate after 30 days. Do not commit to retainer-shaped spend until the conversion side of the funnel is proven.`;
  } else {
    recommendedStrategy = `Pass for now. Re-screen in 60 days only if 30-day growth crosses 10% AND engagement quality moves above the tier baseline. Don't spend reach-only budget chasing this profile today.`;
  }

  return {
    executiveSummary,
    whyMatters,
    commercialUpside,
    audienceSignal,
    monetizationGap,
    riskFactors,
    recommendedStrategy,
  };
}

function buildOutreach(input: AnalyzeInput, decision: Decision): OutreachMessages {
  const name = input.name;
  const niche = input.niche.toLowerCase();
  const followersK = input.followers >= 1_000_000
    ? `${(input.followers / 1_000_000).toFixed(1)}M`
    : `${Math.round(input.followers / 1000)}K`;
  const erPct = (input.engagementRate * 100).toFixed(1);
  const category = input.brandCategory || `${input.niche}-adjacent`;

  const brand = `Hi ${name},

I've been watching your ${niche} content — your ${erPct}% engagement rate stands out at the ${followersK} tier, and the audience reads as commercially engaged.

We're a ${category} brand looking for 2–3 creators to run a paid product-fit test next quarter. Fixed fee, two posts, clear KPIs on saves and comment intent. No long contract.

Open to a 15-minute intro this week?

— [Your name]`;

  const mcn = `Hi ${name},

Quick note from [MCN Name]. Your trajectory in ${niche} (${followersK} followers, +${Math.round(input.growthRate30d * 100)}% in 30 days) puts you in the bracket we typically sign for representation.

What we offer: pre-vetted brand deals, rate-card upgrades, contract review, and access to our talent network. We earn only when you do — no upfront commitments.

Would it be useful to compare what you're seeing in inbound deals vs. our current market rate for your tier?

— [Your name]`;

  const warmDm = `hey ${name} — ${niche} content has been on my radar lately. the ${erPct}% engagement is honestly rare at your size.

quick question: are you fielding brand inquiries directly right now, or going through someone? happy to share what i'm seeing on rate ranges for your tier if useful.

— [Your name]`;

  if (decision === "Not Recommended") {
    // Soften the brand outreach to feel honest, not over-sold
    return {
      brand: `Hi ${name},

I've enjoyed your ${niche} content. Honest read: we typically wait for one of (a) engagement > 4% (b) +10% 30-day growth (c) clear purchase intent in comments before we commit paid budget.

Worth staying in touch — happy to re-engage when those signals shift. In the meantime, if you have a recent campaign performance recap I should look at, that would change the picture.

— [Your name]`,
      mcn, warmDm,
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
  const commentIntent = commentIntentAnalysis(input.comments);
  const engagement = engagementScore(input.engagementRate, input.avgViews, input.followers);
  const reach = reachScore(input.followers, input.avgViews);
  const growth = growthScore(input.growthRate30d);
  const intent = intentScore(commentIntent);

  const overallScore = Math.round(
    engagement * 0.35 + reach * 0.25 + growth * 0.25 + intent * 0.15
  );

  const monetization = monetizationVerdict(overallScore, intent, reach);
  const growthSec = growthSignal(growth, input.growthRate30d);
  const engagementSec = engagementQuality(engagement, input.engagementRate);
  const gap = trafficVsMonetizationGap(reach, intent);
  const fit = brandFit(input.niche, intent, reach, input.brandCategory);
  const { decision, rationale } = finalDecision(overallScore, engagement, growth, intent);
  const { confidence, reason: confidenceReason } = decisionConfidence(
    decision,
    [engagement, reach, growth, intent],
    commentIntent.total
  );
  const action = recommendedAction(decision, growth);

  const memo = buildMemo({
    input,
    overall: overallScore,
    pillars: { engagement, reach, growth, intent },
    commentIntent,
    decision,
    gap: gap.label,
    brandFitScore: fit.score,
  });
  const outreach = buildOutreach(input, decision);
  const nextActions = buildNextActions(decision, growth, intent, input.comments.length > 0);

  return {
    input,
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
    decisionRationale: rationale,
    decisionConfidence: confidence,
    decisionConfidenceReason: confidenceReason,
    memo,
    outreach,
    nextActions,
    mode,
  };
}
