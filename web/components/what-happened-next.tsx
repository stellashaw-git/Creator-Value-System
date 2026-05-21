"use client";

import { useState } from "react";
import {
  type CampaignStatus,
  type FollowedRecommendation,
  type OutcomePerformance,
  updateEvaluationFeedback,
} from "@/lib/dataset";

const STATUS_CHIPS: { label: string; status: CampaignStatus }[] = [
  { label: "Not pursuing", status: "Not started" },
  { label: "Shortlisted", status: "Shortlisted" },
  { label: "Contacted", status: "Contacted" },
  { label: "In discussion", status: "In discussion" },
  { label: "Launched", status: "Campaign launched" },
  { label: "Completed", status: "Completed" },
];

const FOLLOW_CHIPS: FollowedRecommendation[] = ["Yes", "Modified", "Ignored"];

const PERFORMANCE_CHIPS: OutcomePerformance[] = ["Strong", "OK", "Weak", "Unknown"];

export function WhatHappenedNext({
  evaluationId,
  initialStatus,
  initialFollowed,
  initialPerformance,
  compact = false,
}: {
  evaluationId: string;
  initialStatus: CampaignStatus;
  initialFollowed?: FollowedRecommendation;
  initialPerformance?: OutcomePerformance;
  compact?: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [followed, setFollowed] = useState(initialFollowed);
  const [performance, setPerformance] = useState<OutcomePerformance | undefined>(
    initialPerformance
  );
  const [saved, setSaved] = useState(false);

  const showPerformance =
    status === "Campaign launched" || status === "Completed";

  const persist = (patch: Parameters<typeof updateEvaluationFeedback>[1]) => {
    const updated = updateEvaluationFeedback(evaluationId, patch);
    if (updated) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const chipClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold transition ${
      active
        ? "bg-neutral-900 text-white"
        : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
    }`;

  return (
    <section className={compact ? "" : "insight-panel"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-900">What happened next?</p>
        {saved && <span className="text-xs text-emerald-700">Saved</span>}
      </div>
      {!compact && (
        <p className="mt-1 text-xs text-neutral-500">
          Optional — helps WorthyIQ learn which creators work for brands like yours.
        </p>
      )}

      <p className="mt-4 text-[11px] font-medium text-neutral-500">Pipeline</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {STATUS_CHIPS.map((c) => (
          <button
            key={c.status}
            type="button"
            className={chipClass(status === c.status)}
            onClick={() => {
              setStatus(c.status);
              persist({ outcome: { status: c.status } });
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="mt-5 text-[11px] font-medium text-neutral-500">
        Did you follow this recommendation?
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {FOLLOW_CHIPS.map((f) => (
          <button
            key={f}
            type="button"
            className={chipClass(followed === f)}
            onClick={() => {
              setFollowed(f);
              persist({ followedRecommendation: f });
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {showPerformance && (
        <>
          <p className="mt-5 text-[11px] font-medium text-neutral-500">
            How did the campaign perform?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PERFORMANCE_CHIPS.map((p) => (
              <button
                key={p}
                type="button"
                className={chipClass(performance === p)}
                onClick={() => {
                  setPerformance(p);
                  persist({ outcome: { performance: p } });
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
