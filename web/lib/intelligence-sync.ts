/**
 * Sync to /api/intelligence/sync → INTELLIGENCE_WEBHOOK_URL.
 * localStorage remains source of truth on the client.
 */

import {
  toIntelligenceRecord,
  type IntelligenceRecord,
} from "./intelligence-schema";
import type { SavedEvaluation } from "./dataset";
import type { Report } from "./types";
import type { WorkflowEvent } from "./workflow-events";

export type IntelligenceSyncReason = "created" | "updated";

export type SyncApiResult = {
  ok?: boolean;
  synced?: boolean;
  webhookStatus?: number;
  webhookError?: string;
  message?: string;
  error?: string;
};

const TEST_CREATOR_NAMES = new Set([
  "MAKE_CONNECTION_PING",
  "Webhook Test Creator",
]);

const isBrowser = (): boolean => typeof window !== "undefined";

function logRecordBeforeSync(
  reason: IntelligenceSyncReason,
  row: SavedEvaluation
): IntelligenceRecord {
  const record = toIntelligenceRecord(row);
  const { creator_name, recommendation, commercial_score } =
    record.creator_evaluation;
  console.log("[intelligence/sync:client] before POST", {
    reason,
    source: "evaluation",
    evaluation_id: record.creator_evaluation.evaluation_id,
    creator_name,
    recommendation,
    commercial_score,
  });
  if (TEST_CREATOR_NAMES.has(creator_name)) {
    console.error(
      "[intelligence/sync:client] BLOCKED — test creator name on evaluation sync:",
      creator_name
    );
  }
  return record;
}

/** Awaitable sync — use after a real evaluation completes. */
export async function syncIntelligenceRecord(
  row: SavedEvaluation,
  report: Report,
  reason: IntelligenceSyncReason = "created"
): Promise<SyncApiResult> {
  if (!isBrowser()) return { ok: false, error: "Not in browser" };

  const rowWithReport = { ...row, report };
  const record = logRecordBeforeSync(reason, rowWithReport);
  const creatorName = record.creator_evaluation.creator_name?.trim();

  if (!creatorName) {
    console.error("[intelligence/sync:client] missing creator_name — sync skipped");
    return { ok: false, error: "Missing creator name" };
  }

  if (TEST_CREATOR_NAMES.has(creatorName)) {
    return { ok: false, error: `Refusing to sync test payload (${creatorName})` };
  }

  try {
    const res = await fetch("/api/intelligence/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "record",
        reason,
        source: "evaluation",
        record,
      }),
    });
    const json = (await res.json()) as SyncApiResult;
    console.log("[intelligence/sync:client] completed", res.status, json);
    return json;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync request failed";
    console.error("[intelligence/sync:client] failed", message);
    return { ok: false, error: message };
  }
}

/** Fire-and-forget — feedback updates only. */
export function queueIntelligenceSync(
  row: SavedEvaluation,
  reason: IntelligenceSyncReason
): void {
  void syncIntelligenceRecord(row, row.report, reason);
}

export function queueWorkflowEventSync(event: WorkflowEvent): void {
  if (!isBrowser()) return;
  void fetch("/api/intelligence/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "workflow_event", event }),
  }).catch(() => {});
}
