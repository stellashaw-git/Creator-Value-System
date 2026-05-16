import { NextResponse, type NextRequest } from "next/server";
import OpenAI from "openai";
import {
  EMPTY_EXTRACTION,
  MOCK_EXTRACTION,
  type ExtractedSignals,
  type ExtractionResponse,
} from "@/lib/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES = 5;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per file

const SYSTEM =
  "You extract structured creator signals from screenshots of social media profiles, " +
  "posts, comments, or analytics. You return ONLY a single JSON object that conforms to " +
  "the schema. You never invent numbers. If a field is not visibly present, return null.";

const USER_INSTRUCTION = `Extract structured creator signals from the attached screenshots.

SCHEMA (return JSON with exactly these keys):
{
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
  "engagement_rate": number | null,
  "growth_30d": number | null,
  "sample_comments": string[],
  "purchase_intent_comments": string[],
  "curiosity_comments": string[],
  "generic_comments": string[],
  "visible_post_signals": string[],
  "confidence": { [field: string]: "high" | "medium" | "low" },
  "missing_fields": string[],
  "notes": string
}

RULES
- Only use information that is visibly present in the screenshots.
- Use null for any unavailable scalar field. Use [] for unavailable arrays.
- Normalize numbers: "12.5K" → 12500, "1.2M" → 1200000.
- engagement_rate and growth_30d are PERCENTAGES as numbers (e.g. 4.6, not 0.046).
- platform must be EXACTLY one of: "Instagram" | "TikTok" | "YouTube" | "X / Twitter" | "Xiaohongshu / RED" | "Other".
- niche must be EXACTLY one of: "Beauty" | "Fashion" | "Fitness" | "Lifestyle" | "Luxury" | "Tech" | "Food" | "Gaming" | "Other". Pick the closest match or null.
- Separate visible comments into:
    - purchase_intent_comments: ones that ask "link?", "price?", "code?", "size?", "where to buy", "is this on amazon?"
    - curiosity_comments: questions that aren't buying-flavored ("what brand?", "which one?", "any tips?")
    - generic_comments: emojis, generic praise ("love this", "🔥", "stunning")
- visible_post_signals: 1–4 short factual sentences describing what is literally visible on screen (e.g. "Bio mentions affiliate link to supplements brand").
- confidence: per-field "high" | "medium" | "low".
- missing_fields: list field names you couldn't determine.
- notes: max 1 short sentence. No editorializing.
- Return JSON only. No prose.`;

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
  if (files.length === 0) {
    return NextResponse.json({ error: "No images uploaded." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FILES} screenshots per extraction.` },
      { status: 400 }
    );
  }

  // Validate types and sizes up front.
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

  // Mock path — keep the demo working without a key.
  if (!apiKey) {
    return ok({
      extraction: MOCK_EXTRACTION,
      mode: "mock",
      images_received: files.length,
      warning: "OPENAI_API_KEY not set — returning realistic mock extraction.",
    });
  }

  // Convert files → base64 data URLs for the Vision API.
  const dataUrls: string[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    dataUrls.push(`data:${file.type};base64,${buffer.toString("base64")}`);
  }

  try {
    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: USER_INSTRUCTION },
      ...dataUrls.map(
        (url) =>
          ({
            type: "image_url" as const,
            image_url: { url, detail: "low" as const },
          }) as OpenAI.Chat.Completions.ChatCompletionContentPart
      ),
    ];

    const resp = await client.chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
      ],
    });

    const text = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(text) as Partial<ExtractedSignals>;

    // Normalize: fill missing array fields, coerce confidence object, etc.
    const extraction: ExtractedSignals = {
      ...EMPTY_EXTRACTION,
      ...parsed,
      sample_comments: Array.isArray(parsed.sample_comments) ? parsed.sample_comments : [],
      purchase_intent_comments: Array.isArray(parsed.purchase_intent_comments)
        ? parsed.purchase_intent_comments
        : [],
      curiosity_comments: Array.isArray(parsed.curiosity_comments) ? parsed.curiosity_comments : [],
      generic_comments: Array.isArray(parsed.generic_comments) ? parsed.generic_comments : [],
      visible_post_signals: Array.isArray(parsed.visible_post_signals)
        ? parsed.visible_post_signals
        : [],
      confidence:
        parsed.confidence && typeof parsed.confidence === "object" ? parsed.confidence : {},
      missing_fields: Array.isArray(parsed.missing_fields) ? parsed.missing_fields : [],
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
    };

    return ok({ extraction, mode: "openai", images_received: files.length });
  } catch (err) {
    // On API/parse failure, return mock so the UI flow doesn't break — but flag it loudly.
    return ok({
      extraction: MOCK_EXTRACTION,
      mode: "mock_fallback",
      images_received: files.length,
      warning: `Vision call failed (${err instanceof Error ? err.message : "unknown error"}) — using mock extraction so the demo continues.`,
    });
  }
}
