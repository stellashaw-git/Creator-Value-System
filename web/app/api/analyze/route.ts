import { NextResponse, type NextRequest } from "next/server";
import { buildReport } from "@/lib/scoring";
import { enhanceWithAI } from "@/lib/openai";
import type { AnalyzeInput, Niche, Platform } from "@/lib/types";

export const runtime = "nodejs";

const NICHES: Niche[] = [
  "Beauty", "Fashion", "Fitness", "Lifestyle", "Luxury",
  "Tech", "Food", "Gaming", "Other",
];
const PLATFORMS: Platform[] = [
  "Instagram", "TikTok", "YouTube", "X / Twitter", "Xiaohongshu / RED", "Other",
];

function parseInput(raw: unknown): AnalyzeInput {
  if (!raw || typeof raw !== "object") throw new Error("Body must be an object.");
  const b = raw as Record<string, unknown>;

  const num = (v: unknown, name: string, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) throw new Error(`${name} must be a number.`);
    if (n < min || n > max) throw new Error(`${name} out of range.`);
    return n;
  };

  const name = String(b.name ?? "").trim() || "Unnamed Creator";
  const platform = String(b.platform ?? "Instagram") as Platform;
  if (!PLATFORMS.includes(platform)) throw new Error("Invalid platform.");
  const niche = String(b.niche ?? "Other") as Niche;
  if (!NICHES.includes(niche)) throw new Error("Invalid niche.");

  const followers = num(b.followers, "followers", 0, 5e9);
  const avgViews = num(b.avgViews ?? 0, "avgViews", 0, 5e9);
  const engagementRate = num(b.engagementRate ?? 0, "engagementRate", 0, 1);
  const growthRate30d = num(b.growthRate30d ?? 0, "growthRate30d", -1, 5);

  const commentsRaw = b.comments;
  const comments: string[] = Array.isArray(commentsRaw)
    ? commentsRaw.map((c) => String(c)).filter((c) => c.trim().length > 0)
    : [];

  const brandCategory =
    typeof b.brandCategory === "string" && b.brandCategory.trim()
      ? b.brandCategory.trim()
      : undefined;

  return {
    name, platform, niche, followers, avgViews,
    engagementRate, growthRate30d, comments, brandCategory,
  };
}

export async function POST(req: NextRequest) {
  let input: AnalyzeInput;
  try {
    input = parseInput(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid input" },
      { status: 400 }
    );
  }

  // Deterministic scoring always runs.
  const base = buildReport(input);

  // Optional: enhance prose with OpenAI if the key is set. Falls back silently.
  const report = await enhanceWithAI(base);

  return NextResponse.json({ report });
}
