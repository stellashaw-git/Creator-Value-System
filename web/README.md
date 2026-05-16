# WorthyIQ — Creator Intelligence Platform

The decision system for influencer marketing.

WorthyIQ helps brands and MCN agencies evaluate creators, improve campaign ROI,
and turn creator signals into actionable partnership decisions. Every evaluation
is stored as structured creator intelligence so the dataset compounds into a
real signal-to-outcome moat over time.

## Demo flow

```
/                Landing — Creator Intelligence Platform positioning
/analyze         Step 1: Upload creator screenshots (or fill manually)
                 Step 2: Review metrics (avg likes & comments from last 30 days,
                        optional followers ~30 days ago) → Evaluate a Creator
                 6-step thinking sequence → Creator Opportunity Brief
/dataset         History + stats — every evaluation auto-saved
/dataset/[id]    Detail + Campaign Outcome update form
```

What the user sees on the result page:

1. **Final Decision** banner — Strong Candidate / Watchlist / Not Recommended + **Decision Confidence** (High / Medium / Low) with reasoning
2. **Creator Opportunity Snapshot** — Commercial Score + 6 pillar cells
3. **Creator Opportunity Brief** — investor-style memo (Executive Summary → Why This Creator Matters → Commercial Upside → Audience & Engagement Signal → Monetization Gap → Risk Factors)
4. **Why this decision?** — expandable pillar reasoning + recommended strategy
5. **Action layer** — 3 outreach drafts (Brand / MCN / Casual warm DM), editable + copyable
6. **Next Action Plan** — 3 prioritized moves (Do now / Do next / Track)
7. **Saved · view in dataset** pill linking to the persistent record

## Stack

- Next.js 16 (App Router, Turbopack) + React 18 + TypeScript
- Tailwind CSS
- OpenAI (optional) — `gpt-4o-mini` for both prose generation and screenshot extraction

No auth, no database, no payments, no Supabase, no Docker. Persistence is browser localStorage so the dataset works offline and the demo never breaks.

## Run locally

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000.

### Optional: enable OpenAI

```bash
cp .env.example .env.local
# paste your OPENAI_API_KEY into .env.local
```

Without the key the platform still works end-to-end:
- The Creator Opportunity Brief is rule-based.
- Screenshot extraction returns a realistic mock with confidence levels.

With the key, both flows call `gpt-4o-mini`. Screenshot extraction uses Vision with `detail: "low"` for fixed, low-cost token usage (~5 cents per 100 evaluations on the screenshot path).

### Try the sample creator

`/analyze?demo=1` — pre-fills **Maya Ortega** (fitness · Instagram · 82.4K followers · supplements).
Metrics use **avg likes + avg comments** from a **last-30-days** style baseline (demo values: 3,000 likes · 790 comments), so **engagement rate** is auto-calculated as `(likes + comments) / followers` (~4.6%).
**30-day growth** is derived from optional **followers ~30 days ago** (demo back-solves ~+11%). Click **Evaluate a Creator →** to run the full pipeline.

If likes/comments or historical followers are missing, the UI shows **Not enough data** / **Unknown** for those readouts; scoring falls back to neutral reach- and growth proxies so the brief still completes.

### Metrics inputs (manual or post-screenshot)

- **Engagement rate** — read-only; computed from avg likes, avg comments, and current followers (use averages from posts in the **last 30 days**).
- **30-day growth** — read-only; computed when **followers ~30 days ago** is provided; otherwise shown as Unknown and not heavily penalized in the pillar blend.
- Screenshot extraction maps **`likes`** and **`comments_count`** into those avg fields when present.

## Deploy to Vercel

This is a vanilla Next.js App Router project, so Vercel is one click:

1. Push this repo to GitHub (already configured).
2. Go to https://vercel.com/new and import the repo.
3. Set the **Root Directory** to `web/`.
4. Add environment variables in the Vercel project settings:
   - `OPENAI_API_KEY` — your key (optional but recommended for production)
   - `OPENAI_MODEL` — defaults to `gpt-4o-mini`
   - `OPENAI_VISION_MODEL` — defaults to `gpt-4o-mini`
5. Deploy. The build runs `next build`; no other configuration needed.

The `/api/analyze` and `/api/extract-screenshot` routes both run on Vercel's Node runtime (60-second max duration). All OpenAI calls happen server-side — the key is never exposed to the client.

## File map

```
web/
├── app/
│   ├── page.tsx                          Landing
│   ├── layout.tsx
│   ├── globals.css
│   ├── analyze/page.tsx                  Step 1+2 input flow → result
│   ├── dataset/page.tsx                  Dataset list + stats
│   ├── dataset/[id]/page.tsx             Detail + outcome update form
│   ├── api/analyze/route.ts              Deterministic scoring + OpenAI prose
│   └── api/extract-screenshot/route.ts   Vision-based signal extraction
├── components/
│   ├── report-card.tsx                   Brief + decision + action layer
│   ├── decision-banner.tsx               Final Decision + Confidence
│   ├── agent-thinking.tsx                6-step evaluation animation
│   ├── outreach-panel.tsx                Brand / MCN / Warm DM tabs
│   ├── screenshot-upload.tsx             Drag/drop + canvas compression
│   └── score-badge.tsx                   Tonal badges
├── lib/
│   ├── types.ts                          Shared types (Report, Decision, etc.)
│   ├── scoring.ts                        Deterministic scoring + memo + outreach
│   ├── openai.ts                         Optional prose enhancement
│   ├── extract.ts                        Screenshot extraction types + mock
│   └── dataset.ts                        localStorage CRUD + stats
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── next.config.mjs
└── postcss.config.mjs
```

## How scoring works

Pillars are 0–100, computed deterministically from inputs:

| Pillar | Driver | Sketch |
|---|---|---|
| Engagement | ER + view-through rate | 75% ER (0–8%) + 25% VTR (0–40%) |
| Reach | Followers + avg views (log) | Log-scaled tier baseline |
| Growth | 30-day rate | 0%→20, 5%→50, 15%→85, 25%+→100 |
| Intent | Comment classification | Purchase % × 3 + Curiosity % × 0.6 |

**Commercial Score** = Engagement × 0.35 + Reach × 0.25 + Growth × 0.25 + Intent × 0.15

**Decision Confidence** is variance-driven — measures how strongly the pillars agree on the call. If σ ≤ 12 confidence is High; σ > 22 is Low. No comment sample caps confidence at Low for transparency.

## The data moat narrative

Every evaluation is stored as structured creator intelligence:

- **Inputs** — profile, metrics, comment sample, brand category
- **Evaluation** — Commercial Score, pillar scores, Final Decision, stated confidence
- **Action** — outreach drafts and the recommended next-action plan
- **Outcome** — campaign status, budget, estimated vs actual ROI, conversion notes

As outcomes flow back via the **Update Campaign Outcome** form on each evaluation detail page, the dataset compounds into a creator-signal-to-campaign-outcome dataset nobody else has. Storage today is localStorage; the same schema swaps cleanly into Postgres / Supabase on day one of production.

## Production-ready next steps (not in this demo)

- Auth (Clerk / Supabase) + multi-user dataset
- Postgres-backed dataset (drop-in for the localStorage layer)
- Screenshot OCR fallback when Vision call rate-limits
- Bulk evaluation queue + CSV import
- Slack / email outreach integration
- PDF export of the Creator Opportunity Brief
- Stripe billing
