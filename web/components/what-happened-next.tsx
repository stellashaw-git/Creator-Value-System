"use client";

import { useState } from "react";
import {
  outcomeStatusToPerformance,
  performanceToOutcomeStatus,
  updateEvaluationFeedback,
  userWorkflowFromRow,
  type OutcomePerformance,
} from "@/lib/dataset";
import {
  DEFAULT_USER_WORKFLOW,
  type OutcomeStatus,
  type UserWorkflow,
} from "@/lib/intelligence-types";

const WORKFLOW_CHIPS: { label: string; key: keyof UserWorkflow }[] = [
  { label: "Saved", key: "saved" },
  { label: "Shortlisted", key: "shortlisted" },
  { label: "Contacted", key: "contacted" },
  { label: "Campaign launched", key: "campaign_launched" },
];

const OUTCOME_CHIPS: { label: string; status: OutcomeStatus }[] = [
  { label: "Strong", status: "strong" },
  { label: "OK", status: "ok" },
  { label: "Weak", status: "weak" },
  { label: "Unknown", status: "unknown" },
];

export function WhatHappenedNext({
  evaluationId,
  initialWorkflow,
  initialPerformance,
  compact = false,
}: {
  evaluationId: string;
  initialWorkflow?: UserWorkflow;
  initialPerformance?: OutcomePerformance;
  compact?: boolean;
}) {
  const [workflow, setWorkflow] = useState<UserWorkflow>(
    initialWorkflow ?? DEFAULT_USER_WORKFLOW
  );
  const [outcome, setOutcome] = useState<OutcomeStatus>(() =>
    performanceToOutcomeStatus(initialPerformance)
  );
  const [flash, setFlash] = useState(false);

  const persist = (patch: Parameters<typeof updateEvaluationFeedback>[1]) => {
    const updated = updateEvaluationFeedback(evaluationId, patch);
    if (updated) {
      setWorkflow(userWorkflowFromRow(updated));
      setOutcome(performanceToOutcomeStatus(updated.outcome.performance));
      setFlash(true);
      setTimeout(() => setFlash(false), 2000);
    }
  };

  const chipClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold transition ${
      active
        ? "bg-neutral-900 text-white"
        : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
    }`;

  const toggleWorkflow = (key: keyof UserWorkflow) => {
    const next = { ...workflow, [key]: !workflow[key], saved: true };
    if (key === "campaign_launched" && next.campaign_launched) {
      next.contacted = true;
      next.shortlisted = true;
    } else if (key === "contacted" && next.contacted) {
      next.shortlisted = true;
    }
    setWorkflow(next);
    persist({ userWorkflow: next });
  };

  return (
    <section className={compact ? "" : "insight-panel"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-900">What happened next?</p>
        {flash && <span className="text-xs text-emerald-700">Saved</span>}
      </div>
      {!compact && (
        <p className="mt-1 text-xs text-neutral-500">
          Optional — a quick update helps WorthyIQ remember what works.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {WORKFLOW_CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={chipClass(workflow[c.key])}
            onClick={() => toggleWorkflow(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="mt-5 text-[11px] font-medium text-neutral-500">Campaign outcome</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {OUTCOME_CHIPS.map((c) => (
          <button
            key={c.status}
            type="button"
            className={chipClass(outcome === c.status)}
            onClick={() => {
              setOutcome(c.status);
              persist({ outcome: { performance: outcomeStatusToPerformance(c.status) } });
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
    </section>
  );
}
