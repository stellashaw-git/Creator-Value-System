import { NextResponse, type NextRequest } from "next/server";
import OpenAI from "openai";
import {
  MOCK_EXTRACTION,
  normalizeExtractedSignals,
  type ExtractedSignals,
  type ExtractionResponse,
  type ScreenshotLabel,
} from "@/lib/extract";
import {
  buildScreenshotClassifications,
  logExtractionPipeline,
  mergeExtractionByFinalType,
} from "@/lib/extraction-pipeline";
import { normalizeDetectedPlatform } from "@/lib/platform-detect";
import {
  buildPerImageClassificationHints,
  resolveFinalTypes,
  resolveScreenshotType,
  type ScreenshotTypeDetection,
} from "@/lib/screenshot-type-detect";
import type { Platform } from "@/lib/types";
import { buildUsageLog, logExtractionUsage } from "@/lib/extraction-cost";
import {
  describeValueShape,
  normalizePerImageArray,
  normalizeStringList,
} from "@/lib/vision-response-normalize";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES = 5;
const MAX_BYTES = 8 * 1024 * 1024;

const VALID_LABELS: ScreenshotLabel[] = [
  "profile",
  "post",
  "comments",
  "analytics",
  "other",
];

const SYSTEM =
  "Extract structured creator signals from social media screenshots. " +
  "Detect platform from UI. Copy handles exactly as visible. " +
  "Comments: verbatim OCR only — no rewrite or translation. " +
  "Return ONE compact JSON object only. No markdown. No prose. No explanations outside JSON.";

const USER_INSTRUCTION = `Extract creator signals from screenshots. Return compact JSON only.

per_image must be a JSON array with one object per screenshot, in order:
{ "image_index", "visual_signals" (max 5 short strings), "ocr_snippets" (max 15 for Reels/video grid, max 12 for post, max 8 otherwise), "llm_suggested_type" ("profile"|"post"|"comments"|"analytics"|"other"), optional "post_metrics" for post images, optional "reel_view_counts" (number array) and "average_views" for Reels grids }
For llm_suggested_type: full-screen reel/video with engagement icons stacked on the RIGHT → "post". Comment thread with reply rows → "comments". Profile header with Follow/Message or reels thumbnail grid → "profile". Do not label vertical post UI as "comments" just because a speech-bubble icon appears.

Platform: detected_platform ("Instagram"|"TikTok"|"YouTube"|"X / Twitter"|"Xiaohongshu / RED"|"Other"), platform_confidence, platform_detection_notes (max 80 chars)

Route by final image type:
- profile OR Reels/video thumbnail grid → creator_handle, display_name, bio, followers, following, niche when visible
  CRITICAL for Reels/video grid (play icon + view counts on thumbnails): ocr_snippets MUST include every visible view count exactly as shown (e.g. "74.7K", "42.2K", "149K"). Set reel_view_counts to the normalized integers [74700,42200,...] and average_views to their mean. Do NOT omit thumbnail view counts in favor of caption text.
- post → post_metrics object with ALL visible engagement counts: layout_detected ("bottom_row"|"right_side_vertical"|"unknown"), likes_count, comments_count, reposts_count, shares_count (or shares), saves_count, views_count
  Engagement metrics may appear either in a bottom horizontal row OR a right-side vertical column. Inspect both positions. Map counts near heart icons to likes, speech bubbles to comments, repost/reshare icons to reposts, send/share arrows to shares, bookmarks to saves, and play/view indicators to views.
  When USER-CORRECTED type is Recent Post for an image, always fill post_metrics for that image even if you would otherwise classify it differently.
  Bottom-row layout (Instagram/Threads feed): icon row under caption — heart=likes, speech bubble=comments, repost arrow=reposts, paper plane=shares/sends, bookmark=saves. Set layout_detected to "bottom_row".
  Right-side vertical layout (Reels/TikTok/full-screen): stacked icons on the right edge top-to-bottom typically heart→comments→repost→share/send→bookmark. Set layout_detected to "right_side_vertical". List each count in ocr_snippets with its icon (e.g. "180K heart", "181 comments").
  Instagram/Threads feed posts do NOT show view counts — set views_count to null unless the UI explicitly labels views/plays/impressions.
- comments → verbatim sample_comments + intent buckets (purchase_intent_comments, curiosity_comments, trust_comments, generic_comments, negative_comments), comment_extraction_confidence, detected_comment_language
  sample_comments must be real comment TEXT only (usernames, sentences, emoji) — NEVER view counts (49.9M, 32.2K), likes, followers, or other metrics. Put metrics only in post_metrics or profile fields.
- analytics → engagement_rate, growth_30d, reach/impressions

SCHEMA keys (use null when not visible):
per_image, detected_platform, platform_confidence, platform_detection_notes, creator_handle, display_name, creator_name, platform, bio, niche, followers, following, subscribers, average_views, likes, comments_count, shares, likes_count, reposts_count, saves_count, views_count, engagement_rate, growth_30d, sample_comments, purchase_intent_comments, curiosity_comments, generic_comments, trust_comments, negative_comments, comment_extraction_confidence, detected_comment_language, visible_post_signals, extraction_notes (max 3 short strings), confidence, missing_fields, notes (empty string)

Rules:
- Visible data only. Handles copied exactly.
- Normalize numbers: 12.5K→12500, 1.2M→1200000.
- engagement_rate and growth_30d as PERCENTAGES (4.6 not 0.046).
- niche: "Beauty"|"Fashion"|"Fitness"|"Lifestyle"|"Luxury"|"Tech"|"Food"|"Gaming"|"Other"|null.
- JSON only. No markdown. No narrative.`;

