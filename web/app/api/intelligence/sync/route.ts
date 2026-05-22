import { NextResponse } from "next/server";
import type { IntelligenceRecord } from "@/lib/intelligence-schema";
import type { WorkflowEvent } from "@/lib/workflow-events";

const LOG_PREFIX = "[intelligence/sync]";
/** Make should ACK webhooks in <1s; we only wait this long in background. */
const WEBHOOK_TIMEOUT_MS = 8_000;

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
    ...payload,
  };
  if (payload.kind === "record") {
    const ev = payload.record.creator_evaluation;
    const wf = payload.record.user_workflow;
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
      body: JSON.stringify({
        source: "worthyiq-intelligence",
        submittedAt: new Date().toISOString(),
        ...payload,
      }),
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
          ? `Webhook timed out after ${WEBHOOK_TIMEOUT_MS}ms`
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

    console.log(`${LOG_PREFIX} payload kind:`, body.kind);
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
      const response = {
        ok: true as const,
        synced: false,
        webhookConfigured: false,
        channel: null,
        message: "INTELLIGENCE_WEBHOOK_URL is not set in web/.env.local",
      };
      console.log(`${LOG_PREFIX} response:`, JSON.stringify(response));
      return NextResponse.json(response);
    }

    if (body.kind === "record" && body.source === "evaluation") {
      const name = body.record.creator_evaluation.creator_name;
      if (name === "MAKE_CONNECTION_PING" || name === "Webhook Test Creator") {
        console.error(`${LOG_PREFIX} refused test creator on evaluation sync:`, name);
        return NextResponse.json(
          {
            error: `Invalid evaluation sync (${name}). Run a real creator evaluation.`,
          },
          { status: 400 }
        );
      }
    }

    if (body.kind === "record" && body.devTest) {
      const response = {
        ok: true as const,
        synced: false,
        webhookConfigured: true,
        devTest: true,
        channel: null,
        message: "Dev test payload not sent to Make (use a real evaluation to sync).",
      };
      console.log(`${LOG_PREFIX} response:`, JSON.stringify(response));
      return NextResponse.json(response);
    }

    console.log(`${LOG_PREFIX} forwarding to Make now`);
    const result = await forwardToWebhook(webhook, body);
    console.log(`${LOG_PREFIX} forward result:`, JSON.stringify(result));

    const response = {
      ok: true as const,
      synced: result.synced,
      webhookConfigured: true,
      channel: "webhook" as const,
      ...(result.status !== undefined ? { webhookStatus: result.status } : {}),
      ...(result.error ? { webhookError: result.error } : {}),
      message: result.synced
        ? "Make webhook accepted the request."
        : "Forward to Make failed — see webhookError and server logs.",
    };

    console.log(`${LOG_PREFIX} response:`, JSON.stringify(response));
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Intelligence sync failed.";
    console.error(`${LOG_PREFIX} route error:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
