"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logWorkflowEvent } from "@/lib/workflow-events";
import { SiteHeader } from "@/components/site-header";
import { Badge, toneFor } from "@/components/score-badge";
import {
  campaignFitFromReport,
  campaignFitTone,
} from "@/lib/campaign-fit";
import { listEvaluations, pipelineStatusLabel, type SavedEvaluation } from "@/lib/dataset";

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

export default function ComparePage() {
  const [rows, setRows] = useState<SavedEvaluation[] | null>(null);

  const loggedCompare = useRef(false);

  useEffect(() => {
    setRows(listEvaluations());
    if (!loggedCompare.current) {
      loggedCompare.current = true;
      logWorkflowEvent("creator_compared", {
        meta: { count: listEvaluations().length },
      });
    }
  }, []);

  return (
    <main className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900">
          Compare creators
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600">
          Side-by-side read on saved evaluations from this device.
        </p>

        {rows === null ? (
          <p className="mt-8 text-sm text-neutral-500">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="card mt-8 text-center">
            <p className="text-sm text-neutral-600">
              No saved creators yet. Run a free evaluation first.
            </p>
            <Link href="/analyze" className="btn-primary mt-4 inline-block">
              Evaluate a Creator
            </Link>
          </div>
        ) : rows.length < 2 ? (
          <div className="card mt-8">
            <p className="text-sm text-neutral-600">
              You have 1 saved creator. Evaluate at least one more to compare side by side.
            </p>
            <Link href="/analyze" className="btn-primary mt-4 inline-block">
              Evaluate another creator
            </Link>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                  <th className="px-4 py-3">Creator</th>
                  <th className="px-4 py-3">Platform</th>
                  <th className="px-4 py-3">Niche</th>
                  <th className="px-4 py-3">Followers</th>
                  <th className="px-4 py-3">Commercial score</th>
                  <th className="px-4 py-3">Campaign fit</th>
                  <th className="px-4 py-3">Decision</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Next action</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const r = row.report;
                  const fit = campaignFitFromReport(r);
                  const action = r.nextActions[0]?.title ?? r.action.label;
                  return (
                    <tr key={row.id} className="border-b border-neutral-100 last:border-0">
                      <td className="px-4 py-3 font-semibold text-neutral-900">
                        {r.input.name}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{r.input.platform}</td>
                      <td className="px-4 py-3 text-neutral-700">{r.input.niche}</td>
                      <td className="px-4 py-3 text-neutral-700">
                        {formatFollowers(r.input.followers)}
                      </td>
                      <td className="px-4 py-3 font-bold text-neutral-900">
                        {r.overallScore}
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={fit} tone={campaignFitTone(fit)} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={r.decision} tone={toneFor(r.decision)} />
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-700">
                        {pipelineStatusLabel(row.outcome.status)}
                        {row.outcome.performance && row.outcome.performance !== "Unknown" && (
                          <span className="block text-neutral-500">{row.outcome.performance}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{r.decisionConfidence}</td>
                      <td className="max-w-[200px] px-4 py-3 text-neutral-600">{action}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/saved/${row.id}`}
                          className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {rows && rows.length >= 2 && (
          <p className="mt-4 text-xs text-neutral-500">
            Saved on this device only.{" "}
            <Link href="/saved" className="font-semibold text-neutral-700 hover:text-neutral-900">
              Manage saved creators
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