interface VisionParseResult extends Partial<ExtractedSignals> {
  per_image?: Array<{
    image_index?: number;
    visual_signals?: string[];
    ocr_snippets?: string[];
    llm_suggested_type?: string;
    post_metrics?: {
      layout_detected?: unknown;
      likes_count?: unknown;
      comments_count?: unknown;
      reposts_count?: unknown;
      shares_count?: unknown;
      shares?: unknown;
      saves_count?: unknown;
      views_count?: unknown;
    };
    reel_view_counts?: unknown;
    average_views?: unknown;
  }>;
}

function labelPromptName(label: ScreenshotLabel): string {
  const names: Record<ScreenshotLabel, string> = {
    profile: "Profile",
    post: "Recent Post",
    comments: "Comments",
    analytics: "Analytics",
    other: "Other",
  };
  return names[label];
}

function routingContext(
  imageLabels: ScreenshotLabel[],
  overrides: boolean[],
  reExtract: boolean
): string {
  if (reExtract) {
    const lines = imageLabels.map(
      (t, i) =>
        `Image ${i + 1}: The user corrected this screenshot type to: "${labelPromptName(t)}". Treat this as the source of truth unless the image clearly contradicts it.`
    );
    return (
      "\nUSER-CORRECTED SCREENSHOT TYPES (re-extraction — binding):\n" +
      lines.join("\n") +
      "\nRoute ALL extraction using these final types. Detected types are hints only.\n"
    );
  }

  const overrideLines = imageLabels
    .map((t, i) =>
      overrides[i]
        ? `Image ${i + 1}: The user corrected this screenshot type to: "${labelPromptName(t)}". Treat this as the source of truth unless the image clearly contradicts it.`
        : null
    )
    .filter(Boolean);

  if (!overrideLines.length) {
    return (
      "\nFINAL IMAGE TYPES: No user overrides. " +
      "Detect each screenshot type in STEP 0, then route extraction by your detected type.\n"
    );
  }

  return (
    "\nUSER-CORRECTED SCREENSHOT TYPES:\n" +
    overrideLines.join("\n") +
    "\nFor images without user correction, detect type in STEP 0 and route by detected type.\n"
  );
}

