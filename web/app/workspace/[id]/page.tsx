"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { ReportCard } from "@/components/report-card";
import { WhatHappenedNext } from "@/components/what-happened-next";
import {
  deleteEvaluation,
  getEvaluation,
  updateEvaluationFeedback,
  type SavedEvaluation,
} from "@/lib/dataset";
import { getCloudEvaluation } from "@/lib/cloud-evaluations";
import { logWorkflowEvent } from "@/lib/workflow-events";
import { CLOUD_MEMORY_ENABLED, isSupabaseConfigured } from "@/lib/supabase/env";
import { tryCreateClient } from "@/lib/supabase/client";

export default function WorkspaceCreatorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [row, setRow] = useState<SavedEvaluation | null | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState<string | null>(null);
  const loggedOpen = useRef(false);

  useEffect(() => {
    if (!CLOUD_MEMORY_ENABLED && id) {
      router.replace(`/saved/${id}`);
    }
  }, [id, router]);

  useEffect(() => {
    if (!CLOUD_MEMORY_ENABLED || !id) return;
    let cancelled = false;

    async function load() {
      let found = getEvaluation(id);

      if (isSupabaseConfigured()) {
        const supabase = tryCreateClient();
        const {
          data: { user },
        } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
        if (user) {
          const cloud = await getCloudEvaluation(id);
          if (cloud) found = cloud;
        }
      }

      if (cancelled) return;
      setRow(found ?? null);
      if (found) {
        setNotes(found.outcome.notes ?? "");
        if (!loggedOpen.current) {
          loggedOpen.current = true;
          logWorkflowEvent("creator_reopened", {
            evaluationId: id,
            creatorName: found.report.input.name,
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onSaveNotes = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const updated = updateEvaluationFeedback(id, {
      outcome: { notes: notes.trim() || undefined },
    });
    if (updated) {
      setRow(updated);
      setNotesSaved(new Date().toLocaleTimeString());
    }
  };

  const onDeleteLocal = () => {
    if (!id) return;
    if (!confirm("Remove this creator from this device? Cloud copy remains if synced.")) return;
    deleteEvaluation(id);
    router.push("/workspace");
  };

  if (row === undefined) {
    return (
      <main className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-neutral-500">Loading…</div>
      </main>
    );
  }

  if (row === null) {
    return (
      <main className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="card text-center">
            <h2 className="text-lg font-bold">Creator not found</h2>
            <p className="mt-2 text-sm text-neutral-600">
              This evaluation is not in your workspace or on this device.
            </p>
            <Link href="/workspace" className="btn-primary mt-4 inline-block">
              Back to workspace
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
          <Link href="/workspace" className="font-semibold hover:text-neutral-900">
            ← Workspace
          </Link>
          <span>Evaluated {new Date(row.createdAt).toLocaleString()}</span>
        </div>

        <ReportCard
          report={row.report}
          onRestart={() => router.push("/analyze")}
          savedId={row.id}
          showFeedback={false}
        />

        <section className="card-quiet mt-6">
          <WhatHappenedNext
            evaluationId={row.id}
            initialWorkflow={row.userWorkflow}
            initialPerformance={row.outcome.performance}
          />
          <form onSubmit={onSaveNotes} className="mt-6 border-t border-neutral-100 pt-5">
            <label className="label">Notes (optional)</label>
            <textarea
              className="input mt-2 min-h-[72px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Budget context, results, or why you passed on this creator…"
            />
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={onDeleteLocal}
                className="text-xs font-semibold text-rose-700 hover:text-rose-900"
              >
                Remove from this device
              </button>
              <div className="flex items-center gap-3">
                {notesSaved && (
                  <span className="text-xs text-emerald-700">Notes saved {notesSaved}</span>
                )}
                <button type="submit" className="btn-secondary !py-2 !text-sm">
                  Save notes
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
