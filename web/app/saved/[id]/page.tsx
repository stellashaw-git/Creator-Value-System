"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { ReportCard } from "@/components/report-card";
import { WhatHappenedNext } from "@/components/what-happened-next";
import {
  deleteEvaluation,
  getEvaluation,
  updateEvaluationFeedback,
  type SavedEvaluation,
} from "@/lib/dataset";

export default function SavedCreatorDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [row, setRow] = useState<SavedEvaluation | null | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const found = getEvaluation(id);
    setRow(found ?? null);
    if (found) setNotes(found.outcome.notes ?? "");
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

  const onDelete = () => {
    if (!id) return;
    if (!confirm("Remove this creator from your saved list?")) return;
    deleteEvaluation(id);
    router.push("/saved");
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
              This evaluation was not saved on this device or was removed.
            </p>
            <Link href="/saved" className="btn-primary mt-4 inline-block">
              Saved creators
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
          <Link href="/saved" className="font-semibold hover:text-neutral-900">
            ← Saved creators
          </Link>
          <Link href="/compare" className="font-semibold text-emerald-700 hover:text-emerald-900">
            Compare saved creators
          </Link>
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
            initialStatus={row.outcome.status}
            initialFollowed={row.followedRecommendation}
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
                onClick={onDelete}
                className="text-xs font-semibold text-rose-700 hover:text-rose-900"
              >
                Remove saved creator
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
