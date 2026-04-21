"""
Streamlit entrypoint: Solo Creator Monetization Diagnosis (Instagram-first).

Primary questions the output answers:
  1. Why am I not getting better paid brand deals?
  2. Does my audience show buying intent?
  3. What should I change right now?

Manual workflow (no scraping):
  - User pastes 3 recent post/reel links
  - Optionally: follower count, avg views, niche, and recent comments

Run: streamlit run app.py
"""

from __future__ import annotations

import math
import os
import re
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from llm_comment_analysis import analyze_comments_structured
from scoring import add_creator_scores

# ---------- Page ----------
st.set_page_config(page_title="Creator Value Analyzer", layout="wide")

# ---------- Dataset setup (kept from previous app) ----------
DATA_DIR = Path("datasets")
COMMENTS_PATH = DATA_DIR / "comments.csv"

NICHE_FILES = {
    "Beauty": DATA_DIR / "beauty_creators.csv",
    "Fitness": DATA_DIR / "fitness_creators.csv",
    "Lifestyle": DATA_DIR / "lifestyle_creators.csv",
}

REQUIRED_COLS = {
    "username",
    "followers",
    "avg_views",
    "avg_likes",
    "avg_comments",
    "growth_30d",
    "niche",
}


def load_niche_df(label: str) -> pd.DataFrame:
    """Load + score a niche CSV. Falls back to Beauty for 'Other'."""
    key = label if label in NICHE_FILES else "Beauty"
    path = NICHE_FILES[key]
    if not path.exists():
        st.error(f"Missing dataset: {path}")
        st.stop()

    df_raw = pd.read_csv(path)
    missing = REQUIRED_COLS - set(df_raw.columns)
    if missing:
        st.error(f"{path.name} is missing columns: {sorted(missing)}")
        st.stop()

    df = add_creator_scores(df_raw)
    if "rank" not in df.columns:
        df = df.sort_values("final_score", ascending=False).reset_index(drop=True)
        df["rank"] = df.index + 1
    return df


# ---------- Comment classifier (local, rule-based) ----------
PURCHASE_WORDS = (
    "link",
    "buy",
    "where",
    "price",
    "how much",
    "code",
    "discount",
    "shop",
    "dupe",
    "drop",
    "restock",
    "available",
    "shipping",
    "cart",
    "order",
    "sold out",
    "purchase",
    "url",
    "sign up",
    "name of",
    "brand",
)
CURIOSITY_MARKERS = (
    "?",
    "what",
    "which",
    "how",
    "why",
    "can you",
    "is this",
    "tell me",
    "does this",
    "do you",
    "tutorial",
    "review",
    "worth it",
)
PASSIVE_EXAMPLES = {"love", "cute", "pretty", "omg", "wow", "queen", "beautiful", "same"}


def classify_comment(text: str) -> str:
    """Return one of 'purchase' | 'curiosity' | 'passive'."""
    t = text.strip().lower()
    if not t:
        return "passive"
    if any(w in t for w in PURCHASE_WORDS) or "$" in t or "http" in t:
        return "purchase"
    if any(m in t for m in CURIOSITY_MARKERS):
        return "curiosity"
    return "passive"


def split_pasted_comments(raw: str) -> list[str]:
    """Accept newline- or bullet-separated comments. Strip empties."""
    if not raw:
        return []
    lines = re.split(r"[\r\n]+", raw)
    out = []
    for line in lines:
        clean = line.strip().lstrip("-•*").strip()
        if clean:
            out.append(clean)
    return out


def classify_bucket(lines: list[str]) -> dict[str, Any]:
    """Classify a list of comments. Returns counts + samples."""
    buckets = {"purchase": 0, "curiosity": 0, "passive": 0}
    samples: dict[str, list[str]] = {"purchase": [], "curiosity": [], "passive": []}
    for c in lines:
        k = classify_comment(c)
        buckets[k] += 1
        if len(samples[k]) < 3:
            samples[k].append(c)
    total = len(lines)
    return {**buckets, "total": total, "samples": samples}


# ---------- Synthetic row building ----------
def build_user_row(
    followers: float,
    avg_views: float,
    niche: str,
    cohort: pd.DataFrame,
) -> dict[str, Any]:
    """Build a row compatible with add_creator_scores using cohort ratios for missing values."""
    med = cohort.median(numeric_only=True)

    f = float(followers) if followers and followers > 0 else float(med.get("followers", 10000))
    v = float(avg_views) if avg_views and avg_views > 0 else float(med.get("avg_views", 1000))

    like_rate = float(cohort["avg_likes"].sum() / max(cohort["avg_views"].sum(), 1))
    comm_rate = float(cohort["avg_comments"].sum() / max(cohort["avg_views"].sum(), 1))

    return {
        "username": "__you__",
        "followers": f,
        "avg_views": v,
        "avg_likes": v * like_rate,
        "avg_comments": v * comm_rate,
        "growth_30d": float(med.get("growth_30d", 500)),
        "niche": niche,
    }


def score_user_in_cohort(
    user_dict: dict[str, Any],
    cohort: pd.DataFrame,
) -> tuple[pd.Series, pd.DataFrame]:
    """Append user row to cohort and re-score everything (keeps min-max consistent)."""
    base_cols = [c for c in cohort.columns if c in REQUIRED_COLS]
    combined = pd.concat(
        [cohort[base_cols], pd.DataFrame([user_dict])],
        ignore_index=True,
    )
    scored = add_creator_scores(combined)
    row = scored[scored["username"] == "__you__"].iloc[0]
    return row, scored


# ---------- Scoring helpers for the report ----------
#
# Three independent sub-scores → weighted final. Each captures a different axis,
# so identical `final` values are unlikely across different creators.
#
#   intent_score    (0–10)  purchase signal from comments     40% weight
#   structure_score (0–10)  decision / trust content presence 35% weight
#   scale_score     (0–10)  followers + avg_views (log)       25% weight
#
# Expected bands:
#   tiny / beginner  ~1–3
#   growing / mid    ~4–6
#   established      ~7–9+

