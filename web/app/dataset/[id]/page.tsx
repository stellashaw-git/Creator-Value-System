"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ReportCard } from "@/components/report-card";
import {
  CAMPAIGN_STATUSES,
  deleteEvaluation,
  getEvaluation,
  updateOutcome,
  type CampaignOutcome,
  type SavedEvaluation,
} from "@/lib/dataset";

type FormState = {
  status: CampaignOutcome["status"];
  budget: string;
  estimatedROI: string;
  actualROI: string;
  conversionResult: string;
  notes: string;
  followUpDate: string;
};

const EMPTY_FORM: FormState = {
  status: "Not started",
  budget: "",
  estimatedROI: "",
  actualROI: "",
  conversionResult: "",
  notes: "",
  followUpDate: "",
};

function outcomeToForm(o: CampaignOutcome): FormState {
  return {
    status: o.status,
    budget: o.budget != null ? String(o.budget) : "",
    estimatedROI: o.estimatedROI != null ? String(o.estimatedROI) : "",
    actualROI: o.actualROI != null ? String(o.actualROI) : "",
    conversionResult: o.conversionResult ?? "",
    notes: o.notes ?? "",
    followUpDate: o.followUpDate ?? "",
  };
}

function formToOutcome(f: FormState): CampaignOutcome {
  const num = (s: string): number | undefined => {
    if (s.trim() === "") return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };
  const text = (s: string): string | undefined => (s.trim() === "" ? undefined : s.trim());
  return {
    status: f.status,
    budget: num(f.budget),
    estimatedROI: num(f.estimatedROI),
    actualROI: num(f.actualROI),
    conversionResult: text(f.conversionResult),
    notes: text(f.notes),
    followUpDate: text(f.followUpDate),
  };
}

export default function EvaluationDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [row, setRow] = useState<SavedEvaluation | null | undefined>(undefined); // undefined = loading
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const found = getEvaluation(id);
    setRow(found ?? null);
    if (found) setForm(outcomeToForm(found.outcome));
  }, [id]);

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const updated = updateOutcome(id, formToOutcome(form));
    if (updated) {
      setRow(updated);
      setSavedAt(new Date().toLocaleTimeString());
    }
  };

  const onDelete = () => {
    if (!id) return;
    if (!confirm("Delete this evaluation from your dataset? This cannot be undone.")) return;
    deleteEvaluation(id);
    router.push("/dataset");
  };

  // Loading
  if (row === undefined) {
    return (
      <Shell>
        <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
          Loading evaluation…
        </div>
      </Shell>
    );
  }

  // Not found
  if (row === null) {
    return (
      <Shell>
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <h2 className="text-lg font-bold text-neutral-900">Evaluation not found</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            This evaluation either was never saved on this device, or has been cleared from local
            storage.
          </p>
          <Link href="/dataset" className="btn-primary mt-6 inline-flex">
            ← Back to dataset
          </Link>
        </div>
      </Shell>
    );
  }

  const r = row.report;
  return (
    <Shell>
      <div className="mb-4 flex items-center justify-between text-xs text-neutral-500">
        <Link href="/dataset" className="font-semibold hover:text-neutral-900">
          ← Dataset
        </Link>
        <span>
          Evaluated {new Date(row.createdAt).toLocaleString()} · last updated{" "}
          {new Date(row.updatedAt).toLocaleString()}
        </span>
      </div>

      <ReportCard report={r} onRestart={() => router.push("/analyze")} savedId={row.id} />

      {/* Outcome form */}
      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-1 border-b border-neutral-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500">
              Campaign outcome feedback loop
            </div>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-neutral-900">
              Update Campaign Outcome
            </h2>
            <p className="mt-1 max-w-xl text-sm text-neutral-600">
              Connect this decision to the actual campaign result. Every outcome you record makes
              the next decision sharper.
            </p>
          </div>
          <button
            type="button"
            onClick={onDelete}
            className="self-start rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
          >
            Delete evaluation
          </button>
        </div>

        <form onSubmit={onSave} className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="label">Campaign status</label>
            <select
              className="input"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as CampaignOutcome["status"] }))
              }
            >
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Campaign budget (USD)</label>
            <input
              className="input"
              inputMode="decimal"
              placeholder="e.g. 5000"
              value={form.budget}
              onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
            />
          </div>

          <div>
            <label className="label">Estimated ROI (×)</label>
            <input
              className="input"
              inputMode="decimal"
              placeholder="e.g. 2.5"
              value={form.estimatedROI}
              onChange={(e) => setForm((f) => ({ ...f, estimatedROI: e.target.value }))}
            />
          </div>

          <div>
            <label className="label">Actual ROI (×)</label>
            <input
              className="input"
              inputMode="decimal"
              placeholder="e.g. 3.1"
              value={form.actualROI}
              onChange={(e) => setForm((f) => ({ ...f, actualROI: e.target.value }))}
            />
          </div>

          <div>
            <label className="label">Conversion result</label>
            <input
              className="input"
              placeholder="e.g. 412 link clicks · 18 paid orders"
              value={form.conversionResult}
              onChange={(e) => setForm((f) => ({ ...f, conversionResult: e.target.value }))}
            />
          </div>

          <div>
            <label className="label">Follow-up date</label>
            <input
              className="input"
              type="date"
              value={form.followUpDate}
              onChange={(e) => setForm((f) => ({ ...f, followUpDate: e.target.value }))}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea
              className="input min-h-[120px]"
              placeholder="What worked, what didn't, what should the next decision know about?"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="flex items-center justify-end gap-3 sm:col-span-2">
            {savedAt && (
              <span className="text-xs text-emerald-700">Saved at {savedAt}</span>
            )}
            <button type="submit" className="btn-primary">
              Save outcome
            </button>
          </div>
        </form>
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
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
      <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
    </main>
  );
}
