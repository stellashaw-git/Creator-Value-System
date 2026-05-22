import { after, NextResponse } from "next/server";
import type { IntelligenceRecord } from "@/lib/intelligence-schema";
import type { WorkflowEvent } from "@/lib/workflow-events";

export const runtime = "nodejs";
/** Make must ACK quickly; Sheets runs after. Do not wait for full scenario. */
const WEBHOOK_TIMEOUT_MS = 4_000;

const LOG_PREFIX = "[intelligence/sync]";

type RecordPayload = {
  kind: "record";
  reason: "created" | "updated";
  record: IntelligenceRecord;
  source?: string;
  devTest?: boolean;
};

type EventPayload = {
  kind: "workflow_event";
  event: WorkflowEvent;
};

type SyncBody = RecordPayload | EventPayload;

function webhookHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid-url)";
  }
}

function isIntelligenceRecord(v: unknown): v is IntelligenceRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as IntelligenceRecord;
  return (
    r.schema_version === 1 &&
    typeof r.updated_at === "string" &&
    !!r.creator_evaluation &&
    typeof r.creator_evaluation.evaluation_id === "string"
  );
}

function isWorkflowEvent(v: unknown): v is WorkflowEvent {
  if (!v || typeof v !== "object") return false;
  const e = v as WorkflowEvent;
  return typeof e.id === "string" && typeof e.type === "string" && typeof e.timestamp === "string";
}

function parseBody(raw: unknown): SyncBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (b.kind === "record") {
    const reason = b.reason === "created" || b.reason === "updated" ? b.reason : null;
    if (!reason || !isIntelligenceRecord(b.record)) return null;
    return {
      kind: "record",
      reason,
      record: b.record,
      source: typeof b.source === "string" ? b.source : undefined,
      devTest: b.devTest === true,
    };
  }
  if (b.kind === "workflow_event" && isWorkflowEvent(b.event)) {
    return { kind: "workflow_event", event: b.event };
  }
  return null;
}

/** Flatten key fields so Make/Sheets mapping is obvious. */
function buildWebhookBody(payload: SyncBody): Record<string, unknown> {
  const base: Record<string, unknown> = {
    source: "worthyiq-intelligence",
    submittedAt: new Date().toISOString(),
    kind: payload.kind,
  };
  if (payload.kind === "record") {
    const ev = payload.record.creator_evaluation;
    const wf = payload.record.user_workflow;
    base.reason = payload.reason;
    base.record = payload.record;
    base.timestamp = payload.record.updated_at;
    base.creator_name = ev.creator_name;
    base.recommendation = ev.recommendation;
    base.commercial_score = ev.commercial_score;
    base.platform = ev.platform;
    base.niche = ev.niche;
    base.campaign_fit = ev.campaign_fit;
    base.evaluation_id = ev.evaluation_id;
    base.outcome = payload.record.outcome_status;
    base.saved = wf.saved;
    base.shortlisted = wf.shortlisted;
    base.contacted = wf.contacted;
    base.campaign_launched = wf.campaign_launched;
    base.sync_source = payload.source ?? "evaluation";
  } else {
    base.event = payload.event;
  }
  return base;
}

async function forwardToWebhook(
  url: string,
  payload: SyncBody
): Promise<{ synced: boolean; status?: number; error?: string }> {
  const secret = process.env.INTELLIGENCE_WEBHOOK_SECRET?.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(buildWebhookBody(payload)),
      signal: controller.signal,
    });

    console.log(`${LOG_PREFIX} webhook response status:`, res.status);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const detail = text.slice(0, 200) || res.statusText;
      console.error(
        `${LOG_PREFIX} webhook forward failed: HTTP ${res.status} ${detail}`
      );
      return { synced: false, status: res.status, error: detail };
    }

    return { synced: true, status: res.status };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `Make ACK timed out after ${WEBHOOK_TIMEOUT_MS}ms (data may still arrive — set webhook to respond Immediately)`
          : err.message
        : "Unknown webhook error";
    console.error(`${LOG_PREFIX} webhook forward failed:`, message);
    return { synced: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  try {
    const body = parseBody(await req.json());
    if (!body) {
      return NextResponse.json({ error: "Invalid sync payload." }, { status: 400 });
    }

    const rawWebhook = process.env.INTELLIGENCE_WEBHOOK_URL?.trim();
    const webhook = rawWebhook?.replace(/^["']|["']$/g, "");
    const webhookConfigured = Boolean(webhook);

    console.log(`${LOG_PREFIX} INTELLIGENCE_WEBHOOK_URL exists:`, webhookConfigured);
    if (webhookConfigured && webhook) {
      console.log(`${LOG_PREFIX} webhook host:`, webhookHost(webhook));
    } else {
      console.log(`${LOG_PREFIX} Webhook URL missing`);
    }

    if (body.kind === "record") {
      const ev = body.record.creator_evaluation;
      console.log(`${LOG_PREFIX} sync record:`, {
        source: body.source ?? "unknown",
        devTest: body.devTest ?? false,
        reason: body.reason,
        creator_name: ev.creator_name,
        recommendation: ev.recommendation,
        commercial_score: ev.commercial_score,
      });
    }

    if (!webhook) {
      return NextResponse.json({
        ok: true,
        synced: false,
        webhookConfigured: false,
        channel: null,
        message: "Set INTELLIGENCE_WEBHOOK_URL in Vercel env vars (or web/.env.local).",
      });
    }

    if (body.kind === "record" && body.source === "evaluation") {
      const name = body.record.creator_evaluation.creator_name;
      if (name === "MAKE_CONNECTION_PING" || name === "Webhook Test Creator") {
        return NextResponse.json(
          { error: `Invalid evaluation sync (${name}).` },
          { status: 400 }
        );
      }
    }

    if (body.kind === "record" && body.devTest) {
      return NextResponse.json({
        ok: true,
        synced: false,
        devTest: true,
        message: "Dev test not sent to Make. Use Ping Make or a real evaluation.",
      });
    }

    // Respond immediately; forward in background (works on Vercel via after()).
    after(async () => {
      console.log(`${LOG_PREFIX} background forward started`);
      const result = await forwardToWebhook(webhook, body);
      console.log(`${LOG_PREFIX} background forward result:`, JSON.stringify(result));
    });

    return NextResponse.json({
      ok: true,
      synced: true,
      webhookQueued: true,
      webhookConfigured: true,
      channel: "webhook",
      message:
        "Dispatched to Make. Keep scenario ON — Run once only listens ~2 min for a manual test.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Intelligence sync failed.";
    console.error(`${LOG_PREFIX} route error:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
