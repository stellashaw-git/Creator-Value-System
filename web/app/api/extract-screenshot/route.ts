import { NextResponse, type NextRequest } from "next/server";
import OpenAI from "openai";
import {
  MOCK_EXTRACTION,
  normalizeExtractedSignals,
  type ExtractedSignals,
  type ExtractionResponse,
  type ScreenshotLabel,
} from "@/lib/extract";
import { normalizeDetectedPlatform } from "@/lib/platform-detect";
import type { Platform } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES = 5;
const MAX_BYTES = 8 * 1024 * 1024;

const SYSTEM =
  "You extract structured creator signals from social media screenshots. " +
  "First detect the platform from UI layout, branding, and icons. " +
  "Then apply that platform's metric mapping rules. " +
  "Return ONLY one JSON object. Never invent numbers — use null when not visible.";

const USER_INSTRUCTION = `Extract structured creator signals from the attached screenshots.

STEP 1 — PLATFORM DETECTION (required first)
Inspect app UI, layout, icons, branding, labels, and handle formats.
Return:
- detected_platform: EXACTLY one of "Instagram" | "TikTok" | "YouTube" | "X / Twitter" | "Xiaohongshu / RED" | "Other"
- platform_confidence: "high" | "medium" | "low"
- platform_detection_notes: one short sentence citing visible cues (e.g. "TikTok For You feed with vertical video UI")

If platform_confidence is "low", avoid inferring ambiguous metrics — use null and note in extraction_notes.

STEP 2 — PLATFORM-SPECIFIC METRIC MAPPING (only map icons clearly visible)

Instagram:
- heart → likes_count | speech bubble → comments_count | repost/reshare → reposts_count
- send/share paper plane → shares (NOT reposts) | bookmark → saves_count | play/eye → views_count

TikTok:
- heart → likes_count | speech bubble → comments_count | bookmark → saves_count
- share arrow → shares | play/views count → views_count | repost if visible → reposts_count

YouTube:
- subscribers → subscribers (also map to followers if profile shows subscribers as audience size)
- views → views_count | likes → likes_count | comments → comments_count | shares if visible → shares

X / Twitter:
- reply → comments_count | repost icon → reposts_count | heart → likes_count
- views/impressions → views_count | bookmark → saves_count | share if visible → shares

Xiaohongshu / RED:
- followers → followers | likes → likes_count | collects/saves → saves_count
- comments → comments_count | shares → shares | views if visible → views_count

Other / unknown platform:
- extract only clearly visible metrics; do not guess icon meanings

Also sync legacy fields: likes, comments_count, shares, average_views when setting *_count fields.

SCHEMA (return JSON with exactly these keys):
{
  "detected_platform": string | null,
  "platform_confidence": "high" | "medium" | "low",
  "platform_detection_notes": string,
  "creator_name": string | null,
  "platform": string | null,
  "bio": string | null,
  "niche": string | null,
  "followers": number | null,
  "following": number | null,
  "subscribers": number | null,
  "average_views": number | null,
  "likes": number | null,
  "comments_count": number | null,
  "shares": number | null,
  "likes_count": number | null,
  "reposts_count": number | null,
  "saves_count": number | null,
  "views_count": number | null,
  "engagement_rate": number | null,
  "growth_30d": number | null,
  "sample_comments": string[],
  "purchase_intent_comments": string[],
  "curiosity_comments": string[],
  "generic_comments": string[],
  "visible_post_signals": string[],
  "extraction_notes": string[],
  "confidence": { [field: string]: "high" | "medium" | "low" },
  "missing_fields": string[],
  "notes": string
}

RULES
- Only use information visibly present in screenshots.
- Use null for unavailable scalars; [] for unavailable arrays.
- Normalize numbers: "12.5K" → 12500, "1.2M" → 1200000.
- engagement_rate and growth_30d are PERCENTAGES (e.g. 4.6, not 0.046).
- niche: EXACTLY one of "Beauty" | "Fashion" | "Fitness" | "Lifestyle" | "Luxury" | "Tech" | "Food" | "Gaming" | "Other", or null.
- Classify comments into purchase_intent_comments, curiosity_comments, generic_comments when visible.
- Return JSON only. No prose.`;

function labelContext(labels: ScreenshotLabel[]): string {
  if (!labels.length) return "";
  return (
    "\nIMAGE LABELS (hints only):\n" +
    labels.map((l, i) => `${i + 1}: ${l}`).join("\n") +
    "\n"
  );
}

function overrideContext(override: Platform | null): string {
  if (!override) return "";
  return `\nUSER PLATFORM OVERRIDE: Treat screenshots as "${override}" when mapping metrics.\n`;
}

function ok(data: ExtractionResponse): NextResponse {
  return NextResponse.json(data);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  let imageLabels: ScreenshotLabel[] = [];
  const labelsRaw = formData.get("image_labels");
  if (typeof labelsRaw === "string" && labelsRaw.trim()) {
    try {
      const parsed = JSON.parse(labelsRaw) as unknown;
      if (Array.isArray(parsed)) {
        imageLabels = parsed.filter((x): x is ScreenshotLabel =>
          ["profile", "post", "comments", "analytics", "other"].includes(String(x))
        );
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
    if (!file.type.startsWith("image/")) {
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

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const extraction = normalizeExtractedSignals(MOCK_EXTRACTION, platformOverride);
    return ok({
      extraction,
      mode: "mock",
      images_received: files.length,
      warning: "OPENAI_API_KEY not set — returning realistic mock extraction.",
    });
  }

  const dataUrls: string[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    dataUrls.push(`data:${file.type};base64,${buffer.toString("base64")}`);
  }

  try {
    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

    const instruction =
      USER_INSTRUCTION + labelContext(imageLabels) + overrideContext(platformOverride);
    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: instruction },
      ...dataUrls.map((url, i) => {
        const lab = imageLabels[i];
        const detail =
          lab === "profile" || lab === "post" || lab === "analytics" ? "high" : "low";
        return {
          type: "image_url" as const,
          image_url: { url, detail },
        } as OpenAI.Chat.Completions.ChatCompletionContentPart;
      }),
    ];

    const resp = await client.chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: 1400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
      ],
    });

    const text = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(text) as Partial<ExtractedSignals>;
    const extraction = normalizeExtractedSignals(parsed, platformOverride);

    return ok({ extraction, mode: "openai", images_received: files.length });
  } catch (err) {
    const extraction = normalizeExtractedSignals(MOCK_EXTRACTION, platformOverride);
    return ok({
      extraction,
      mode: "mock_fallback",
      images_received: files.length,
      warning: `Vision call failed (${err instanceof Error ? err.message : "unknown error"}) — using mock extraction so the demo continues.`,
    });
  }
}
