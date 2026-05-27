import OpenAI from "openai";
import type { NextAction, Report } from "./types";
import { isEngagementKnown, isGrowthKnown } from "./scoring";

const SYSTEM =
  "You are the evaluation engine of WorthyIQ — a Creator Intelligence Platform used by brands running " +
  "influencer marketing campaigns and by MCN agencies matching creators with brands. Your output supports " +
  "campaign-budget decisions. You write like a marketing-investment analyst briefing a deal team — clear, " +
  "business-grade English, but appropriately uncertain when evidence is limited. You never reference yourself " +
  "as 'AI' or 'the model'. You avoid influencer-marketing fluff (no 'authentic', no 'leverage', no 'good engagement'). " +
  "You reason from uploaded screenshots and samples only — use phrasing like 'uploaded comments suggest', " +
  "'visible signals indicate', 'based on the uploaded sample', and 'evidence is limited'. Never state absolute " +
  "truths about audience purchase behavior. Separate observed signals from certainty.";

interface AgentJSON {
  memo: {
    executiveSummary: string;
    whyMatters: string;
    commercialUpside: string;
    audienceSignal: string;
    monetizationGap: string;
    riskFactors: string;
    recommendedStrategy: string;
  };
  decisionRationale: string;
  outreach: {
    brand: string;
    mcn: string;
    warmDm: string;
  };
  nextActions: Array<{
    title: string;
    detail: string;
    priority: "now" | "next" | "watch";
  }>;
}

function userPrompt(r: Report): string {
  const i = r.input;
  return `Generate the WorthyIQ Creator Opportunity Brief for the creator below. Return JSON only.

PROFILE
- Name: ${i.name}
- Platform: ${i.platform}
- Niche: ${i.niche}
- Followers: ${i.followers.toLocaleString()}
- Avg views: ${i.avgViews.toLocaleString()}
- Engagement rate: ${
    isEngagementKnown(i)
      ? `${(i.engagementRate! * 100).toFixed(1)}%`
      : "not auto-calculated (avg likes + avg comments with followers required)"
  }
- 30-day growth: ${
    isGrowthKnown(i)
      ? `${(i.growthRate30d! * 100).toFixed(1)}%`
      : "unknown (followers ~30 days ago optional field not provided)"
  }
- Brand category (optional): ${i.brandCategory || "—"}

PILLAR SCORES (0–100)
- Engagement: ${r.pillarScores.engagement}
- Reach: ${r.pillarScores.reach}
- Growth: ${r.pillarScores.growth}
- Intent: ${r.pillarScores.intent}
- Overall: ${r.overallScore}

DERIVED SIGNALS
- Monetization verdict: ${r.monetization.label}
- Comment sample (${r.commentIntent.total} lines): ${r.commentIntent.commercialSummary} (purchase ${r.commentIntent.purchasePct}%, product curiosity ${r.commentIntent.productCuriosityPct}%, style replication ${r.commentIntent.styleReplicationPct}%, passive admiration ${r.commentIntent.passivePct}%)
- Traffic vs monetization gap: ${r.gap.label}
- Brand fit score: ${r.brandFit.score}/100
- Final decision: ${r.decision}
- Decision confidence: ${r.decisionConfidence}

Return JSON with this exact shape:
{
  "memo": {
    "executiveSummary": "1-2 short sentences. Verdict + key uploaded signal. Acknowledge limited evidence.",
    "whyMatters": "1-2 sentences. Why niche/category context may matter — probabilistic tone.",
    "commercialUpside": "1-2 sentences. Possible upside from uploads, not guaranteed outcomes.",
    "audienceSignal": "1-2 sentences. What uploaded comments/engagement may suggest for conversion.",
    "monetizationGap": "1-2 sentences. Biggest gap between visible signals and premium rates.",
    "riskFactors": "1-2 sentences. Honest caveats given partial screenshot evidence.",
    "recommendedStrategy": "1-2 sentences. Practical next step — pilot, watch, or pass."
  },
  "decisionRationale": "1 sentence. Plain business reason for the final decision (${r.decision}).",
  "outreach": {
    "brand": "3-5 line outreach DM from a brand. Use the creator's name. Mention ONE concrete stat. Propose a specific test structure. Sign with '— [Your name]'.",
    "mcn": "3-5 line outreach from an MCN/talent agency. Lead with what they offer (deals, rate cards). Sign with '— [Your name]'.",
    "warmDm": "2-3 line informal warm DM. Lowercase, conversational. Ask one specific question."
  },
  "nextActions": [
    {"title": "≤6 words", "detail": "1 sentence specific action", "priority": "now"},
    {"title": "≤6 words", "detail": "1 sentence specific action", "priority": "next"},
    {"title": "≤6 words", "detail": "1 sentence specific action", "priority": "watch"}
  ]
}

VOICE RULES
- Investment-analyst tone with calibrated uncertainty.
- Prefer: "uploaded comments suggest", "visible signals indicate", "based on the sample", "evidence is limited", "may not represent broader behavior".
- Avoid absolute claims: never say "has no purchase intent", "will not convert", "audience shows no intent to buy".
- Keep each memo field concise — no essay paragraphs.
- Avoid: "leverage", "synergy", "optimize content", "improve engagement", "be authentic", "build community".
- Outreach messages should feel hand-typed; include one specific number where natural.`;
}

export async function enhanceWithAI(report: Report): Promise<Report> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return report;

  try {
    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const resp = await client.chat.completions.create({
      model,
      temperature: 0.55,
      max_tokens: 1600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt(report) },
      ],
    });
    const text = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text) as Partial<AgentJSON>;

    // Sanity check — fall back to rule-based on missing memo
    if (!parsed.memo || !parsed.outreach || !parsed.nextActions) return report;

    const m = parsed.memo;
    const o = parsed.outreach;
    const nextActions: NextAction[] = (parsed.nextActions || [])
      .slice(0, 3)
      .map((a) => ({
        title: a.title || "Action",
        detail: a.detail || "",
        priority: (["now", "next", "watch"].includes(a.priority) ? a.priority : "next") as NextAction["priority"],
      }));

    return {
      ...report,
      memo: {
        executiveSummary: m.executiveSummary || report.memo.executiveSummary,
        whyMatters: m.whyMatters || report.memo.whyMatters,
        commercialUpside: m.commercialUpside || report.memo.commercialUpside,
        audienceSignal: m.audienceSignal || report.memo.audienceSignal,
        monetizationGap: m.monetizationGap || report.memo.monetizationGap,
        riskFactors: m.riskFactors || report.memo.riskFactors,
        recommendedStrategy: m.recommendedStrategy || report.memo.recommendedStrategy,
      },
      decisionRationale: parsed.decisionRationale || report.decisionRationale,
      outreach: {
        brand: o.brand || report.outreach.brand,
        mcn: o.mcn || report.outreach.mcn,
        warmDm: o.warmDm || report.outreach.warmDm,
      },
      nextActions: nextActions.length === 3 ? nextActions : report.nextActions,
      mode: "openai",
    };
  } catch {
    return report;
  }
}
