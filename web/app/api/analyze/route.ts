import { NextResponse, type NextRequest } from "next/server";
import { computeEngagementMetrics } from "@/lib/engagement-metrics";
import { parseNonNegativeNumber } from "@/lib/parse-numeric-input";
import { buildReport } from "@/lib/scoring";
import { enhanceWithAI } from "@/lib/openai";
import { CAMPAIGN_GOALS, type CampaignGoal } from "@/lib/intelligence-types";
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
  const creatorHandle =
    typeof b.creatorHandle === "string" && b.creatorHandle.trim()
      ? b.creatorHandle.trim()
      : undefined;
  const displayName =
    typeof b.displayName === "string" && b.displayName.trim()
      ? b.displayName.trim()
      : undefined;
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
  const averageReposts = optionalNonnegParsed(b.averageReposts, "averageReposts");
  const averageShares = optionalNonnegParsed(b.averageShares, "averageShares");
  const averageSaves = optionalNonnegParsed(b.averageSaves, "averageSaves");
  const followers30DaysAgo = optionalNonnegParsed(b.followers30DaysAgo, "followers30DaysAgo");

  const metrics = computeEngagementMetrics({
    followers,
    averageLikes,
    averageComments,
    averageReposts,
    averageShares,
    averageSaves,
    averageViews: avgViews > 0 ? avgViews : undefined,
  });

  let engagementRate: number | undefined =
    metrics.expandedEngagementRate ?? metrics.basicEngagementRate ?? undefined;

  if (engagementRate === undefined) {
    const rawEr = b.engagementRate;
    if (rawEr !== undefined && rawEr !== null && rawEr !== "") {
      const er0 = typeof rawEr === "number" ? rawEr : Number(rawEr);
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

  const campaignGoalRaw =
    typeof b.campaignGoal === "string" ? b.campaignGoal.trim() : "";
  const campaignGoal = CAMPAIGN_GOALS.includes(campaignGoalRaw as CampaignGoal)
    ? (campaignGoalRaw as CampaignGoal)
    : undefined;

  const screenshotTypesUploaded = Array.isArray(b.screenshotTypesUploaded)
    ? b.screenshotTypesUploaded.map((x) => String(x)).filter(Boolean)
    : undefined;

  const screenshotTypesDetected = Array.isArray(b.screenshotTypesDetected)
    ? b.screenshotTypesDetected.map((x) => String(x)).filter(Boolean)
    : undefined;

  const detectedPlatform =
    typeof b.detectedPlatform === "string" && b.detectedPlatform.trim()
      ? b.detectedPlatform.trim()
      : undefined;

  const platformOverride =
    typeof b.platformOverride === "string" && b.platformOverride.trim()
      ? b.platformOverride.trim()
      : undefined;

  const platformConfidenceRaw = b.platformConfidence;
  const platformConfidence =
    platformConfidenceRaw === "high" ||
    platformConfidenceRaw === "medium" ||
    platformConfidenceRaw === "low"
      ? platformConfidenceRaw
      : undefined;

  let recentPostCount: number | undefined;
  if (typeof b.recentPostCount === "number" && b.recentPostCount > 0) {
    recentPostCount = Math.floor(b.recentPostCount);
  }

  let recentPostMetrics: AnalyzeInput["recentPostMetrics"];
  if (Array.isArray(b.recentPostMetrics) && b.recentPostMetrics.length > 0) {
    recentPostMetrics = b.recentPostMetrics
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((row, i) => ({
        screenshot_id:
          typeof row.screenshot_id === "string" && row.screenshot_id.trim()
            ? row.screenshot_id.trim()
            : `screenshot_${i + 1}`,
        likes_count: optionalNonnegParsed(row.likes_count, "likes_count") ?? null,
        comments_count: optionalNonnegParsed(row.comments_count, "comments_count") ?? null,
        reposts_count: optionalNonnegParsed(row.reposts_count, "reposts_count") ?? null,
        shares_count: optionalNonnegParsed(row.shares_count, "shares_count") ?? null,
        saves_count: optionalNonnegParsed(row.saves_count, "saves_count") ?? null,
        views_count: optionalNonnegParsed(row.views_count, "views_count") ?? null,
      }));
  }

  return {
    name,
    creatorHandle,
    displayName,
    platform,
    niche,
    followers,
    avgViews,
    engagementRate,
    growthRate30d,
    averageLikes,
    averageComments,
    averageReposts,
    averageShares,
    averageSaves,
    followers30DaysAgo,
    engagementComponentsUsed: metrics.engagementComponentsUsed,
    screenshotTypesUploaded,
    screenshotTypesDetected,
    recentPostMetrics,
    recentPostCount,
    detectedPlatform,
    platformConfidence,
    platformOverride,
    comments,
    brandCategory,
    campaignGoal,
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

  const base = buildReport(input);
  const report = await enhanceWithAI(base);

  return NextResponse.json({ report });
}
