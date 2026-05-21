"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Badge, toneFor } from "@/components/score-badge";
import { campaignFitFromReport, campaignFitTone } from "@/lib/campaign-fit";
import {
  exportAllAsJSON,
  listEvaluations,
  pipelineStatusLabel,
  type SavedEvaluation,
} from "@/lib/dataset";

export default function SavedCreatorsPage() {
  const [rows, setRows] = useState<SavedEvaluation[] | null>(null);

  useEffect(() => {
    setRows(listEvaluations());
  }, []);

  const count = rows?.length ?? 0;

  const handleExport = () => {
    const blob = new Blob([exportAllAsJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `worthyiq-saved-creators-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900">
              Saved creators
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600">
              Your evaluations on this device — revisit decisions or compare shortlists.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {count >= 2 && (
              <Link href="/compare" className="btn-primary !py-2 !text-sm">
                Compare saved creators
              </Link>
            )}
            {count > 0 && (
              <button type="button" onClick={handleExport} className="btn-secondary !py-2 !text-sm">
                Export JSON
              </button>
            )}
          </div>
        </div>

        {rows === null && (
          <p className="mt-8 text-sm text-neutral-500">Loading…</p>
        )}

        {rows && rows.length === 0 && (
          <div className="card mt-8 text-center">
            <h2 className="text-lg font-bold text-neutral-900">No saved creators yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
              Run an evaluation to add your first creator record.
            </p>
            <Link href="/analyze" className="btn-primary mt-6 inline-block">
              Evaluate a Creator
            </Link>
          </div>
        )}

        {rows && rows.length > 0 && (
          <section className="mt-8 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                  <tr>
                    <th className="px-6 py-3">Creator</th>
                    <th className="px-4 py-3">Campaign fit</th>
                    <th className="px-4 py-3">Decision</th>
                    <th className="px-4 py-3">Pipeline</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Saved</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rows.map((row) => {
                    const r = row.report;
                    const fit = campaignFitFromReport(r);
                    return (
                      <tr key={row.id} className="hover:bg-neutral-50">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-neutral-900">{r.input.name}</div>
                          <div className="text-xs text-neutral-500">
                            {r.input.platform} · {r.input.niche}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge label={fit} tone={campaignFitTone(fit)} />
                        </td>
                        <td className="px-4 py-4">
                          <Badge label={r.decision} tone={toneFor(r.decision)} />
                        </td>
                        <td className="px-4 py-4 text-xs font-medium text-neutral-700">
                          {pipelineStatusLabel(row.outcome.status)}
                          {row.followedRecommendation && (
                            <span className="mt-0.5 block text-neutral-500">
                              Rec: {row.followedRecommendation}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 font-bold tabular-nums">{r.overallScore}</td>
                        <td className="px-4 py-4 text-xs text-neutral-500">
                          {new Date(row.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Link
                            href={`/saved/${row.id}`}
                            className="text-xs font-semibold text-emerald-700"
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
          </section>
        )}
      </div>
    </main>
  );
}
