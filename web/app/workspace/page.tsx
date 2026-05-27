"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Badge, toneFor } from "@/components/score-badge";
import { AuthNav } from "@/components/auth-nav";
import {
  listEvaluations,
  pipelineStatusLabel,
  userWorkflowFromRow,
  type SavedEvaluation,
} from "@/lib/dataset";
import {
  getCurrentUserEmail,
  listCloudEvaluations,
} from "@/lib/cloud-evaluations";
import { CLOUD_MEMORY_ENABLED, isSupabaseConfigured } from "@/lib/supabase/env";
import { tryCreateClient } from "@/lib/supabase/client";

function outcomeLabel(row: SavedEvaluation): string {
  const perf = row.outcome.performance;
  if (!perf || perf === "Unknown") return "Unknown";
  return perf;
}

export default function WorkspacePage() {
  const router = useRouter();
  const [rows, setRows] = useState<SavedEvaluation[] | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [source, setSource] = useState<"cloud" | "local" | "mixed">("local");

  useEffect(() => {
    if (!CLOUD_MEMORY_ENABLED) {
      router.replace("/saved");
      return;
    }
    let cancelled = false;

    async function load() {
      if (!isSupabaseConfigured()) {
        setRows(listEvaluations());
        setSource("local");
        return;
      }

      const supabase = tryCreateClient();
      if (!supabase) {
        setRows(listEvaluations());
        setSource("local");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login?next=/workspace");
        return;
      }

      const userEmail = await getCurrentUserEmail();
      if (!cancelled) setEmail(userEmail);

      const [cloud, local] = await Promise.all([listCloudEvaluations(), Promise.resolve(listEvaluations())]);
      const byId = new Map<string, SavedEvaluation>();
      for (const r of local) byId.set(r.id, r);
      for (const r of cloud) byId.set(r.id, r);
      const merged = [...byId.values()].sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : -1
      );

      if (!cancelled) {
        setRows(merged);
        if (cloud.length > 0 && local.length > 0) setSource("mixed");
        else if (cloud.length > 0) setSource("cloud");
        else setSource("local");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const count = rows?.length ?? 0;

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
              Creator intelligence workspace
            </p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-neutral-900">
              Your creators
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600">
              Persistent memory across evaluations — reopen reports, workflow, and outcomes.
              {email ? ` Signed in as ${email}.` : ""}
            </p>
            {source === "mixed" && (
              <p className="mt-2 text-xs text-neutral-500">
                Showing cloud + this device&apos;s local saves. Workflow updates sync when signed in.
              </p>
            )}
            {source === "local" && count > 0 && (
              <p className="mt-2 text-xs text-neutral-500">
                Showing this device only — sign in to sync across devices.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AuthNav />
            <Link href="/analyze" className="btn-primary !py-2 !text-sm">
              New evaluation
            </Link>
          </div>
        </div>

        {rows === null && <p className="mt-8 text-sm text-neutral-500">Loading…</p>}

        {rows && rows.length === 0 && (
          <div className="card mt-8 text-center">
            <h2 className="text-lg font-bold text-neutral-900">No creators yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
              Run an evaluation — it saves locally and syncs to your workspace when signed in.
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
                    <th className="px-4 py-3">Decision</th>
                    <th className="px-4 py-3">Saved</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Evaluated</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rows.map((row) => {
                    const r = row.report;
                    const wf = userWorkflowFromRow(row);
                    const savedLabel = wf.shortlisted
                      ? wf.contacted
                        ? wf.campaign_launched
                          ? "Launched"
                          : "Contacted"
                        : "Shortlisted"
                      : wf.saved
                        ? "Saved"
                        : pipelineStatusLabel(row.outcome.status);
                    return (
                      <tr key={row.id} className="hover:bg-neutral-50">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-neutral-900">{r.input.name}</div>
                          <div className="text-xs text-neutral-500">
                            {r.input.platform} · {r.input.niche}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge label={r.decision} tone={toneFor(r.decision)} />
                        </td>
                        <td className="px-4 py-4 text-xs font-medium text-neutral-700">
                          {savedLabel}
                        </td>
                        <td className="px-4 py-4 text-xs text-neutral-600">
                          {outcomeLabel(row)}
                        </td>
                        <td className="px-4 py-4 font-bold tabular-nums">{r.overallScore}</td>
                        <td className="px-4 py-4 text-xs text-neutral-500">
                          {new Date(row.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Link
                            href={`/workspace/${row.id}`}
                            className="text-xs font-semibold text-emerald-700"
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

        {rows && rows.length > 0 && (
          <p className="mt-6 text-xs text-neutral-500">
            <Link href="/saved" className="font-semibold hover:text-neutral-800">
              Device-only saved list →
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