def _intent_score(cls: dict[str, Any], row: pd.Series, df: pd.DataFrame, comment_ai: dict[str, Any]) -> float:
    total = cls["total"]
    if total > 0:
        ps = cls["purchase"] / total
        score = ps * 30.0
    else:
        label = str(comment_ai.get("purchase_intent", "Low")).strip().lower()
        score = {"high": 6.5, "medium": 4.0, "low": 2.0}.get(label, 2.0)

    er = float(row["engagement_rate"])
    q75 = float(df["engagement_rate"].quantile(0.75))
    med = float(df["engagement_rate"].median())
    if er >= q75:
        score += 1.0
    elif er >= med:
        score += 0.3
    return max(0.0, min(10.0, score))


def _structure_score(cls: dict[str, Any]) -> float:
    """Score decision-content presence using the same bucket math as the content breakdown."""
    total = cls["total"]
    if total > 0:
        pas = cls["passive"] / total
        cs_share = cls["curiosity"] / total
        ps_share = cls["purchase"] / total
        a = pas * 0.90 + 0.08
        t = cs_share * 1.00 + 0.10
        d = ps_share * 1.30 + 0.03
        s = a + t + d
        decision_pct = d / s * 100.0
        trust_pct = t / s * 100.0
    else:
        decision_pct = 5.0
        trust_pct = 25.0
    return max(0.0, min(10.0, decision_pct * 0.22 + trust_pct * 0.06))


def _scale_score(user_followers: float, user_avg_views: float, row: pd.Series) -> float:
    """Log-scaled followers (70%) + avg_views (30%). 100 fol → ~0, 10M → ~10."""
    f = max(float(user_followers) if user_followers else float(row["followers"]), 10.0)
    v = max(float(user_avg_views) if user_avg_views else float(row["avg_views"]), 10.0)
    f_raw = (math.log10(f) - 2.0) * 2.0     # 100→0, 10K→4, 100K→6, 1M→8, 10M→10
    v_raw = (math.log10(v) - 1.5) * 2.2     # ~30→0, ~5K→6, ~500K→~9
    return max(0.0, min(10.0, f_raw * 0.7 + v_raw * 0.3))


def _interpretation(final: float, intent: float, structure: float, scale: float) -> str:
    """One-line read that varies by which component is the bottleneck."""
    if final < 4:
        if scale < 3:
            return "You're under-monetizing — reach is too small to attract real deals yet."
        if structure < 3:
            return "You're under-monetizing — decision content is missing, so brands see no conversion path."
        if intent < 3:
            return "You're under-monetizing — your audience shows no buying signal."
        return "You're under-monetizing across the board — start with decision content this week."
    if final <= 7:
        if intent < 4:
            return "Potential is there — but your audience doesn't ask to buy."
        if structure < 5:
            return "Potential is there — decision content is what's holding you back."
        if scale < 5:
            return "Strong signal — scale is what's capping your rates."
        return "Potential is there — packaging (CTAs, offers) is the missing piece."
    if structure >= 7 and intent >= 7:
        return "Strong monetization potential — you're leaving money on the table without clear offers."
    if scale >= 7:
        return "Strong monetization potential — sharpen decision content to charge premium rates."
    return "Strong monetization potential — double down on decision content; scale will follow rates."


def compute_scores(
    row: pd.Series,
    df: pd.DataFrame,
    cls: dict[str, Any],
    comment_ai: dict[str, Any],
    user_followers: float,
    user_avg_views: float,
) -> dict[str, Any]:
    """
    Return 4 scores (all 0–10) + a 1-line interpretation.
    Keys: intent, structure, scale, final, interp.
    """
    intent = _intent_score(cls, row, df, comment_ai)
    structure = _structure_score(cls)
    scale = _scale_score(user_followers, user_avg_views, row)

    final = intent * 0.40 + structure * 0.35 + scale * 0.25
    final = max(0.0, min(10.0, final))

    interp = _interpretation(final, intent, structure, scale)

    return {
        "intent": round(intent, 1),
        "structure": round(structure, 1),
        "scale": round(scale, 1),
        "final": round(final, 1),
        "interp": interp,
    }


# ---------- Content Structure Model ----------
# Three layers of content:
#   - Aesthetic : visual / vibe / lifestyle
#   - Trust     : personal experience / authenticity
#   - Decision  : explaining choices, comparisons, recommendations
#
# We estimate the mix from the pasted comment buckets + sensible defaults:
#   passive comments   → signal aesthetic content
#   curiosity comments → signal trust content
#   purchase comments  → signal decision content

def content_structure_breakdown(cls: dict[str, Any]) -> dict[str, int]:
    """Return integer percentages summing to 100 for aesthetic / trust / decision."""
    total = cls["total"]
    if total == 0:
        # default lifestyle-creator mix when no comments are pasted
        return {"aesthetic": 70, "trust": 25, "decision": 5}

    ps = cls["purchase"] / total
    cs = cls["curiosity"] / total
    pas = cls["passive"] / total

    # small baselines so no layer collapses to 0 when only one bucket is populated
    a = pas * 0.90 + 0.08
    t = cs * 1.00 + 0.10
    d = ps * 1.30 + 0.03
    s = a + t + d

    raw = {
        "aesthetic": a / s * 100,
        "trust": t / s * 100,
        "decision": d / s * 100,
    }
    rounded = {k: int(round(v)) for k, v in raw.items()}
    # ensure the three integers sum to exactly 100 (adjust the largest)
    diff = 100 - sum(rounded.values())
    if diff != 0:
        biggest = max(rounded, key=lambda k: raw[k])
        rounded[biggest] += diff
    return rounded


def structure_interpretation(structure: dict[str, int]) -> str:
    a, t, d = structure["aesthetic"], structure["trust"], structure["decision"]
    if d < 15:
        return (
            "Your content is strong in aesthetic and trust, but weak in decision signals "
            "— which limits monetization."
        )
    if d < 30 and a > 55:
        return "Aesthetic dominates your mix. Decision content is thin — that's where sponsorship revenue unlocks."
    if t >= 35 and d < 30:
        return "Trust is there. You need more decision moments so viewers can act on it."
    return "Mix is balanced. The gap is packaging — offers, CTAs, comparisons."


