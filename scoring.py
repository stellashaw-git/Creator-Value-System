"""
Creator scoring: component scores on 0–100, then a final score.

All scores use min–max normalization *within the loaded CSV* (same file = same scale).

Transparent formulas (n_x = min–max normalized column x in [0, 1]):
  - reach_score     = 100 * (n_followers + n_avg_views) / 2
  - engagement_score = 100 * n_engagement_rate
  - growth_score    = 100 * n_growth_30d
  - final_score     = (reach_score + engagement_score + growth_score) / 3

 engagement_rate = (avg_likes + avg_comments) / avg_views (safe for zero views).

Rank uses final_score (higher is better).
"""

from __future__ import annotations

import pandas as pd


def _min_max(series: pd.Series) -> pd.Series:
    """Scale values to 0–1; constant column becomes 0.5."""
    lo, hi = series.min(), series.max()
    if hi == lo:
        return pd.Series(0.5, index=series.index)
    return (series - lo) / (hi - lo)


def _round_scores(s: pd.Series) -> pd.Series:
    return s.round(2)


def engagement_rate(df: pd.DataFrame) -> pd.Series:
    """
    Rough engagement: (likes + comments) per view.
    Avoids divide-by-zero when avg_views is missing or zero.
    """
    views = df["avg_views"].replace(0, pd.NA).fillna(1)
    return (df["avg_likes"] + df["avg_comments"]) / views


