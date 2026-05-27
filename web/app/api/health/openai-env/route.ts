import { NextResponse } from "next/server";

/**
 * Safe deploy check — confirms which OPENAI_API_KEY shape the running server sees.
 * Does not call OpenAI and does not return the full secret.
 */
export async function GET(): Promise<NextResponse> {
  const raw = process.env.OPENAI_API_KEY?.trim() ?? "";
  let hint: string;
  if (!raw) {
    hint = "missing";
  } else if (raw === "test") {
    hint = "literal-test-placeholder";
  } else if (raw.startsWith("sk-")) {
    hint = `sk-… (length ${raw.length})`;
  } else {
    hint = `other (length ${raw.length}, prefix ${raw.slice(0, 3)}…)`;
  }

  return NextResponse.json({
    openai_key_hint: hint,
    vision_model:
      process.env.OPENAI_VISION_MODEL?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      "gpt-4o-mini",
    vercel_env: process.env.VERCEL_ENV ?? null,
    git_sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  });
}
