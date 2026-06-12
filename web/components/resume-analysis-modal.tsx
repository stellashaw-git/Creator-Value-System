"use client";

interface ResumeAnalysisModalProps {
  creatorLabel: string;
  onResume: () => void;
  onStartNew: () => void;
}

export function ResumeAnalysisModal({
  creatorLabel,
  onResume,
  onStartNew,
}: ResumeAnalysisModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-analysis-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
          Resume previous analysis?
        </p>
        <h2
          id="resume-analysis-title"
          className="mt-2 text-lg font-semibold text-neutral-900"
        >
          We found an unfinished creator analysis
        </h2>
        {creatorLabel && (
          <p className="mt-2 text-sm text-neutral-600">{creatorLabel}</p>
        )}
        <p className="mt-3 text-sm leading-relaxed text-neutral-500">
          Resume to restore your inputs, campaign settings, and last report without
          running another evaluation.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onStartNew}
            className="rounded-lg border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Start new
          </button>
          <button
            type="button"
            onClick={onResume}
            className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            Resume
          </button>
        </div>
      </div>
    </div>
  );
}
