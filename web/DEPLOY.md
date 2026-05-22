# WorthyIQ — Vercel deployment

Production is **only** the Next.js app in this directory (`web/`).

## Required Vercel settings

Project → **Settings** → **Build and Deployment**:

1. **Root Directory:** `web` (not empty, not `/`)
2. **Include files outside the root directory in the Build Step:** **Disabled**
3. **Framework Preset:** Next.js (default when root is `web`)

Environment variables → **Settings** → **Environment Variables** (Production):

- `OPENAI_API_KEY` (recommended)
- `OPENAI_MODEL` / `OPENAI_VISION_MODEL` (optional)
- `INTELLIGENCE_WEBHOOK_URL` / `INTELLIGENCE_WEBHOOK_SECRET` (optional, Make sync)

## Common build failure (prevented in repo)

**Error:** `Found app.py but it does not export a top-level "app", "application", or "handler" variable.`

**Cause:** Vercel scanned the **repo root** Streamlit file. Any root-level file named `app.py` triggers Python detection.

**Fix:**

- Keep Streamlit at repo root as `streamlit_app.py` — **never** `app.py`
- Root Directory = `web`
- Disable “Include files outside the root directory”

## Build guard

`npm run build` runs `scripts/vercel-build-guard.mjs` first. If someone adds `app.py` back at the repo root, the build fails locally and on Vercel with a clear message.

## Redeploy after env changes

Deployments → latest → **⋯** → **Redeploy** (env vars apply on the next build).
