import { NextResponse, type NextRequest } from "next/server";
import { parseNonNegativeNumber } from "@/lib/parse-numeric-input";
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

  const optionalNonnegParsed = (v: unknown, label: string): number | undefined => {
    if (v === undefined || v === null || v === "") return undefined;
    const r = parseNonNegativeNumber(String(v));
    if (!r.ok) {
      if (r.empty) return undefined;
      throw new Error(`${label} must be a valid non-negative number.`);
    }
    return Math.min(5e9, r.value);
  };

  const name = String(b.name ?? "").trim() || "Unnamed Creator";
  const platform = String(b.platform ?? "Instagram") as Platform;
  if (!PLATFORMS.includes(platform)) throw new Error("Invalid platform.");
  const niche = String(b.niche ?? "Other") as Niche;
  if (!NICHES.includes(niche)) throw new Error("Invalid niche.");

  const fr = parseNonNegativeNumber(String(b.followers ?? ""));
  if (!fr.ok) throw new Error("followers must be a valid number.");
  if (fr.value <= 0) throw new Error("followers must be greater than 0.");
  const followers = Math.min(5e9, fr.value);

  const av = parseNonNegativeNumber(String(b.avgViews ?? ""));
  let avgViews = 0;
  if (av.ok) {
    avgViews = Math.min(5e9, av.value);
  } else if (!av.empty) {
    throw new Error("avgViews must be a valid non-negative number.");
  }

  const averageLikes = optionalNonnegParsed(b.averageLikes, "averageLikes");
  const averageComments = optionalNonnegParsed(b.averageComments, "averageComments");
  const followers30DaysAgo = optionalNonnegParsed(b.followers30DaysAgo, "followers30DaysAgo");

  let engagementRate: number | undefined;
  if (
    averageLikes !== undefined &&
    averageComments !== undefined &&
    followers > 0
  ) {
    engagementRate = Math.min(1, (averageLikes + averageComments) / followers);
  } else {
    const raw = b.engagementRate;
    if (raw !== undefined && raw !== null && raw !== "") {
      const er0 = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(er0) && er0 >= 0 && er0 <= 1) engagementRate = er0;
    }
  }

  let growthRate30d: number | undefined;
  if (followers30DaysAgo !== undefined && followers30DaysAgo > 0) {
    growthRate30d = (followers - followers30DaysAgo) / followers30DaysAgo;
    if (!Number.isFinite(growthRate30d) || growthRate30d < -1 || growthRate30d > 5) {
      growthRate30d = undefined;
    }
  } else {
    const rawG = b.growthRate30d;
    if (rawG !== undefined && rawG !== null && rawG !== "") {
      const g = typeof rawG === "number" ? rawG : Number(rawG);
      if (Number.isFinite(g) && g >= -1 && g <= 5) growthRate30d = g;
    }
  }

  const commentsRaw = b.comments;
  const comments: string[] = Array.isArray(commentsRaw)
    ? commentsRaw.map((c) => String(c)).filter((c) => c.trim().length > 0)
    : [];

  const brandCategory =
    typeof b.brandCategory === "string" && b.brandCategory.trim()
      ? b.brandCategory.trim()
      : undefined;

  return {
    name,
    platform,
    niche,
    followers,
    avgViews,
    engagementRate,
    growthRate30d,
    averageLikes,
    averageComments,
    followers30DaysAgo,
    comments,
    brandCategory,
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
