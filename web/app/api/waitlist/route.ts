import { NextResponse } from "next/server";
import type { BudgetRange } from "@/lib/waitlist";

export interface WaitlistPayload {
  email: string;
  companyName: string;
  role: string;
  budgetRange: BudgetRange;
  creatorTypes: string;
  note?: string;
  createdAt?: string;
  id?: string;
}

function isValidPayload(body: unknown): body is WaitlistPayload {
  if (!body || typeof body !== "object") return false;
  const b = body as WaitlistPayload;
  return (
    typeof b.email === "string" &&
    b.email.includes("@") &&
    typeof b.companyName === "string" &&
    b.companyName.trim().length > 0 &&
    typeof b.role === "string" &&
    typeof b.budgetRange === "string" &&
    typeof b.creatorTypes === "string"
  );
}

async function forwardToWebhook(url: string, payload: WaitlistPayload): Promise<boolean> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "worthyiq-waitlist",
      ...payload,
      submittedAt: payload.createdAt ?? new Date().toISOString(),
    }),
  });
  return res.ok;
}

async function forwardToSupabase(payload: WaitlistPayload): Promise<boolean> {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_WAITLIST_TABLE ?? "waitlist";
  if (!base || !key) return false;

  const res = await fetch(`${base}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      email: payload.email,
      company_name: payload.companyName,
      role: payload.role,
      budget_range: payload.budgetRange,
      creator_types: payload.creatorTypes,
      note: payload.note ?? null,
      created_at: payload.createdAt ?? new Date().toISOString(),
      external_id: payload.id ?? null,
    }),
  });
  return res.ok;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!isValidPayload(body)) {
      return NextResponse.json({ error: "Invalid waitlist payload." }, { status: 400 });
    }

    const webhook = process.env.WAITLIST_WEBHOOK_URL;
    let synced = false;
    let channel: string | null = null;

    if (webhook) {
      synced = await forwardToWebhook(webhook, body);
      channel = "webhook";
    } else if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      synced = await forwardToSupabase(body);
      channel = "supabase";
    }

    return NextResponse.json({
      ok: true,
      synced,
      channel,
      message: synced
        ? "Waitlist entry received."
        : "Saved locally. Set WAITLIST_WEBHOOK_URL or Supabase env vars to sync remotely.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Waitlist sync failed." },
      { status: 500 }
    );
  }
}