def core_insight(
    structure: dict[str, int],
    final_score: float,
    intent_score: float,
    structure_score: float,
    scale_score: float,
) -> list[str]:
    """
    Return a 1–2 line core insight.

    Tiers by final_score:
      < 4  → under-monetizing
      4–7  → potential but weak conversion
      > 7  → strong monetization potential

    Within each tier, the weakest sub-score picks the sharper second line,
    so different inputs produce different outputs.
    """
    if final_score < 4:
        if scale_score < 3:
            return [
                "You are under-monetizing.",
                "Reach is too small to attract paid brand deals — build audience and decision content in parallel.",
            ]
        if intent_score < 3:
            return [
                "You are under-monetizing.",
                "Your audience isn't showing buying signals — brands have nothing to bid on.",
            ]
        if structure_score < 3:
            return [
                "You are under-monetizing.",
                "Decision content is missing — without it, reach doesn't translate to deals.",
            ]
        return [
            "You are under-monetizing.",
            "Every axis is weak — fix decision content first; it unlocks the rest.",
        ]

    if final_score <= 7:
        if intent_score < 4:
            return [
                "Potential is there, but conversion is weak.",
                "Your audience watches — they don't ask to buy.",
            ]
        if structure_score < 5:
            return [
                "Potential is there, but conversion is weak.",
                "Add decision content to unlock real sponsorship rates.",
            ]
        if scale_score < 5:
            return [
                "Potential is there, but conversion is weak.",
                "Signal is strong — scale is what's capping your deal size.",
            ]
        return [
            "Potential is there, but conversion is weak.",
            "Package what you have — CTAs and clear offers will move the needle.",
        ]

    if structure_score >= 7 and intent_score >= 7:
        return [
            "Strong monetization potential.",
            "You're leaving money on the table without clear offers.",
        ]
    if scale_score >= 7:
        return [
            "Strong monetization potential.",
            "Reach is there — sharper decision content commands premium rates.",
        ]
    return [
        "Strong monetization potential.",
        "Double down on decision content and package deals — scale follows rates.",
    ]


def key_problem(structure: dict[str, int]) -> str:
    d, a, t = structure["decision"], structure["aesthetic"], structure["trust"]
    if d < 15:
        return "Low decision content — viewers never hear **why** you chose anything."
    if a > 60:
        return "Aesthetic-heavy mix — vibe without commerce context."
    if t < 20:
        return "Low trust signal — viewers don't see the real person behind the content."
    return "No clear CTA — decision content exists, but you don't ask viewers to act."


def decision_actions(structure: dict[str, int]) -> list[str]:
    """1–2 concrete, decision-driven moves tailored to the weakest layer."""
    d = structure["decision"]
    t = structure["trust"]
    if d < 15:
        return [
            "Post 1 **“why I chose this”** reel about a product you actually use.",
            "Add 1 **comparison post** this week — *A vs B, here's which one wins for me*.",
        ]
    if t < 25:
        return [
            "Share 1 real **use-case story** behind a product you love.",
            "Add 1 **“what I would buy again”** roundup this week.",
        ]
    return [
        "Add a **soft CTA** to 3 posts: *“link in bio if you want it.”*",
        "Pin your strongest decision post and **rewrite the caption** with product context.",
    ]


# ---------- Gap (weakest sub-score) ----------
GAP_EXPLANATIONS = {
    "Scale": "Reach is too small — brands discount rates until you have a larger, engaged audience.",
    "Intent": "Your audience shows no buying signal — comments don't translate to conversion.",
    "Structure": "Content lacks decision moments — brands see aesthetic, not commerce.",
}


def identify_gap(scores: dict[str, Any]) -> dict[str, Any]:
    """Pick the weakest of Scale / Intent / Structure and return a 1-line diagnosis."""
    sub = {
        "Scale": float(scores["scale"]),
        "Intent": float(scores["intent"]),
        "Structure": float(scores["structure"]),
    }
    weakest = min(sub, key=lambda k: sub[k])
    return {
        "dimension": weakest,
        "value": sub[weakest],
        "line": GAP_EXPLANATIONS[weakest],
    }


def gap_actions(gap_dimension: str) -> list[str]:
    """1–2 actions that attack the specific weakest dimension."""
    if gap_dimension == "Scale":
        return [
            "Collab with 1 creator slightly bigger than you this week — cross-post for reach.",
            "Ride 1 current trend this week (audio / format) to widen top-of-funnel.",
        ]
    if gap_dimension == "Intent":
        return [
            "Post 1 **“why I chose this”** reel about a product you actually use.",
            "Add a soft CTA on your next 3 posts: *“link in bio if you want it.”*",
        ]
    # Structure
    return [
        "Post 1 **comparison post** this week — *A vs B, here's which one wins for me*.",
        "Add 1 **“what I would buy again”** roundup with short reasons per item.",
    ]


def tailored_actions(market_status: str, gap_dimension: str) -> list[str]:
    """If user is above market, shift to packaging/pitch; else attack the weakest dimension."""
    if market_status == "Above market":
        return [
            "Draft a **1-page pitch**: top 3 posts + audience metrics + one case result. Send to 3 brands this week.",
            "Raise your rate card — your signal is already ahead of peers at your tier.",
        ]
    return gap_actions(gap_dimension)


# ---------- Market Benchmark ----------
# Rough typical deal ranges per sponsored Instagram post, by niche + follower tier.
# These are industry ballparks (nano/micro/mid/macro/mega), not guarantees.

MARKET_BENCHMARKS: dict[str, dict[str, tuple[int, int]]] = {
    "Beauty": {
        "nano":  (50, 250),
        "micro": (250, 1500),
        "mid":   (1500, 7000),
        "macro": (7000, 25000),
        "mega":  (25000, 100000),
    },
    "Fitness": {
        "nano":  (40, 200),
        "micro": (200, 1200),
        "mid":   (1200, 5500),
        "macro": (5500, 20000),
        "mega":  (20000, 80000),
    },
    "Lifestyle": {
        "nano":  (30, 180),
        "micro": (180, 1100),
        "mid":   (1100, 5000),
        "macro": (5000, 18000),
        "mega":  (18000, 70000),
    },
    "Other": {
        "nano":  (25, 150),
        "micro": (150, 900),
        "mid":   (900, 4000),
        "macro": (4000, 15000),
        "mega":  (15000, 60000),
    },
}


