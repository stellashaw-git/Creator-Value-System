/**
 * Memory layer — local adapter now; webhook sync via /api/intelligence/sync.
 */

import {
  exportIntelligenceBundle,
  toIntelligenceRecord,
  type IntelligenceRecord,
} from "./intelligence-schema";
import { queueIntelligenceSync } from "./intelligence-sync";
import {
  getEvaluation,
  listEvaluations,
  type SavedEvaluation,
} from "./dataset";

export type MemoryBackend = "local" | "webhook";

export interface MemoryAdapter {
  backend: MemoryBackend;
  list(): SavedEvaluation[];
  get(id: string): SavedEvaluation | undefined;
  exportJSON(): string;
  exportIntelligence(): string;
  /** POST canonical record to server webhook (fire-and-forget). */
  syncRecord(row: SavedEvaluation, reason?: "created" | "updated"): void;
}

const localAdapter: MemoryAdapter = {
  backend: "local",
  list: listEvaluations,
  get: getEvaluation,
  exportJSON: () => JSON.stringify(listEvaluations(), null, 2),
  exportIntelligence: () => exportIntelligenceBundle(listEvaluations()),
  syncRecord: (row, reason = "updated") => queueIntelligenceSync(row, reason),
};

/** Single entry point — storage stays local; sync is optional via env webhook. */
export function getMemoryAdapter(): MemoryAdapter {
  return localAdapter;
}

/** Manual re-sync (e.g. export UI) — same path as automatic hooks in dataset. */
export function syncIntelligenceRecord(
  record: IntelligenceRecord,
  reason: "created" | "updated" = "updated"
): void {
  if (typeof window === "undefined") return;
  void fetch("/api/intelligence/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "record", reason, record }),
  }).catch(() => {});
}

export { toIntelligenceRecord };
