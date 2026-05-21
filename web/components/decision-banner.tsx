import type { Decision, DecisionConfidence } from "@/lib/types";

const TONES: Record<Decision, { bg: string; ring: string; text: string; icon: string; sub: string }> = {
  "Strong Candidate": {
    bg: "bg-gradient-to-br from-emerald-900 to-emerald-700",
    ring: "ring-emerald-300/40",
    text: "text-emerald-50",
    icon: "✅",
    sub: "Approve for upcoming campaigns",
  },
  Watchlist: {
    bg: "bg-gradient-to-br from-amber-900 to-amber-700",
    ring: "ring-amber-300/40",
    text: "text-amber-50",
    icon: "⏳",
    sub: "Hold before allocating campaign budget",
  },
  "Not Recommended": {
    bg: "bg-gradient-to-br from-rose-900 to-rose-700",
    ring: "ring-rose-300/40",
    text: "text-rose-50",
    icon: "⛔",
    sub: "Skip — does not justify campaign spend",
  },
};

const CONFIDENCE_TONES: Record<DecisionConfidence, { bg: string; text: string; dot: string }> = {
  High: { bg: "bg-white/15", text: "text-white", dot: "bg-emerald-300" },
  Medium: { bg: "bg-white/15", text: "text-white", dot: "bg-amber-300" },
  Low: { bg: "bg-white/15", text: "text-white", dot: "bg-rose-300" },
};

export function DecisionBanner({
  decision,
  rationale,
  confidence,
  confidenceReason,
}: {
  decision: Decision;
  rationale: string;
  confidence: DecisionConfidence;
  confidenceReason: string;
}) {
  const t = TONES[decision];
  const c = CONFIDENCE_TONES[confidence];
  return (
    <div
      className={`rounded-2xl ${t.bg} p-6 sm:p-8 shadow-lg ring-1 ${t.ring} ${t.text}`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.12em] opacity-80">
        Decision
      </div>
      <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{t.icon}</span>
            <span className="text-4xl font-extrabold sm:text-5xl">{decision}</span>
          </div>
          <p className="mt-2 text-sm font-medium opacity-75">{t.sub}</p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed opacity-90">{rationale}</p>
        </div>

        <div className={`min-w-[180px] rounded-xl ${c.bg} px-4 py-3 ring-1 ring-white/15`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">
            Confidence
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${c.dot}`} />
            <span className={`text-2xl font-extrabold ${c.text}`}>{confidence}</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed opacity-80">{confidenceReason}</p>
        </div>
      </div>
    </div>
  );
}