def _follower_tier(followers: float) -> tuple[str, str]:
    f = float(followers or 0)
    if f < 10_000:
        return "nano", "Nano (<10K)"
    if f < 50_000:
        return "micro", "Micro (10K–50K)"
    if f < 250_000:
        return "mid", "Mid (50K–250K)"
    if f < 1_000_000:
        return "macro", "Macro (250K–1M)"
    return "mega", "Mega (1M+)"


def market_benchmark(niche: str, followers: float) -> dict[str, Any]:
    """Typical peer deal range for niche + follower tier."""
    niche_key = niche if niche in MARKET_BENCHMARKS else "Other"
    tier_key, tier_label = _follower_tier(followers)
    low, high = MARKET_BENCHMARKS[niche_key][tier_key]
    return {
        "niche": niche_key,
        "tier": tier_key,
        "tier_label": tier_label,
        "low": low,
        "high": high,
    }


def market_gap(
    deal: dict[str, Any],
    market: dict[str, Any],
    intent: float,
    structure_score: float,
) -> dict[str, Any]:
    """
    Compare user's estimated deal range against peers.
    Returns status (Below / At / Above market) + a WHY tied to intent / structure.
    """
    user_mid = (deal["low"] + deal["high"]) / 2.0
    mkt_mid = (market["low"] + market["high"]) / 2.0

    if user_mid < mkt_mid * 0.75:
        status, badge = "Below market", "#ef4444"
    elif user_mid > mkt_mid * 1.25:
        status, badge = "Above market", "#10b981"
    else:
        status, badge = "At market", "#f59e0b"

    # WHY, grounded in intent / structure (per spec)
    if status == "Below market":
        if intent < 4 and structure_score < 5:
            why = "Both buying intent and decision content are weak — brands don't see a niche premium to pay."
        elif intent < 4:
            why = "Weak buying signal in your comments drags your rate below peers."
        elif structure_score < 5:
            why = "Low decision content keeps brands from paying the niche premium."
        else:
            why = "Reach is under the tier floor — deal rates compress until the audience grows."
    elif status == "Above market":
        if intent >= 6 and structure_score >= 6:
            why = "Strong buying intent + decision content — brands pay a premium for creators who convert."
        elif intent >= 6:
            why = "Your audience shows real buying intent — that commands above-tier rates."
        else:
            why = "Decision content is sharper than peers — that earns you a premium."
    else:  # At market
        if intent < 5:
            why = "You sit at tier — lifting buying intent is what pushes rates into the premium bracket."
        elif structure_score < 6:
            why = "You sit at tier — adding decision content will move you above peers."
        else:
            why = "Signal is peer-level — packaging (CTAs, 1-page pitch) pushes you above."

    return {
        "status": status,
        "badge": badge,
        "user_mid": user_mid,
        "mkt_mid": mkt_mid,
        "why": why,
    }


# ---------- Deal Reality (brand-deal value estimate) ----------
def _round_money(v: float) -> int:
    """Round a dollar amount to a tidy display value."""
    v = max(v, 0.0)
    if v < 100:
        return int(round(v / 5) * 5)
    if v < 1000:
        return int(round(v / 10) * 10)
    if v < 10000:
        return int(round(v / 50) * 50)
    return int(round(v / 100) * 100)


def deal_reality(
    row: pd.Series,
    intent: float,
    structure: dict[str, int],
    user_followers: float,
) -> dict[str, Any]:
    """
    Estimate realistic brand-deal range per sponsored Instagram post.

    Base CPM bracket: $8/1k (low) → $20/1k (high) followers.
    Adjusted by two multipliers that compound:
      - Buying intent:   0.5x at intent=0  →  1.5x at intent=10
      - Decision content: 0.7x at 0%       →  1.4x at 50%+
    """
    provided = bool(user_followers and user_followers > 0)
    followers = float(user_followers) if provided else float(row["followers"])

    base_low = followers / 1000.0 * 8.0
    base_high = followers / 1000.0 * 20.0

    intent_mult = 0.5 + (intent / 10.0)
    decision_mult = 0.7 + (structure["decision"] / 100.0) * 1.4
    mult = intent_mult * decision_mult

    low = _round_money(base_low * mult)
    high = _round_money(base_high * mult)
    if high < low:
        high = low

    d = structure["decision"]
    if intent < 4 and d < 15:
        explanation = "Low buying signal + low decision content cap what brands will offer."
    elif d < 15:
        explanation = "Followers are there, but weak decision content limits brand willingness to pay a premium."
    elif intent >= 6 and d >= 30:
        explanation = "Strong buying intent + real decision content — brands will pay toward the high end."
    elif intent >= 6:
        explanation = "Buying intent is strong; sharper decision content would push the high end up."
    elif d >= 30:
        explanation = "Decision content is there, but weak buying intent caps the ceiling."
    else:
        explanation = "Mid-range mix — clearer offers and CTAs would push this range up fast."

    return {
        "low": low,
        "high": high,
        "followers_used": followers,
        "provided": provided,
        "explanation": explanation,
    }


# ---------- Creator Value Analyzer — Profile → Signals → Evaluation → Value → Action ----------
# Discrete labels + simple scoring that match the Notion "Creator Value Analyzer" system.

def intent_label_from_cls(cls: dict[str, Any], comment_ai: dict[str, Any]) -> str:
    """Purchase-comment ratio → Low / Medium / High."""
    total = cls["total"]
    if total > 0:
        ratio = cls["purchase"] / total
        if ratio >= 0.20:
            return "High"
        if ratio >= 0.08:
            return "Medium"
        return "Low"
    # Fallback: use LLM comment AI label if no comments pasted
    label = str(comment_ai.get("purchase_intent", "Low")).strip().lower()
    return {"high": "High", "medium": "Medium", "low": "Low"}.get(label, "Low")


