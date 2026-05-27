/**
 * Commercial intent taxonomy from uploaded comment samples (scoring layer only).
 * Does not touch extraction, OCR, or screenshot pipelines.
 */

import type { CommentIntent, IntentConfidence } from "./types";

export type CommentIntentTier =
  | "purchase"
  | "product_curiosity"
  | "style_replication"
  | "passive";

/** Strong purchase intent — highest weight */
const PURCHASE_PATTERNS = [
  /\bwhere can i buy\b/i,
  /\bwhere (did|do|to|can i) (get|buy)\b/i,
  /\bhow (do|can) i (get|buy)\b/i,
  /\blink\??\s*$/i,
  /\blink\b/i,
  /\bprice\??\b/i,
  /\bhow much\b/i,
  /\bcode\??\b/i,
  /\bdiscount\b/i,
  /\bcoupon\b/i,
  /\bbuy\b/i,
  /\bsize\??\b/i,
  /\bshipping\b/i,
  /\bdrop\b/i,
  /\brestock\b/i,
  /\bsold out\b/i,
  /\bneed this\b/i,
  /\bwant this\b/i,
  /\badd to cart\b/i,
  /\bordering\b/i,
  /\bwhat brand\b/i,
  /\bwhich brand\b/i,
  /\bbrand is this\b/i,
  /\bshop this\b/i,
  /\bcheckout\b/i,
];

