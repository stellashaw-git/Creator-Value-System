"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  computeStats,
  exportAllAsJSON,
  listEvaluations,
  type DatasetStats,
  type SavedEvaluation,
} from "@/lib/dataset";
import { Badge, toneFor } from "@/components/score-badge";

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "neutral"> = {
  "Not started": "neutral",
  Contacted: "amber",
  "In discussion": "amber",
  "Campaign launched": "green",
  Completed: "green",
};

export default function DatasetPage() {
  const [rows, setRows] = useState<SavedEvaluation[] | null>(null);

  useEffect(() => {
    setRows(listEvaluations());
  }, []);

  const stats: DatasetStats | null = useMemo(
    () => (rows ? computeStats(rows) : null),
    [rows]
  );

  const handleExport = () => {
    const data = exportAllAsJSON();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `worthyiq-dataset-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-4">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-base font-extrabold tracking-tight">WorthyIQ</span>
              <span className="hidden text-xs uppercase tracking-[0.16em] text-neutral-500 sm:inline">
                Creator Intelligence Platform
              </span>
            </Link>
            <nav className="hidden items-center gap-3 text-xs font-semibold text-neutral-500 sm:flex">
              <Link href="/dataset" className="text-neutral-900">
                Dataset
              </Link>
            </nav>
          </div>
          <Link href="/analyze" className="btn-primary !py-1.5 !px-4">
            Evaluate a Creator
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Intro */}
        <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">
              Decision learning layer
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl">
              Creator Intelligence Dataset
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-700">
              Every evaluation helps build a structured dataset connecting creator signals
              to campaign outcomes. The longer you use WorthyIQ, the sharper the next decision gets.
            </p>
          </div>
          {rows && rows.length > 0 && (
            <button
              type="button"
              onClick={handleExport}
              className="btn-secondary self-start whitespace-nowrap !py-2 !px-4 text-xs"
            >
              Export JSON
            </button>
          )}
        </div>

        {/* Stats */}
        {stats && stats.total > 0 && <DatasetStatsGrid stats={stats} />}

        {/* Loading */}
        {rows === null && (
          <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
            Loading dataset…
          </div>
        )}

        {/* Empty state */}
        {rows && rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-2xl">
              📂
            </div>
            <h2 className="mt-4 text-lg font-bold text-neutral-900">
              Your dataset is empty.
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-neutral-600">
              Run your first creator evaluation. Every brief gets stored as structured creator
              intelligence data — ready to be linked to real campaign outcomes later.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/analyze" className="btn-primary">
                Evaluate a Creator →
              </Link>
              <Link href="/analyze?demo=1" className="btn-secondary">
                Try a sample creator
              </Link>
            </div>
          </div>
        )}

        {/* Table */}
        {rows && rows.length > 0 && (
          <section className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">
                  Evaluation history
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {rows.length} structured evaluation{rows.length === 1 ? "" : "s"} stored locally.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
                  <tr>
                    <th className="px-6 py-3">Creator</th>
                    <th className="px-4 py-3">Decision</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rows.map((row) => {
                    const r = row.report;
                    return (
                      <tr key={row.id} className="hover:bg-neutral-50">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-neutral-900">
                            {r.input.name}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {r.input.platform} · {r.input.niche}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge label={r.decision} tone={toneFor(r.decision)} />
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm font-semibold text-neutral-800">
                            {r.decisionConfidence}
                          </span>
                        </td>
                        <td className="px-4 py-4 tabular-nums">
                          <span className="font-bold text-neutral-900">
                            {r.overallScore}
                          </span>
                          <span className="text-xs text-neutral-500"> / 100</span>
                        </td>
                        <td className="px-4 py-4">
                          <Badge
                            label={row.outcome.status}
                            tone={STATUS_TONE[row.outcome.status] || "neutral"}
                          />
                        </td>
                        <td className="px-4 py-4 text-xs text-neutral-500">
                          {new Date(row.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Link
                            href={`/dataset/${row.id}`}
                            className="text-xs font-semibold text-neutral-700 hover:text-neutral-900"
                          >
                            Open →
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

function DatasetStatsGrid({ stats }: { stats: DatasetStats }) {
  const cards: { label: string; value: string; sub?: string }[] = [
    { label: "Total evaluated", value: String(stats.total) },
    { label: "Strong Candidates", value: String(stats.strong), sub: "Approved profiles" },
    { label: "Watchlist", value: String(stats.watchlist), sub: "Track before spend" },
    { label: "Not Recommended", value: String(stats.notRecommended), sub: "Skipped" },
    {
      label: "Campaigns launched",
      value: String(stats.campaignsLaunched),
      sub: `${stats.campaignsCompleted} completed`,
    },
    {
      label: "Avg estimated ROI",
      value: stats.avgEstimatedROI === null ? "—" : `${stats.avgEstimatedROI.toFixed(1)}×`,
      sub:
        stats.avgActualROI === null
          ? "Add outcome data to compare"
          : `Actual avg ${stats.avgActualROI.toFixed(1)}×`,
    },
  ];
  return (
    <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
            {c.label}
          </div>
          <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-neutral-900">
            {c.value}
          </div>
          {c.sub && <div className="mt-1 text-[11px] text-neutral-500">{c.sub}</div>}
        </div>
      ))}
    </section>
  );
}