def content_type_from_structure(structure: dict[str, int]) -> str:
    """Decision-content % → Aesthetic / Mixed / Decision-driven."""
    d = structure.get("decision", 0)
    if d >= 30:
        return "Decision-driven"
    if d >= 15:
        return "Mixed"
    return "Aesthetic"


INTENT_VALUES = {"Low": 3, "Medium": 6, "High": 9}
CONTENT_VALUES = {"Aesthetic": 2, "Mixed": 5, "Decision-driven": 8}


def simple_score(intent_level: str, content_type: str) -> dict[str, int]:
    """Creator Value Analyzer scoring: Intent × 0.6 + Content × 0.4, rounded."""
    i = INTENT_VALUES[intent_level]
    c = CONTENT_VALUES[content_type]
    final = round(i * 0.6 + c * 0.4)
    return {"intent": i, "content": c, "final": final}


# ---------- Strategist AI output (INSIGHT / GAP / NEXT MOVE) ----------

_STRATEGIST_SYSTEM = (
    "You are a creator monetization strategist briefing a creator on a call. "
    "You evaluate the same way a brand's deal team would — audience signal, "
    "content evidence, conversion potential. You write in sharp, investor-grade "
    "English: short, direct, confident, no hedging, no consultant tone."
)


def _strategist_user_prompt(snapshot: dict[str, Any]) -> str:
    return f"""You will receive a profile snapshot. Return exactly three lines,
labeled INSIGHT, GAP, NEXT MOVE. No fluff. No generic advice. No markdown.

PROFILE
- Niche: {snapshot['niche']}
- Followers: {snapshot['followers']:,}
- Tier: {snapshot['tier']}

SIGNALS
- Intent Level: {snapshot['intent_level']}
- Content Type: {snapshot['content_type']}
- Monetization Score: {snapshot['score']}/10
- Estimated Deal Value: ${snapshot['deal_low']:,} – ${snapshot['deal_high']:,}
- Market Range: ${snapshot['mkt_low']:,} – ${snapshot['mkt_high']:,}
- Position vs market: {snapshot['position']}

Return in this exact format:

INSIGHT: [1 sentence on what a brand actually sees when they look at this audience. Describe the audience, not the creator. Be specific and a little provocative — like a strong product insight.]

GAP: [1 sentence explaining why this creator is {snapshot['position'].lower()}-monetized. Blunt. Name the exact reason in plain language. Reference intent level or content type. No hedging.]

NEXT MOVE: [1 sentence with the exact post to make next week. MUST include (a) a specific format — comparison / roundup / decision-explainer / review / before-after — and (b) a ready-to-paste hook in quotes.]

Voice rules:
- Write like you're briefing the creator on a Zoom call.
- Use short, declarative sentences. Confident, not corporate.
- Banned phrases: "at tier", "stops at", "improve engagement", "optimize content", "post more", "be authentic", "build community", "leverage", "align with your brand".
- Each line max 28 words.
- No markdown, no headings other than INSIGHT / GAP / NEXT MOVE.
"""


def _parse_strategist_text(text: str) -> dict[str, str]:
    out = {"insight": "", "gap": "", "next_move": ""}
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        up = line.upper()
        if up.startswith("INSIGHT:"):
            out["insight"] = line.split(":", 1)[1].strip()
        elif up.startswith("GAP:"):
            out["gap"] = line.split(":", 1)[1].strip()
        elif up.startswith("NEXT MOVE:"):
            out["next_move"] = line.split(":", 1)[1].strip()
    return out


def _rule_based_strategist(snapshot: dict[str, Any]) -> dict[str, str]:
    """Offline fallback — no API needed. Combines labels + position for sharp lines."""
    intent = snapshot["intent_level"]
    ctype = snapshot["content_type"]
    position = snapshot["position"]

    # --- INSIGHT: how a brand reads the audience ---
    insight_map = {
        ("Low", "Aesthetic"):
            "People love how this looks. Nobody's reaching for a wallet.",
        ("Low", "Mixed"):
            "Your audience watches closely and buys quietly — which, to a brand, reads as doesn't buy.",
        ("Low", "Decision-driven"):
            "You're teaching buying decisions to an audience that hasn't asked for them yet — content ahead of demand.",
        ("Medium", "Aesthetic"):
            "Curiosity is forming, but your feed keeps it there — no bridge from interest to purchase.",
        ("Medium", "Mixed"):
            "Early buying signal is showing up. Not strong enough yet for a brand to price it in.",
        ("Medium", "Decision-driven"):
            "Real decision content meeting moderate intent — you're training the audience to buy on your word.",
        ("High", "Aesthetic"):
            "Buying intent trapped in aesthetic content. Your audience wants to spend; your feed won't let them.",
        ("High", "Mixed"):
            "Your audience is ready to buy. Your content half-helps them, half-distracts them.",
        ("High", "Decision-driven"):
            "High-converting audience getting exactly what it asks for — the shape brands pay a premium to sponsor.",
    }
    insight = insight_map[(intent, ctype)]

    # --- GAP: why under/at/over-monetized, referencing labels directly ---
    if position == "Below market":
        if intent == "Low" and ctype == "Aesthetic":
            gap = "No purchase signal, no decision moments. Brands price this as reach, nothing more."
        elif intent == "Low":
            gap = "Your audience watches but never asks to buy — exactly why brands keep the offer small."
        elif ctype == "Aesthetic":
            gap = "You sell the vibe, not the decision. Brands can't see how a paid post would convert."
        else:
            gap = "One dimension is dragging your rate below peers. Fix it before you pitch."
    elif position == "At market":
        if intent != "High":
            gap = "Your rate is capped because the audience isn't asking to buy yet — that's the exact signal brands pay more for."
        elif ctype != "Decision-driven":
            gap = "Your content shows taste, not choices. Decision moments are what unlock the premium bracket."
        else:
            gap = "Your signal is already priced in. The next jump is packaging — a rate card, a deck, a clear offer."
    else:  # Above market
        gap = "You're earning a premium because your comments prove purchase behavior. Protect it — don't let sponsored posts outnumber decision content."

    # --- NEXT MOVE: exact post + hook, varies by content type & intent ---
    if ctype == "Aesthetic":
        move = (
            "Post a comparison reel. Hook: "
            "\"I tested 3 [category] for 30 days — only one made the cut.\""
        )
    elif ctype == "Mixed" and intent == "Low":
        move = (
            "Post a decision-explainer. Hook: "
            "\"I almost bought the wrong [product] — here's what changed my mind.\""
        )
    elif ctype == "Mixed":
        move = (
            "Post a roundup. Hook: "
            "\"Everything I'd actually buy again at full price — the 4 that earned it.\""
        )
    elif ctype == "Decision-driven" and intent == "High":
        move = (
            "Post a before-after case study. Hook: "
            "\"I used [product] daily for 60 days — here's what actually changed.\""
        )
    else:
        move = (
            "Post an A-vs-B comparison. Hook: "
            "\"[Option A] vs [Option B] — which one is actually worth it?\""
        )

    return {"insight": insight, "gap": gap, "next_move": move}


