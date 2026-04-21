"""
Audience comment signals for a creator.

- If OPENAI_API_KEY is set, asks the model for High/Medium/Low labels + summary.
- Otherwise uses simple keyword heuristics (no API).
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

# Optional: same default as llm_analysis
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


def _rule_based(comments: list[str], niche: str) -> dict[str, Any]:
    text = " ".join(comments).lower()
    if not text.strip():
        return {
            "purchase_intent": "Low",
            "audience_quality": "Medium",
            "brand_relevance": "Medium",
            "summary": "No comment text to analyze.",
            "insights": ["Add real audience comments to see stronger signals."],
        }

    buy = sum(
        1
        for w in (
            "buy",
            "link",
            "code",
            "price",
            "order",
            "where can",
            "discount",
            "purchase",
            "shop",
            "cart",
            "sign up",
        )
        if w in text
    )
    if buy >= 3:
        purchase = "High"
    elif buy >= 1:
        purchase = "Medium"
    else:
        purchase = "Low"

    # Rough "quality": questions and longer comments suggest engagement
    questions = text.count("?")
    words = len(text.split())
    if questions >= 2 and words > 40:
        quality = "High"
    elif words > 15:
        quality = "Medium"
    else:
        quality = "Low"

    niche_l = niche.lower()
    brand_hits = sum(1 for w in ("brand", "sponsor", "collab", "partner", "ad") if w in text)
    if niche_l in text or brand_hits >= 1:
        brand_rel = "High" if brand_hits >= 1 else "Medium"
    else:
        brand_rel = "Medium"

    insights: list[str] = []
    if purchase == "High":
        insights.append("Several comments mention buying, links, or price—strong purchase language.")
    elif purchase == "Low":
        insights.append("Mostly casual praise; fewer explicit buy signals in this sample.")
    if quality == "High":
        insights.append("Comments look substantive (questions, detail)—healthy audience signal.")

    return {
        "purchase_intent": purchase,
        "audience_quality": quality,
        "brand_relevance": brand_rel,
        "summary": f"Quick scan of {len(comments)} comment(s) in **{niche}** — keyword-based read (no API).",
        "insights": insights or ["Heuristics only; add OPENAI_API_KEY for a richer read."],
    }


def analyze_comments_structured(
    comments: list[str],
    niche: str,
    creator_username: str,
) -> dict[str, Any]:
    """
    Return keys: purchase_intent, audience_quality, brand_relevance (High/Medium/Low),
    summary (str), insights (list[str]).
    """
    if not comments:
        return {
            "purchase_intent": "Low",
            "audience_quality": "Medium",
            "brand_relevance": "Medium",
            "summary": "No comments for this creator in `datasets/comments.csv` yet.",
            "insights": ["Add rows with matching `username` to unlock audience signals."],
        }

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return _rule_based(comments, niche)

    prompt = f"""You analyze short social comments for a creator in niche: {niche} (@{creator_username}).

Comments (one per line):
{chr(10).join(f"- {c[:500]}" for c in comments[:40])}

Reply with ONLY valid JSON (no markdown):
{{
  "purchase_intent": "High" | "Medium" | "Low",
  "audience_quality": "High" | "Medium" | "Low",
  "brand_relevance": "High" | "Medium" | "Low",
  "summary": "one sentence",
  "insights": ["bullet 1", "bullet 2", "bullet 3"]
}}
"""

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You output only valid JSON. Labels must be High, Medium, or Low.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=600,
        )
        raw = resp.choices[0].message.content or ""
        raw = raw.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
        data = json.loads(raw)
        for k in ("purchase_intent", "audience_quality", "brand_relevance", "summary", "insights"):
            if k not in data:
                raise ValueError("missing key")
        return data
    except Exception:
        return _rule_based(comments, niche)
