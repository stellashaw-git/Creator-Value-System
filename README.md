# Creator Value System / WorthyIQ

This repo contains **two apps**:

| Path | What it is | Deploy target |
|------|------------|---------------|
| **`web/`** | WorthyIQ — Next.js production app | **Vercel** |
| **Repo root** | Streamlit prototype (`streamlit_app.py`) | Local only — **not Vercel** |

## Vercel (production)

**Always deploy from `web/`, not the repo root.**

In [Vercel](https://vercel.com) → Project → **Settings** → **Build and Deployment**:

| Setting | Required value |
|---------|----------------|
| **Root Directory** | `web` |
| **Include files outside the root directory in the Build Step** | **Disabled** |
| **Framework** | Next.js |

Full checklist: [`web/DEPLOY.md`](web/DEPLOY.md)

### Do not reintroduce `app.py` at repo root

Vercel auto-detects any file named **`app.py`** as a Python serverless entrypoint and the build fails with:

`Found app.py but it does not export a top-level "app", "application", or "handler" variable.`

The Streamlit entrypoint must stay named **`streamlit_app.py`**. The Next.js `npm run build` in `web/` runs a guard that fails if `app.py` exists at the repo root again.

## Streamlit prototype (local)

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

## WorthyIQ development

```bash
cd web
npm install
npm run dev
```

See [`web/README.md`](web/README.md).