function commentsRoutingNote(
  imageLabels: ScreenshotLabel[],
  overrides: boolean[],
  reExtract: boolean
): string {
  const hasComments = reExtract
    ? imageLabels.includes("comments")
    : overrides.some((o, i) => o && imageLabels[i] === "comments");
  if (!hasComments) {
    return (
      "\nIf any screenshot shows a comment thread, still apply STEP 3 OCR-first rules for that image.\n"
    );
  }
  return (
    "\nCOMMENTS SCREENSHOT PRESENT: Apply STEP 3 OCR-first rules strictly. " +
    "Verbatim extraction only — no translation or rewriting.\n"
  );
}

function ok(data: ExtractionResponse): NextResponse {
  return NextResponse.json(data);
}

function dedupeFiles(files: File[]): File[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = `${file.name}:${file.size}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function callVisionWithRetry(
  client: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await client.chat.completions.create(params);
    } catch (err) {
      lastError = err;
      if (attempt === 0) {
        console.log("[extract-screenshot] vision retry", {
          attempt: attempt + 1,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function logExtractionDebug(
  typeDetections: ScreenshotTypeDetection[],
  finalTypes: ScreenshotLabel[],
  extraction: ExtractedSignals
): void {
  for (const det of typeDetections) {
    console.log("[extract-screenshot] type detection", {
      image_index: det.image_index,
      auto_detected_type: det.auto_detected_type,
      detection_confidence: det.detection_confidence,
      final_type: finalTypes[det.image_index],
      scores: {
        profile: det.profile_score,
        post: det.recent_post_score,
        comments: det.comments_score,
        analytics: det.analytics_score,
      },
      reasons: det.detection_reasons,
      ocr_snippets: det.ocr_snippets.slice(0, 5),
      heuristic_matches: det.detection_reasons,
    });
  }
  console.log("[extract-screenshot] recent post aggregation", {
    recent_post_metrics: extraction.recent_post_metrics,
    recent_post_count: extraction.recent_post_count,
    avg_likes: extraction.avg_likes,
    avg_comments: extraction.avg_comments,
    avg_reposts: extraction.avg_reposts,
    avg_shares: extraction.avg_shares,
    avg_saves: extraction.avg_saves,
    avg_views: extraction.avg_views,
    layouts: extraction.recent_post_metrics.map((r) => ({
      screenshot_id: r.screenshot_id,
      likes_count: r.likes_count,
      comments_count: r.comments_count,
    })),
  });
  console.log("[extract-screenshot] comments extraction", {
    comment_extraction_confidence: extraction.comment_extraction_confidence,
    detected_comment_language: extraction.detected_comment_language,
    sample_comments_count: extraction.sample_comments.length,
    purchase_intent_count: extraction.purchase_intent_comments.length,
    curiosity_count: extraction.curiosity_comments.length,
    trust_count: extraction.trust_comments.length,
    generic_count: extraction.generic_comments.length,
    negative_count: extraction.negative_comments.length,
    ocr_raw_sample: extraction.sample_comments.slice(0, 5),
  });
}

function buildTypeDetections(
  parsed: VisionParseResult,
  imageCount: number
): ScreenshotTypeDetection[] {
  const perImage = normalizePerImageArray(parsed.per_image);
  const detections: ScreenshotTypeDetection[] = [];

  for (let i = 0; i < imageCount; i++) {
    const entry =
      (Array.isArray(perImage)
        ? perImage.find((p) => p.image_index === i)
        : undefined) ??
      perImage[i] ??
      {};
    const visual_signals = normalizeStringList(entry.visual_signals);
    const ocr_snippets = normalizeStringList(entry.ocr_snippets);
    console.log("[extract-screenshot] buildTypeDetections", {
      image_index: i,
      rule_classifier_called: true,
      visual_signals_length: visual_signals.length,
      ocr_snippets_length: ocr_snippets.length,
      llm_suggested_type: entry.llm_suggested_type,
    });
    detections.push(
      resolveScreenshotType(i, {
        visual_signals,
        ocr_snippets,
        llm_suggested_type: entry.llm_suggested_type,
      })
    );
  }

  return detections;
}

function parseVisionResponse(
  text: string,
  imageCount: number
): {
  parsed: VisionParseResult;
  perImage: ReturnType<typeof normalizePerImageArray>;
  typeDetections: ScreenshotTypeDetection[];
} {
  const parsed = JSON.parse(text) as VisionParseResult;
  console.log("[extract-screenshot] raw response shape", {
    parsedType: typeof parsed,
    per_image_shape: describeValueShape(parsed.per_image),
    top_level_keys:
      parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 20) : [],
  });

  const perImage = normalizePerImageArray(parsed.per_image);
  console.log("[extract-screenshot] normalized per_image", {
    count: perImage.length,
    imageCount,
    entries: perImage.map((entry, i) => ({
      index: i,
      image_index: entry.image_index,
      llm_suggested_type: entry.llm_suggested_type,
      has_post_metrics: Boolean(entry.post_metrics),
    })),
  });

  const typeDetections = buildTypeDetections(parsed, imageCount);
  return { parsed, perImage, typeDetections };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  const files = dedupeFiles(
    formData.getAll("files").filter((f): f is File => f instanceof File)
  );

  let imageLabels: ScreenshotLabel[] = [];
  const labelsRaw = formData.get("image_labels");
  if (typeof labelsRaw === "string" && labelsRaw.trim()) {
    try {
      const parsed = JSON.parse(labelsRaw) as unknown;
      if (Array.isArray(parsed)) {
        imageLabels = parsed.filter((x): x is ScreenshotLabel =>
          VALID_LABELS.includes(x as ScreenshotLabel)
        );
      }
    } catch {
      /* optional */
    }
  }

  let labelOverrides: boolean[] = [];
  const overridesRaw = formData.get("label_overrides");
  if (typeof overridesRaw === "string" && overridesRaw.trim()) {
    try {
      const parsed = JSON.parse(overridesRaw) as unknown;
      if (Array.isArray(parsed)) {
        labelOverrides = parsed.map((x) => Boolean(x));
      }
    } catch {
      /* optional */
    }
  }

  const reExtract = formData.get("re_extract") === "true";

  let imageNames: string[] = [];
  const namesRaw = formData.get("image_names");
  if (typeof namesRaw === "string" && namesRaw.trim()) {
    try {
      const parsed = JSON.parse(namesRaw) as unknown;
      if (Array.isArray(parsed)) {
        imageNames = parsed.map((x) => String(x));
      }
    } catch {
      /* optional */
    }
  }

  let platformOverride: Platform | null = null;
  const overrideRaw = formData.get("platform_override");
  if (typeof overrideRaw === "string" && overrideRaw.trim()) {
    platformOverride = normalizeDetectedPlatform(overrideRaw);
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No images uploaded." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FILES} screenshots per extraction.` },
      { status: 400 }
    );
  }

  for (const file of files) {
    const type = (file.type || "").toLowerCase();
    const isImage =
      type.startsWith("image/") ||
      type === "application/octet-stream" ||
      !type;
    if (!isImage) {
      return NextResponse.json(
        { error: `${file.name || "file"} is not an image.` },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `${file.name || "file"} is larger than 8 MB after compression.` },
        { status: 400 }
      );
    }
  }

  while (imageLabels.length < files.length) {
    const defaults: ScreenshotLabel[] = ["profile", "post", "comments", "analytics", "other"];
    imageLabels.push(defaults[Math.min(imageLabels.length, defaults.length - 1)]);
  }
  while (labelOverrides.length < files.length) {
    labelOverrides.push(false);
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const mockDetections = files.map((_, i) =>
      resolveScreenshotType(i, {
        visual_signals: ["mock profile grid", "follower count"],
        ocr_snippets: ["82.4K followers"],
        llm_suggested_type: i === 0 ? "profile" : i === 1 ? "post" : "comments",
      })
    );
    const finalTypes = resolveFinalTypes(mockDetections, imageLabels, labelOverrides, reExtract);
    const extraction = normalizeExtractedSignals(MOCK_EXTRACTION, platformOverride);
    return ok({
      extraction,
      mode: "mock",
      images_received: files.length,
      type_detections: mockDetections,
      final_types: finalTypes,
      warning: "OPENAI_API_KEY not set — returning realistic mock extraction.",
    });
  }

  const dataUrls: string[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "image/jpeg";
    dataUrls.push(`data:${mime};base64,${buffer.toString("base64")}`);
  }

  // Pre-routing: user labels binding on re-extract or per-index overrides
  const preliminaryFinal = reExtract
    ? imageLabels
    : imageLabels.map((label, i) => (labelOverrides[i] ? label : ("other" as ScreenshotLabel)));

  try {
    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

    const instruction =
      USER_INSTRUCTION +
      routingContext(imageLabels, labelOverrides, reExtract) +
      commentsRoutingNote(imageLabels, labelOverrides, reExtract) +
      (platformOverride ? `\nUSER PLATFORM OVERRIDE: Treat screenshots as "${platformOverride}".\n` : "");

    const imageDetail: "auto" | "high" = imageLabels.some(
      (l) => l === "post" || l === "profile"
    )
      ? "high"
      : "auto";

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: instruction },
      ...dataUrls.map((url) => ({
        type: "image_url" as const,
        image_url: { url, detail: imageDetail },
      })),
    ];

    const resp = await callVisionWithRetry(client, {
      model,
      temperature: 0.05,
      max_tokens: 1800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
      ],
    });

    const inputTokens = resp.usage?.prompt_tokens ?? 0;
    const outputTokens = resp.usage?.completion_tokens ?? 0;
    const totalTokens = resp.usage?.total_tokens ?? inputTokens + outputTokens;
    const usage = buildUsageLog(model, dataUrls.length, inputTokens, outputTokens, totalTokens);
    logExtractionUsage(usage);

    const text = resp.choices[0]?.message?.content || "{}";
    const { parsed, perImage, typeDetections } = parseVisionResponse(text, files.length);
    const finalTypes = resolveFinalTypes(
      typeDetections,
      imageLabels,
      labelOverrides,
      reExtract
    );
    const filenames = files.map((f, i) => imageNames[i] ?? f.name ?? `screenshot_${i + 1}`);
    const classifications = buildScreenshotClassifications(
      typeDetections,
      finalTypes,
      filenames
    );

    const routed = mergeExtractionByFinalType(
      parsed as Record<string, unknown>,
      perImage,
      finalTypes,
      files.length
    );
    const extraction = normalizeExtractedSignals(routed, platformOverride);
    logExtractionDebug(typeDetections, finalTypes, extraction);
    logExtractionPipeline(classifications, parsed as Record<string, unknown>, extraction, {
      creator_handle: extraction.creator_handle,
      followers: extraction.followers,
      avg_likes: extraction.avg_likes,
      avg_comments: extraction.avg_comments,
      recent_post_count: extraction.recent_post_count,
      sample_comments: extraction.sample_comments.length,
    });

    const per_image_hints = buildPerImageClassificationHints(perImage);

    return ok({
      extraction,
      mode: "openai",
      images_received: files.length,
      type_detections: typeDetections,
      final_types: finalTypes,
      per_image_hints,
      usage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const reason =
      message.includes("JSON") || message.includes("parse")
        ? "response_parse_error"
        : "openai_call_failed";
    console.log("[extract-screenshot] mock fallback", {
      reason,
      error: message,
    });
    const extraction = normalizeExtractedSignals(MOCK_EXTRACTION, platformOverride);
    return ok({
      extraction,
      mode: "mock_fallback",
      images_received: files.length,
      warning: `Vision call failed (${message}) — using mock extraction so the demo continues.`,
    });
  }
}
