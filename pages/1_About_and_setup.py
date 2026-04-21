"""
Sidebar page: how to run the demo and where data lives.

Streamlit loads scripts in `pages/` as extra pages (sidebar navigation).
"""

import streamlit as st

st.set_page_config(page_title="About & setup", layout="wide")

st.title("About this demo")
st.markdown(
    """
This **Creator Monetization Copilot** uses sample CSVs under `datasets/` and optional
`OPENAI_API_KEY` for the personalized readout.

### Run locally

```bash
cd creator-intelligence-mvp
pip install -r requirements.txt
streamlit run app.py
```

### Environment (optional)

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Enables coach-style memo + richer comment labels |
| `OPENAI_MODEL` | Defaults to `gpt-4o-mini` if unset |

### Data files

| File | Role |
|------|------|
| `datasets/beauty_creators.csv` (and fitness / lifestyle) | Creator metrics per niche |
| `datasets/comments.csv` | Optional comments matched by `username` |

Use the sidebar to switch back to **app** (main copilot).
"""
)