/** Product curiosity — commercially positive, not passive */
const PRODUCT_CURIOSITY_PATTERNS = [
  /\bwhere is this\b/i,
  /\bwhere('s| is) (this|that|the)\b/i,
  /\bwhere.*\bfrom\??\b/i,
  /\bwhat (shoes|dress|bag|lipstick|shade|perfume|jacket|top|pants|skirt)\b/i,
  /\bwhat (camera|lens|phone)\b/i,
  /\bwhat shade\b/i,
  /\bwhat color\b/i,
  /\bis this from\b/i,
  /\bfrom (zara|h&m|shein|amazon|sephora|ulta)\b/i,
  /\bobsessed with (this|the|your)\b/i,
  /\bneed to know what\b/i,
  /\bwhat are you wearing\b/i,
  /\bwhat did you use\b/i,
  /\bproduct (name|link)\b/i,
  /\bwhat's the name of\b/i,
  /\bwho makes this\b/i,
  /\bwhere did you get (this|that|the)\b/i,
];

/** Style / replication intent — medium positive */
const STYLE_REPLICATION_PATTERNS = [
  /\brecreate\b/i,
  /\bsaving this (outfit|look|fit)\b/i,
  /\bsaved this\b/i,
  /\btrying this (hairstyle|look|outfit)\b/i,
  /\bdoing this next week\b/i,
  /\bcopying this\b/i,
  /\bsteal(ing)? this look\b/i,
  /\boutfit inspo\b/i,
  /\binspo\b/i,
  /\bremaking this\b/i,
];

/** Passive admiration only — low positive, not negative */
const PASSIVE_PATTERNS = [
  /^[😍🔥❤️💕✨🥰😘👌🙌💖💯⭐️👑\s]+$/u,
  /^(so cute|so pretty|so beautiful|so good)[\s!.]*$/i,
  /^(love|cute|pretty|gorgeous|stunning|beautiful|amazing|wow|nice)[\s!.]*$/i,
  /^(omg|yes|yas|queen|slay|icon)[\s!.]*$/i,
  /^(fire|goals|perfection)[\s!.]*$/i,
];

const PRODUCT_QUESTION_HINT =
  /\?|^(where|what|which|who|how|is this|are these)\b/i;

const PRODUCT_NOUN_HINT =
  /\b(dress|shoes|outfit|bag|lipstick|shade|brand|product|top|skirt|pants|jacket|earrings|necklace|ring|sneakers|heels)\b/i;

export function classifyCommentIntent(text: string): CommentIntentTier {
  const t = text.trim();
  if (!t) return "passive";

  if (PURCHASE_PATTERNS.some((re) => re.test(t))) return "purchase";
  if (PRODUCT_CURIOSITY_PATTERNS.some((re) => re.test(t))) return "product_curiosity";
  if (STYLE_REPLICATION_PATTERNS.some((re) => re.test(t))) return "style_replication";
  if (PASSIVE_PATTERNS.some((re) => re.test(t))) return "passive";

  if (PRODUCT_QUESTION_HINT.test(t) && PRODUCT_NOUN_HINT.test(t)) {
    return "product_curiosity";
  }
  if (PRODUCT_QUESTION_HINT.test(t) && /\b(this|that|these|those)\b/i.test(t)) {
    return "product_curiosity";
  }
  if (/\bwhere\b/i.test(t) && /\bfrom\??\b/i.test(t)) {
    return "product_curiosity";
  }

  if (t.length <= 24 && PASSIVE_PATTERNS.some((re) => re.test(t))) {
    return "passive";
  }

  if (PRODUCT_QUESTION_HINT.test(t)) return "product_curiosity";

  return "passive";
}

function intentConfidenceFromSampleSize(sampleSize: number): IntentConfidence {
  if (sampleSize >= 30) return "high";
  if (sampleSize >= 10) return "medium";
  return "low";
}

function pct(count: number, sampleSize: number): number {
  if (sampleSize === 0) return 0;
  return Math.round((count / sampleSize) * 100);
}

/** Combined commercial tiers in sample (excludes passive admiration). */
export function commercialSignalPct(intent: CommentIntent): number {
  return (
    intent.purchasePct +
    intent.productCuriosityPct +
    intent.styleReplicationPct
  );
}

export function buildCommercialSummary(
  sampleSize: number,
  purchasePct: number,
  productCuriosityPct: number,
  styleReplicationPct: number,
  passivePct: number,
  intentConfidence: IntentConfidence
): string {
  if (sampleSize === 0) {
    return "No comment sample in uploads — commercial intent is unmeasured, not zero.";
  }

  const commercial = purchasePct + productCuriosityPct + styleReplicationPct;

  if (intentConfidence === "low") {
    if (commercial >= 15 || productCuriosityPct >= 10) {
      return "Limited comment sample — visible lines suggest product curiosity and early commercial interest; add more comment screenshots to strengthen the read.";
    }
    return "Limited comment sample — too few lines for a firm commercial read; this is not evidence of absent purchase interest.";
  }

  if (purchasePct >= 20) {
    return "Visible comments show strong purchase intent and product curiosity in the uploaded sample.";
  }
  if (purchasePct >= 8) {
    return "Visible comments show purchase-oriented language plus product curiosity in the uploaded sample.";
  }
  if (productCuriosityPct >= 25 || (commercial >= 35 && productCuriosityPct >= 15)) {
    return "Visible comments show moderate product curiosity and commercial interest.";
  }
  if (styleReplicationPct >= 20) {
    return "Visible comments show style and replication intent — audiences are saving looks and planning to recreate them.";
  }
  if (commercial >= 20) {
    return "Visible comments show mixed commercial interest (product questions and style intent) in the uploaded sample.";
  }
  if (passivePct >= 60 && commercial < 15) {
    return "Visible comments skew toward admiration in the sample; limited product or purchase language in uploaded lines.";
  }
  return "Visible comments show light commercial signals in the uploaded sample — mostly admiration with some product curiosity.";
}

function buildInterpretation(
  sampleSize: number,
  purchasePct: number,
  productCuriosityPct: number,
  styleReplicationPct: number,
  passivePct: number,
  intentConfidence: IntentConfidence
): string {
  if (sampleSize === 0) {
    return "No comment sample uploaded — commercial intent is unmeasured (missing evidence, not negative evidence). Engagement and reach signals carry more weight in this evaluation.";
  }

  if (intentConfidence === "low") {
    const commercial = purchasePct + productCuriosityPct + styleReplicationPct;
    if (commercial >= 12) {
      return `Small uploaded sample (${sampleSize} lines) — product curiosity and commercial interest appear present; treat percentages as directional, not definitive.`;
    }
    return `Small uploaded sample (${sampleSize} lines) — under-sampled for conversion conclusions; absence of strong purchase language is not proof of zero commercial interest.`;
  }

  if (purchasePct >= 20) {
    return "Uploaded sample includes recurring strong purchase-intent language — a positive conversion signal within the visible comment lines.";
  }
  if (productCuriosityPct >= 25) {
    return "Uploaded sample is driven by product curiosity (where-from, what-product questions) — commercially positive for influencer campaigns even without explicit buy language.";
  }
  if (styleReplicationPct >= 20) {
    return "Uploaded sample shows save-and-recreate style intent — positive for consideration and outfit-led partnerships.";
  }
  if (purchasePct + productCuriosityPct >= 25) {
    return "Uploaded sample mixes purchase questions and product curiosity — commercially warmer than passive admiration alone.";
  }
  if (passivePct >= 55) {
    return "Uploaded sample leans admiration-only in visible lines; lighter product curiosity than typical conversion-heavy creators.";
  }
  return "Uploaded sample shows a blend of commercial curiosity and passive engagement in visible comment lines.";
}

/** Analyze uploaded comment lines only (sample-based). */
export function analyzeCommentSample(comments: string[]): CommentIntent {
  const lines = comments.map((c) => c.trim()).filter((c) => c.length > 0);
  const sampleSize = lines.length;

  let purchase = 0;
  let productCuriosity = 0;
  let styleReplication = 0;
  let passive = 0;

  for (const line of lines) {
    const tier = classifyCommentIntent(line);
    if (tier === "purchase") purchase++;
    else if (tier === "product_curiosity") productCuriosity++;
    else if (tier === "style_replication") styleReplication++;
    else passive++;
  }

  const intentConfidence = intentConfidenceFromSampleSize(sampleSize);

  if (sampleSize === 0) {
    return {
      total: 0,
      purchasePct: 0,
      productCuriosityPct: 0,
      styleReplicationPct: 0,
      passivePct: 100,
      curiosityPct: 0,
      interpretation:
        "No comment sample uploaded — commercial intent is unmeasured (missing evidence, not negative evidence). Engagement and reach signals carry more weight in this evaluation.",
      commercialSummary:
        "No comment sample in uploads — commercial intent is unmeasured, not zero.",
      intentConfidence: "low",
    };
  }

  const purchasePct = pct(purchase, sampleSize);
  const productCuriosityPct = pct(productCuriosity, sampleSize);
  const styleReplicationPct = pct(styleReplication, sampleSize);
  const passivePct = Math.max(0, 100 - purchasePct - productCuriosityPct - styleReplicationPct);

  const interpretation = buildInterpretation(
    sampleSize,
    purchasePct,
    productCuriosityPct,
    styleReplicationPct,
    passivePct,
    intentConfidence
  );
  const commercialSummary = buildCommercialSummary(
    sampleSize,
    purchasePct,
    productCuriosityPct,
    styleReplicationPct,
    passivePct,
    intentConfidence
  );

  return {
    total: sampleSize,
    purchasePct,
    productCuriosityPct,
    styleReplicationPct,
    passivePct,
    curiosityPct: productCuriosityPct,
    interpretation,
    commercialSummary,
    intentConfidence,
  };
}

/** Weighted intent pillar score from sample tiers. */
export function intentScoreFromSample(intent: CommentIntent): number {
  const raw =
    intent.total === 0
      ? 50
      : Math.min(
          100,
          intent.purchasePct * 3 +
            intent.productCuriosityPct * 1.2 +
            intent.styleReplicationPct * 0.7 +
            intent.passivePct * 0.15
        );

  if (intent.intentConfidence === "low") {
    return Math.round(50 + (raw - 50) * 0.35);
  }
  if (intent.intentConfidence === "medium") {
    return Math.round(50 + (raw - 50) * 0.65);
  }
  return Math.round(raw);
}
