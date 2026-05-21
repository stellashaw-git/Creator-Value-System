/** Static sample output — adds product atmosphere without live data. */
export function EvaluationPreview({ className = "" }: { className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-neutral-200/80 bg-gradient-to-br from-neutral-900 via-neutral-900 to-emerald-950 p-5 text-white shadow-xl ring-1 ring-neutral-800/50 sm:p-6 ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400/90">
            Sample evaluation
          </p>
          <p className="mt-1 text-lg font-bold">Maya Ortega</p>
          <p className="text-xs text-neutral-400">Instagram · Fitness</p>
        </div>
        <div className="rounded-xl bg-white/10 px-3 py-2 text-center ring-1 ring-white/10">
          <p className="text-[10px] font-medium text-neutral-400">Score</p>
          <p className="text-2xl font-extrabold tabular-nums">78</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {["Strong Candidate", "High fit", "High confidence"].map((chip) => (
          <span
            key={chip}
            className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 ring-1 ring-emerald-400/30"
          >
            {chip}
          </span>
        ))}
      </div>

      <p className="mt-4 text-sm leading-relaxed text-neutral-300">
        Audience shows strong purchase intent. Worth a partnership conversation before
        committing campaign budget.
      </p>

      <div className="mt-4 flex gap-2 border-t border-white/10 pt-4">
        {[
          { label: "Engagement", value: "Strong" },
          { label: "Growth", value: "Moderate" },
          { label: "Intent", value: "High" },
        ].map((s) => (
          <div
            key={s.label}
            className="flex-1 rounded-lg bg-white/5 px-2.5 py-2 ring-1 ring-white/10"
          >
            <p className="text-[10px] text-neutral-500">{s.label}</p>
            <p className="text-xs font-semibold text-neutral-200">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
