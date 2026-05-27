import { NextResponse } from "next/server";
import { defaultIntakeNudge, parseCreatorProfileUrl } from "@/lib/intake/url-parser";
import type { IntakePreviewResponse } from "@/lib/intake/types";

export async function POST(req: Request): Promise<NextResponse<IntakePreviewResponse>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Unsupported or invalid creator profile link" },
      { status: 400 }
    );
  }

  const url =
    typeof body === "object" &&
    body !== null &&
    "url" in body &&
    typeof (body as { url: unknown }).url === "string"
      ? (body as { url: string }).url
      : "";

  if (!url.trim()) {
    return NextResponse.json(
      { error: "Unsupported or invalid creator profile link" },
      { status: 400 }
    );
  }

  const parsed = parseCreatorProfileUrl(url);
  if (!parsed) {
    return NextResponse.json(
      { error: "Unsupported or invalid creator profile link" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    platform: parsed.platform,
    handle: parsed.handle,
    profile: null,
    confidence: "low",
    nudge: defaultIntakeNudge(),
  });
}
