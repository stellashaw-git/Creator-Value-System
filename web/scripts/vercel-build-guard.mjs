/**
 * Fails the build if repo root contains app.py — Vercel treats it as Python serverless.
 * Streamlit must use streamlit_app.py at repo root (see README.md).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(webDir);
const rogueAppPy = path.join(repoRoot, "app.py");

if (fs.existsSync(rogueAppPy)) {
  console.error(
    "\n[Vercel build guard] Found app.py at the repository root.\n" +
      "Vercel will fail with: \"does not export app/application/handler\".\n\n" +
      "  • Rename or remove app.py (Streamlit entrypoint: streamlit_app.py)\n" +
      "  • Vercel Root Directory must be: web\n" +
      "  • Disable \"Include files outside the root directory in the Build Step\"\n\n" +
      "See web/DEPLOY.md\n"
  );
  process.exit(1);
}
