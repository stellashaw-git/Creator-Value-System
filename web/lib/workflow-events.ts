/**
 * Append-only workflow event log — lightweight proprietary signal capture.
 * localStorage today; same events can POST to a webhook later.
 */

export type WorkflowEventType =
  | "evaluation_completed"
  | "creator_saved"
  | "creator_shortlisted"
  | "creator_contacted"
  | "creator_launched"
  | "creator_compared"
  | "creator_reopened"
  | "outcome_recorded";

export interface WorkflowEvent {
  id: string;
  type: WorkflowEventType;
  evaluation_id?: string;
  creator_name?: string;
  timestamp: string;
  meta?: Record<string, string | number | boolean>;
}

const STORAGE_KEY = "worthyiq.workflow-events.v1";
const MAX_EVENTS = 500;

const isBrowser = (): boolean => typeof window !== "undefined";

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readAll(): WorkflowEvent[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as WorkflowEvent[]) : [];
  } catch {
    return [];
  }
}

function writeAll(events: WorkflowEvent[]): void {
  if (!isBrowser()) return;
  try {
    const trimmed = events.slice(-MAX_EVENTS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // quota
  }
}

export function logWorkflowEvent(
  type: WorkflowEventType,
  opts?: {
    evaluationId?: string;
    creatorName?: string;
    meta?: Record<string, string | number | boolean>;
  }
): void {
  const event: WorkflowEvent = {
    id: newId(),
    type,
    evaluation_id: opts?.evaluationId,
    creator_name: opts?.creatorName,
    timestamp: new Date().toISOString(),
    meta: opts?.meta,
  };
  writeAll([...readAll(), event]);
}

export function listWorkflowEvents(limit = 100): WorkflowEvent[] {
  return readAll()
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, limit);
}

export function exportWorkflowEventsJSON(): string {
  return JSON.stringify(listWorkflowEvents(MAX_EVENTS), null, 2);
}