def add_creator_scores(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add engagement_rate, reach_score, engagement_score, growth_score,
    final_score (all 0–100, 2 decimals), and rank (1 = best by final_score).

    Expects columns: followers, avg_views, avg_likes, avg_comments, growth_30d.
    """
    out = df.copy()
    out["engagement_rate"] = engagement_rate(out)

    n_followers = _min_max(out["followers"])
    n_views = _min_max(out["avg_views"])
    n_eng = _min_max(out["engagement_rate"])
    n_growth = _min_max(out["growth_30d"])

    out["reach_score"] = _round_scores(100 * (n_followers + n_views) / 2)
    out["engagement_score"] = _round_scores(100 * n_eng)
    out["growth_score"] = _round_scores(100 * n_growth)
    out["final_score"] = _round_scores(
        (out["reach_score"] + out["engagement_score"] + out["growth_score"]) / 3
    )

    out["rank"] = out["final_score"].rank(ascending=False, method="min").astype(int)

    return out.sort_values("rank", ascending=True).reset_index(drop=True)


def rank_explanation_bullets(row: pd.Series, df: pd.DataFrame) -> list[str]:
    """
    Short reasons this creator sits at their rank, using the same cohort as scoring.

    Phrases match product copy:
      - Top growth — 30d growth is highest in the file (ties allowed)
      - Above-average engagement — reaction rate above cohort median
      - Strong reach efficiency — views per follower at or above cohort median
    """
    bullets: list[str] = []
    g = float(row["growth_30d"])
    if g >= float(df["growth_30d"].max()):
        bullets.append("Top growth")

    eng = float(row["engagement_rate"])
    if eng > float(df["engagement_rate"].median()):
        bullets.append("Above-average engagement")

    ratio = float(row["avg_views"]) / max(float(row["followers"]), 1.0)
    cohort_ratio = df["avg_views"] / df["followers"].clip(lower=1.0)
    if ratio >= float(cohort_ratio.median()):
        bullets.append("Strong reach efficiency")

    return bullets


def decision_summary(row: pd.Series, df: pd.DataFrame) -> dict[str, str]:
    """
    Three-line decision outputs for the demo UI (uses engagement_rate, views/followers, growth_score).

    Returns keys: monetization_verdict, traffic_monetization_gap, recommended_action.
    """
    eng = float(row["engagement_rate"])
    ratio = float(row["avg_views"]) / max(float(row["followers"]), 1.0)
    gs = float(row["growth_score"])

    med_eng = float(df["engagement_rate"].median())
    q75_eng = float(df["engagement_rate"].quantile(0.75))
    cohort_ratio = df["avg_views"] / df["followers"].clip(lower=1.0)
    med_ratio = float(cohort_ratio.median())

    high_traffic = ratio >= med_ratio
    weak_engagement = eng < med_eng
    strong_engagement = eng > 0.1 or eng >= q75_eng

    # 1. Monetization verdict
    if high_traffic and weak_engagement:
        monetization_verdict = "Low (High traffic but weak monetization)"
    elif strong_engagement:
        monetization_verdict = "High Monetization Potential"
    else:
        monetization_verdict = "Medium"

    # 2. Traffic vs monetization gap
    if strong_engagement:
        traffic_gap = "Strong monetization (engagement supports conversion)"
    elif high_traffic and weak_engagement:
        traffic_gap = "High traffic but weak engagement (likely poor conversion)"
    else:
        traffic_gap = "Balanced"

    # 3. Recommended action (growth_score + verdict)
    if monetization_verdict.startswith("Low"):
        recommended_action = "Pass"
    elif monetization_verdict == "High Monetization Potential" and gs > 70:
        recommended_action = "Sign (proceed)"
    elif monetization_verdict == "High Monetization Potential" and gs > 40:
        recommended_action = "Pilot test"
    elif monetization_verdict == "High Monetization Potential":
        recommended_action = "Monitor"
    elif monetization_verdict == "Medium" and gs > 55:
        recommended_action = "Pilot test"
    elif monetization_verdict == "Medium":
        recommended_action = "Monitor"
    else:
        recommended_action = "Pass"

    return {
        "monetization_verdict": monetization_verdict,
        "traffic_monetization_gap": traffic_gap,
        "recommended_action": recommended_action,
    }


def decision_summary_solo(row: pd.Series, df: pd.DataFrame) -> dict[str, str]:
    """
    Same signals as decision_summary(), but copy for solo creators (you/your, no agency verbs).

    Keys: earning_potential, audience_connection, your_next_move
    """
    base = decision_summary(row, df)
    v = base["monetization_verdict"]
    g = base["traffic_monetization_gap"]
    a = base["recommended_action"]

    # Earning potential (maps monetization verdict)
    if v.startswith("Low"):
        earning = "Needs foundation — views aren’t turning into real connection yet"
    elif v == "High Monetization Potential":
        earning = "Strong — your engagement can support real income moves"
    else:
        earning = "Moderate — a few focused tweaks could unlock better brand fit"

    # Audience connection (maps gap)
    if "Strong monetization" in g:
        connection = "People are reacting — that’s what sponsors and sales need"
    elif "High traffic but weak" in g:
        connection = "Big reach, quiet replies — brands may doubt conversion"
    else:
        connection = "Reach and reactions are in a healthy balance for your size"

    # Next move (maps partner action → solo)
    if a == "Pass":
        move = "Pause paid deals — tighten hooks & comments first"
    elif a == "Sign (proceed)":
        move = "You’re ready to pitch — pick 2 brands that fit and send a short intro"
    elif a == "Pilot test":
        move = "Try one small win — affiliate link, mini collab, or paid offer test"
    elif a == "Monitor":
        move = "Keep posting steady — revisit numbers in a few weeks before big asks"
    elif a.startswith("Strong Candidate"):
        move = "Lead with your proof — outreach or a light pilot makes sense"
    elif "caution" in a.lower():
        move = "Test one small partnership before scaling spend"
    else:
        move = "Stay consistent and measure what actually gets saves & replies"

    return {
        "earning_potential": earning,
        "audience_connection": connection,
        "your_next_move": move,
    }


# ---------- Monetization diagnostic (solo creator) ----------

def _buying_intent(row: pd.Series, df: pd.DataFrame, comment_ai: dict) -> dict:
    """Combine comment purchase_intent with engagement_rate into a level + reasons."""
    eng = float(row["engagement_rate"])
    med = float(df["engagement_rate"].median())
    q75 = float(df["engagement_rate"].quantile(0.75))
    pi = str(comment_ai.get("purchase_intent", "Low")).title()
    aq = str(comment_ai.get("audience_quality", "Medium")).title()

    score = 0
    if pi == "High":
        score += 2
    elif pi == "Medium":
        score += 1
    if eng > 0.1 or eng >= q75:
        score += 2
    elif eng >= med:
        score += 1

    if score >= 3:
        level, headline = "High", "Your audience is leaning forward — real buying signal"
    elif score >= 2:
        level, headline = "Medium", "Some buying signal, not yet consistent"
    else:
        level, headline = "Low", "Mostly scrolling — convert attention into action first"

    reasons: list[str] = []
    if pi == "High":
        reasons.append("Comments mention price, link, or where to buy.")
    elif pi == "Medium":
        reasons.append("Occasional buying language in comments—not dominant yet.")
    else:
        reasons.append("Comments are mostly casual praise; few explicit buy signals.")

    if eng > 0.1:
        reasons.append(f"Strong reaction rate ({eng:.2%} per view) — people engage, not just watch.")
    elif eng >= med:
        reasons.append(f"Reaction rate ({eng:.2%}) is at or above your niche median ({med:.2%}).")
    else:
        reasons.append(f"Reaction rate ({eng:.2%}) is below the niche median ({med:.2%}).")

    if aq == "High":
        reasons.append("Comment quality looks substantive — easier to pitch premium CPMs later.")
    elif aq == "Low":
        reasons.append("Comments are short / low-signal — harder to convince brands of quality audience.")

    return {"level": level, "headline": headline, "reasons": reasons}


def _conversion_blockers(
    row: pd.Series,
    df: pd.DataFrame,
    comment_ai: dict,
    noise: str,
) -> tuple[list[str], str]:
    """
    List reasons brand deals may not be flowing + a single short tag for the hero card.
    """
    blockers: list[str] = []
    tag = "Package your proof"

    eng = float(row["engagement_rate"])
    med_eng = float(df["engagement_rate"].median())
    ratio = float(row["avg_views"]) / max(float(row["followers"]), 1.0)
    cohort_ratio = df["avg_views"] / df["followers"].clip(lower=1.0)
    med_ratio = float(cohort_ratio.median())
    gs = float(row["growth_score"])
    pi = str(comment_ai.get("purchase_intent", "Low")).title()
    br = str(comment_ai.get("brand_relevance", "Medium")).title()

    if noise in ("Likely Paid Noise", "Possible Noise"):
        blockers.append(f"**{noise}** — likes/views look out of step with real reactions; brands will notice.")
        tag = "Audience quality"
    if eng < med_eng:
        blockers.append(
            f"**Weak reaction rate** ({eng:.2%} vs ~{med_eng:.2%} niche median) — low CPM signal."
        )
        if tag == "Package your proof":
            tag = "Engagement gap"
    if ratio < med_ratio * 0.8:
        blockers.append("**Low reach efficiency** (views per follower below peers) — guarantees look weak.")
        if tag == "Package your proof":
            tag = "Distribution gap"
    if pi in ("Low",):
        blockers.append("**Soft buying language** in comments — sponsors doubt conversion to sales.")
        if tag == "Package your proof":
            tag = "Buying intent gap"
    if br == "Low":
        blockers.append("**Unclear brand fit** — niche/product words rarely surface in comments.")
    if gs < 40:
        blockers.append(f"**Flat growth** (growth_score {gs:.0f}) — brands pay premiums for momentum.")
        if tag == "Package your proof":
            tag = "Momentum"
    if not blockers:
        blockers.append(
            "No hard blockers in this sample — the gap is usually packaging (top clips + audience deck)."
        )

    return blockers, tag


def _two_week_plan(
    row: pd.Series,
    df: pd.DataFrame,
    comment_ai: dict,
    noise: str,
) -> tuple[list[str], str]:
    """
    Concrete 14-day plan + a short one-line card summary of the first priority.
    """
    eng = float(row["engagement_rate"])
    med_eng = float(df["engagement_rate"].median())
    pi = str(comment_ai.get("purchase_intent", "Low")).title()
    gs = float(row["growth_score"])

    plan: list[str] = []

    plan.append(
        "**Days 1–3 · Audit:** list your top 3 posts by saves + comments; note the hook, first 2 seconds, and CTA."
    )
    if eng < med_eng:
        plan.append(
            "**Days 4–7 · Reaction lift:** publish 2 posts that end with ONE explicit question; "
            "reply to the first 10 comments within 30 minutes."
        )
        first_priority = "Lift reactions (hook + CTA + replies)"
    else:
        plan.append(
            "**Days 4–7 · Compound:** repeat your best-performing hook structure twice; end each with a link/freebie CTA."
        )
        first_priority = "Compound your best hook"

    if pi == "High":
        plan.append(
            "**Days 8–11 · Monetize test:** soft-launch ONE small offer "
            "(affiliate link, digital download, or paid waitlist) to measure conversion."
        )
    else:
        plan.append(
            "**Days 8–11 · Build buying context:** ship one post that teaches, demos, or reviews a product "
            "so viewers associate you with buying decisions."
        )

    plan.append(
        "**Days 12–14 · Pitch pack:** draft a 1-page pitch — top 3 clips, audience metrics, "
        "and one result/case — ready for brand outreach."
    )

    if gs < 40:
        plan.append(
            "**Bonus:** launch a named 2-week series so the algorithm *and* viewers have a reason to return."
        )
    if noise in ("Likely Paid Noise", "Possible Noise"):
        plan.append("**Flag:** pause boosted posts this cycle — isolate organic performance before pitching.")

    return plan, first_priority


def monetization_diagnostic(
    row: pd.Series,
    df: pd.DataFrame,
    comment_ai: dict,
    noise: str = "Normal",
) -> dict:
    """
    One-shot diagnostic for the three core questions:
      1) Is the audience showing buying intent?
      2) Why is content not converting into brand deals?
      3) What should the creator change in the next 2 weeks?

    Returns: buying_intent, blockers (list), plan (list), card_summary (dict).
    """
    buying = _buying_intent(row, df, comment_ai)
    blockers, gap_tag = _conversion_blockers(row, df, comment_ai, noise)
    plan, first_priority = _two_week_plan(row, df, comment_ai, noise)

    return {
        "buying_intent": buying,
        "blockers": blockers,
        "plan": plan,
        "card_summary": {
            "intent_level": buying["level"],
            "intent_headline": buying["headline"],
            "gap_tag": gap_tag,
            "gap_detail": blockers[0] if blockers else "",
            "priority_tag": first_priority,
            "plan_size": len(plan),
        },
    }