def strategist_output(snapshot: dict[str, Any]) -> tuple[dict[str, str], str]:
    """
    Returns ({insight, gap, next_move}, mode) where mode is 'openai' or 'rule_based'.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        try:
            from openai import OpenAI  # lazy import
            client = OpenAI(api_key=api_key)
            model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": _STRATEGIST_SYSTEM},
                    {"role": "user", "content": _strategist_user_prompt(snapshot)},
                ],
                temperature=0.5,
                max_tokens=260,
            )
            text = resp.choices[0].message.content or ""
            parsed = _parse_strategist_text(text)
            if parsed["insight"] and parsed["gap"] and parsed["next_move"]:
                return parsed, "openai"
        except Exception:
            pass  # fall through to rule-based
    return _rule_based_strategist(snapshot), "rule_based"


# ---------- Session ----------
STAGE_LANDING = "landing"
STAGE_FORM = "form"
STAGE_RESULTS = "results"

if "stage" not in st.session_state:
    st.session_state.stage = STAGE_LANDING
if "diagnosis" not in st.session_state:
    st.session_state.diagnosis = None


# ---------- Landing ----------
if st.session_state.stage == STAGE_LANDING:
    st.markdown("# 🎯 Creator Value Analyzer")
    st.markdown(
        "*See yourself the way brands see you — and raise your value.*"
    )
    st.markdown(" ")

    col1, col2 = st.columns([1.2, 1])
    with col1:
        st.markdown(
            """
            #### What this is
            A creator-side decision system. It runs the same chain a brand's
            deal team uses — **Profile → Signals → Evaluation → Value → Action**
            — so you can see where you stand and what to do next.

            #### What you’ll get
            - 👤 **Profile** — niche, followers, tier
            - 📡 **Signals** — Intent Level · Content Type
            - 🧮 **Evaluation** — Monetization Score (0–10)
            - 💰 **Value** — Estimated Deal Value · Market Range · Position
            - 🎯 **Action** — Insight · Gap · Next Move (format + hook)
            """
        )
        st.markdown(" ")
        if st.button("Start Analysis", type="primary"):
            st.session_state.stage = STAGE_FORM
            st.rerun()

    with col2:
        st.info(
            "**We don’t need full account access.**\n\n"
            "You’ll just paste **3 recent Instagram post or reel links** "
            "(plus a few audience comments if you have them).\n\n"
            "Takes 2 minutes."
        )

# ---------- Form ----------
elif st.session_state.stage == STAGE_FORM:
    st.markdown("## Paste your recent content")
    st.markdown(
        "We don’t need full account access. "
        "Just paste **3 recent Instagram post or reel links** to understand your monetization signals."
    )
    st.caption(
        "We only need a few recent posts to understand your buying signals, content structure, and monetization gaps."
    )

    with st.form("diagnosis_form", clear_on_submit=False):
        st.markdown("#### Required")
        link1 = st.text_input("Post link 1", placeholder="https://www.instagram.com/p/...")
        link2 = st.text_input("Post link 2", placeholder="https://www.instagram.com/reel/...")
        link3 = st.text_input("Post link 3", placeholder="https://www.instagram.com/p/...")

        st.markdown("#### Optional — sharpens the read")
        c1, c2, c3 = st.columns(3)
        with c1:
            followers = st.number_input(
                "Follower count", min_value=0, value=0, step=500, format="%d"
            )
        with c2:
            avg_views = st.number_input(
                "Average views", min_value=0, value=0, step=250, format="%d"
            )
        with c3:
            niche = st.selectbox(
                "Niche / category",
                options=["Beauty", "Fitness", "Lifestyle", "Other"],
                index=0,
            )

        st.markdown("#### Paste recent comments (optional but recommended)")
        comments_paste = st.text_area(
            "One comment per line",
            height=160,
            placeholder="where did you get this?\nlink pls 🙏\nso pretty 😍\n...",
            help="We classify each into Purchase Intent / Curiosity / Passive to read real buying signal.",
        )

        submitted = st.form_submit_button("Run monetization diagnosis", type="primary")

    colb, _ = st.columns([1, 3])
    with colb:
        if st.button("← Back"):
            st.session_state.stage = STAGE_LANDING
            st.rerun()

    if submitted:
        links = [l.strip() for l in (link1, link2, link3) if l and l.strip()]
        if len(links) < 3:
            st.error("Please paste **3 post/reel links** so we can anchor the diagnosis.")
        else:
            cohort = load_niche_df(niche)
            user_dict = build_user_row(followers, avg_views, niche, cohort)
            row, scored_df = score_user_in_cohort(user_dict, cohort)

            comments = split_pasted_comments(comments_paste)
            cls = classify_bucket(comments)

            comment_ai = analyze_comments_structured(
                comments=comments,
                niche=niche,
                creator_username="you",
            )

            # 📡 SIGNALS — discrete labels derived from the classifier + structure model
            structure = content_structure_breakdown(cls)
            intent_level = intent_label_from_cls(cls, comment_ai)
            content_type = content_type_from_structure(structure)

            # 🧮 EVALUATION — simplified Creator Value Analyzer scoring
            sc = simple_score(intent_level, content_type)
            final_score = sc["final"]

            # 💰 VALUE — deal_reality + market benchmark + position
            # (reuse existing helpers; pass numeric intent/structure derived from the labels)
            intent_numeric = float(sc["intent"])
            structure_numeric = float(sc["content"])
            deal = deal_reality(row, intent_numeric, structure, followers)
            market = market_benchmark(niche, deal["followers_used"])
            gap_market = market_gap(deal, market, intent_numeric, structure_numeric)

            # 👤 PROFILE — tier label from follower count actually used
            tier_key, tier_label = _follower_tier(deal["followers_used"])

            # 🎯 ACTION — strategist AI (OpenAI or rule-based fallback)
            snapshot = {
                "niche": niche,
                "followers": int(deal["followers_used"]),
                "tier": tier_label,
                "intent_level": intent_level,
                "content_type": content_type,
                "score": final_score,
                "deal_low": deal["low"],
                "deal_high": deal["high"],
                "mkt_low": market["low"],
                "mkt_high": market["high"],
                "position": gap_market["status"],
            }
            strategist, strategist_mode = strategist_output(snapshot)

            st.session_state.diagnosis = {
                "links": links,
                "niche": niche,
                "inputs": {"followers": followers, "avg_views": avg_views},
                "row_series": row,
                "scored_df": scored_df,
                "cls": cls,
                "comment_ai": comment_ai,
                "structure": structure,
                # Profile
                "tier_key": tier_key,
                "tier_label": tier_label,
                "followers_used": int(deal["followers_used"]),
                "followers_provided": deal["provided"],
                # Signals
                "intent_level": intent_level,
                "content_type": content_type,
                # Evaluation
                "score": final_score,
                "intent_value": sc["intent"],
                "content_value": sc["content"],
                # Value
                "deal": deal,
                "market": market,
                "gap_market": gap_market,
                # Action
                "strategist": strategist,
                "strategist_mode": strategist_mode,
            }
            st.session_state.stage = STAGE_RESULTS
            st.rerun()

# ---------- Results ----------
else:
    diag = st.session_state.diagnosis
    if not diag:
        st.session_state.stage = STAGE_LANDING
        st.rerun()

    cls = diag["cls"]
    comment_ai = diag["comment_ai"]
    structure = diag["structure"]
    row = diag["row_series"]
    scored_df = diag["scored_df"]

    # Profile
    niche = diag["niche"]
    tier_label = diag["tier_label"]
    followers_used = diag["followers_used"]
    followers_provided = diag["followers_provided"]

    # Signals
    intent_level = diag["intent_level"]
    content_type = diag["content_type"]

    # Evaluation
    score = diag["score"]
    intent_value = diag["intent_value"]
    content_value = diag["content_value"]

    # Value
    deal = diag["deal"]
    market = diag["market"]
    gap_market = diag["gap_market"]

    # Action
    strategist = diag["strategist"]
    strategist_mode = diag["strategist_mode"]

    def score_accent(v: float) -> str:
        if v >= 7:
            return "#10b981"
        if v >= 4:
            return "#f59e0b"
        return "#ef4444"

    # ======================================================================
    # 👤 PROFILE
    # ======================================================================
    st.markdown("### 👤 Profile")
    p1, p2, p3 = st.columns(3)
    p1.metric("Niche", niche)
    p2.metric("Followers", f"{followers_used:,}")
    p3.metric("Tier", tier_label)
    if not followers_provided:
        st.caption(
            f"Follower count not provided — using cohort median. "
            f"Enter a real count for a sharper read."
        )
    st.markdown(" ")

    # ======================================================================
    # 📡 SIGNALS
    # ======================================================================
    st.markdown("### 📡 Signals")

    def _signal_pill(label: str, value: str, color: str) -> str:
        return (
            f"<div style='padding:0.85rem 1rem;border-radius:10px;"
            f"background:#f8fafc;border-left:4px solid {color};'>"
            f"<div style='font-size:0.7rem;color:#64748b;font-weight:700;"
            f"text-transform:uppercase;letter-spacing:0.06em;'>{label}</div>"
            f"<div style='font-size:1.2rem;font-weight:700;color:#0f172a;"
            f"margin-top:0.2rem;'>{value}</div></div>"
        )

    intent_color = {"Low": "#ef4444", "Medium": "#f59e0b", "High": "#10b981"}[intent_level]
    content_color = {
        "Aesthetic": "#ef4444",
        "Mixed": "#f59e0b",
        "Decision-driven": "#10b981",
    }[content_type]

    s1, s2 = st.columns(2)
    with s1:
        st.markdown(_signal_pill("Intent Level", intent_level, intent_color), unsafe_allow_html=True)
    with s2:
        st.markdown(_signal_pill("Content Type", content_type, content_color), unsafe_allow_html=True)
    st.markdown(" ")

    # ======================================================================
    # 🧮 EVALUATION  — big headline metric
    # ======================================================================
    st.markdown("### 🧮 Evaluation")
    accent = score_accent(score)
    st.markdown(
        f"""
        <div style="background:#0f172a;color:#f8fafc;padding:2rem 2.25rem;
            border-radius:14px;border-left:8px solid {accent};
            box-shadow:0 4px 14px rgba(0,0,0,0.22);">
            <div style="font-size:0.75rem;font-weight:700;color:#94a3b8;
                text-transform:uppercase;letter-spacing:0.08em;">
                Monetization Score
            </div>
            <div style="font-size:5rem;font-weight:800;line-height:1;
                margin-top:0.45rem;color:{accent};">
                {score}<span style="font-size:1.5rem;color:#cbd5e1;
                margin-left:0.5rem;font-weight:600;">/ 10</span>
            </div>
            <div style="font-size:0.85rem;color:#94a3b8;margin-top:0.8rem;">
                Intent ({intent_value}) × 0.6 + Content ({content_value}) × 0.4
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.markdown(" ")

    # ======================================================================
    # 💰 VALUE
    # ======================================================================
    st.markdown("### 💰 Value")
    deal_low = f"${deal['low']:,}"
    deal_high = f"${deal['high']:,}"
    mkt_low = f"${market['low']:,}"
    mkt_high = f"${market['high']:,}"
    position = gap_market["status"]
    position_color = gap_market["badge"]

    v1, v2 = st.columns(2)
    with v1:
        st.markdown(
            f"""
            <div style="background:linear-gradient(135deg,#064e3b,#065f46);
                color:#ecfdf5;padding:1.2rem 1.3rem;border-radius:12px;
                border-left:5px solid #10b981;height:100%;">
                <div style="font-size:0.7rem;letter-spacing:0.08em;
                    text-transform:uppercase;color:#a7f3d0;font-weight:700;">
                    Estimated Deal Value
                </div>
                <div style="font-size:1.6rem;font-weight:800;margin-top:0.35rem;">
                    {deal_low} – {deal_high}
                </div>
                <div style="font-size:0.75rem;color:#a7f3d0;margin-top:0.15rem;">
                    per sponsored post
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with v2:
        st.markdown(
            f"""
            <div style="background:#f1f5f9;color:#0f172a;padding:1.2rem 1.3rem;
                border-radius:12px;border-left:5px solid #64748b;height:100%;">
                <div style="font-size:0.7rem;letter-spacing:0.08em;
                    text-transform:uppercase;color:#64748b;font-weight:700;">
                    Market Range · {market['niche']} {market['tier_label']}
                </div>
                <div style="font-size:1.6rem;font-weight:800;margin-top:0.35rem;">
                    {mkt_low} – {mkt_high}
                </div>
                <div style="font-size:0.75rem;color:#475569;margin-top:0.15rem;">
                    typical peer range
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.markdown(
        f"""
        <div style="margin-top:0.8rem;display:inline-block;
            font-size:0.85rem;font-weight:800;color:#fff;
            background:{position_color};padding:0.5rem 1.1rem;border-radius:999px;
            text-transform:uppercase;letter-spacing:0.06em;">
            Position: {position}
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.markdown(" ")

    # ======================================================================
    # 🎯 ACTION  (INSIGHT / GAP / NEXT MOVE from strategist)
    # ======================================================================
    st.markdown("### 🎯 Action")
    mode_caption = (
        "AI strategist · OpenAI"
        if strategist_mode == "openai"
        else "AI strategist · built-in rules (set `OPENAI_API_KEY` for AI-written copy)"
    )
    st.caption(mode_caption)

    def _action_block(label: str, text: str, border: str) -> str:
        return (
            f"<div style='margin-bottom:0.7rem;padding:1rem 1.15rem;"
            f"background:#ffffff;border-radius:10px;border:1px solid #e2e8f0;"
            f"border-left:4px solid {border};'>"
            f"<div style='font-size:0.7rem;color:#64748b;font-weight:800;"
            f"text-transform:uppercase;letter-spacing:0.08em;'>{label}</div>"
            f"<div style='font-size:1rem;color:#0f172a;margin-top:0.35rem;"
            f"line-height:1.5;'>{text}</div></div>"
        )

    st.markdown(_action_block("Insight", strategist["insight"], "#3b82f6"), unsafe_allow_html=True)
    st.markdown(_action_block("Gap", strategist["gap"], "#ef4444"), unsafe_allow_html=True)
    st.markdown(_action_block("Next Move", strategist["next_move"], "#10b981"), unsafe_allow_html=True)
    st.markdown(" ")

    # ----- Reference: signals under the hood (single collapsible) -----
    with st.expander("Signals under the hood (reference)", expanded=False):
        st.caption(
            f"Benchmarked against the **{niche}** sample cohort ({len(scored_df)} profiles)."
        )

        st.markdown("**Content Structure Breakdown**")
        a_pct = structure["aesthetic"]
        t_pct = structure["trust"]
        d_pct = structure["decision"]
        bar = (
            "<div style='display:flex;height:26px;border-radius:6px;overflow:hidden;"
            "font-size:0.75rem;font-weight:700;color:#0f172a;'>"
            f"<div style='flex:{a_pct};background:#cbd5e1;display:flex;align-items:center;justify-content:center;'>"
            f"{a_pct}%</div>"
            f"<div style='flex:{t_pct};background:#fcd34d;display:flex;align-items:center;justify-content:center;'>"
            f"{t_pct}%</div>"
            f"<div style='flex:{d_pct};background:#0d9488;color:#ecfeff;display:flex;align-items:center;justify-content:center;'>"
            f"{d_pct}%</div>"
            "</div>"
        )
        st.markdown(bar, unsafe_allow_html=True)
        st.caption("Aesthetic · Trust · Decision — drives the Content Type label.")

        st.markdown("**Audience comment buckets**")
        total = max(cls["total"], 1)
        p_pct = (cls["purchase"] / total) * 100 if cls["total"] else 0
        c_pct = (cls["curiosity"] / total) * 100 if cls["total"] else 0
        pa_pct = (cls["passive"] / total) * 100 if cls["total"] else 0
        ab1, ab2, ab3 = st.columns(3)
        ab1.metric("Purchase", f"{p_pct:.0f}%")
        ab2.metric("Curiosity", f"{c_pct:.0f}%")
        ab3.metric("Passive", f"{pa_pct:.0f}%")
        st.caption("Purchase % → drives the Intent Level label.")
        if cls["total"] == 0:
            st.caption("No comments pasted — labels defaulted.")
        else:
            for label in ("purchase", "curiosity", "passive"):
                samples = cls["samples"][label]
                if samples:
                    st.markdown(f"*{label.title()} examples:*")
                    for s in samples:
                        st.markdown(f"- {s}")

        st.markdown("**Links analyzed**")
        for l in diag["links"]:
            st.markdown(f"- {l}")

    st.markdown(" ")
    rcol1, rcol2 = st.columns([1, 3])
    with rcol1:
        if st.button("Run another diagnosis"):
            st.session_state.stage = STAGE_FORM
            st.session_state.diagnosis = None
            st.rerun()
