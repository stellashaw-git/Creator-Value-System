import { NextResponse } from "next/server";

interface EarlyAccessPayload {
  email: string;
  companyName?: string;
  role?: string;
  challenge?: string;
  submittedAt?: string;
}

function isValidPayload(body: unknown): body is EarlyAccessPayload {
  if (!body || typeof body !== "object") return false;
  const b = body as EarlyAccessPayload;
  return typeof b.email === "string" && b.email.includes("@");
}

async function forwardToWebhook(url: string, payload: EarlyAccessPayload): Promise<boolean> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "worthyiq-early-access",
      ...payload,
      submittedAt: payload.submittedAt ?? new Date().toISOString(),
    }),
  });
  return res.ok;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!isValidPayload(body)) {
      return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
    }

    const webhook = process.env.WAITLIST_WEBHOOK_URL;
    let synced = false;

    if (webhook) {
      synced = await forwardToWebhook(webhook, body);
    }

    return NextResponse.json({
      ok: true,
      synced,
      message: synced
        ? "Early access submission received."
        : "Saved locally. Set WAITLIST_WEBHOOK_URL to sync remotely.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Early access sync failed." },
      { status: 500 }
    );
  }
}
