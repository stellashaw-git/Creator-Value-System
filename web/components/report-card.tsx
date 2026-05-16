import Link from "next/link";
import type { Report } from "@/lib/types";
import { isEngagementKnown, isGrowthKnown } from "@/lib/scoring";
import { Badge, toneFor } from "./score-badge";
import { DecisionBanner } from "./decision-banner";
import { OutreachPanel } from "./outreach-panel";

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// Subtle pill — used sparingly to mark explainability sections.
function ReasoningPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-600">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-400" />
      Reasoning
    </span>
  );
}

// ---------------- Snapshot ----------------

function Snapshot({ report }: { report: Report }) {
  const { input } = report;
  const cells: {
    label: string;
    value: string;
    sub?: string;
    tone?: "green" | "amber" | "red" | "neutral";
  }[] = [
    { label: "Creator", value: input.name, sub: `${input.platform} · ${input.niche}` },
    {
      label: "Audience size",
      value: formatFollowers(input.followers),
      sub: `${formatFollowers(input.avgViews)} avg views`,
    },
    {
      label: "Growth signal",
      value: report.growth.label,
      sub: isGrowthKnown(input)
        ? `+${Math.round(input.growthRate30d! * 100)}% / 30d`
        : "Unknown",
      tone: toneFor(report.growth.label),
    },
    {
      label: "Engagement",
      value: report.engagement.label,
      sub: isEngagementKnown(input) ? pct(input.engagementRate!) : "Not enough data",
      tone: toneFor(report.engagement.label),
    },
    {
      label: "Monetization",
      value: report.monetization.label,
      sub: `${report.pillarScores.intent}/100 intent`,
      tone: toneFor(report.monetization.label),
    },
    {
      label: "Brand fit",
      value: `${report.brandFit.score}/100`,
      sub: input.brandCategory || "Niche-native",
    },
  ];

  return (
    <section className="card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="section-title">Creator Opportunity Snapshot</div>
          <p className="mt-1 text-sm text-neutral-500">
            Pillar-level read on commercial readiness.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">
            Commercial Score
          </span>
          <span className="rounded-lg bg-neutral-900 px-3 py-1.5 text-lg font-extrabold text-white">
            {report.overallScore}
            <span className="text-sm font-semibold opacity-70"> / 100</span>
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        {cells.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-4"
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
              {c.label}
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              {c.tone ? (
                <Badge label={c.value} tone={c.tone} />
              ) : (
                <span className="text-lg font-bold text-neutral-900">{c.value}</span>
              )}
            </div>
            {c.sub && <div className="mt-1.5 text-xs text-neutral-500">{c.sub}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------- Opportunity Brief (memo) ----------------

function MemoSection({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="border-t border-neutral-200 pt-5 first:border-t-0 first:pt-0">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">
        {heading}
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-neutral-800">{body}</p>
    </div>
  );
}

function OpportunityBrief({ report }: { report: Report }) {
  const m = report.memo;
  return (
    <section className="card">
      <div className="flex flex-col gap-2 border-b border-neutral-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="section-title">Creator Opportunity Brief</div>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-neutral-900">
            {report.input.name} · {report.input.niche}
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Campaign-decision brief for brand and MCN partnership teams.
          </p>
        </div>
        <div className="text-xs text-neutral-500">Prepared by WorthyIQ</div>
      </div>
      <div className="mt-6 space-y-5">
        <MemoSection heading="Executive Summary" body={m.executiveSummary} />
        <MemoSection heading="Why This Creator Matters" body={m.whyMatters} />
        <MemoSection heading="Commercial Upside" body={m.commercialUpside} />
        <MemoSection heading="Audience & Engagement Signal" body={m.audienceSignal} />
        <MemoSection heading="Monetization Gap" body={m.monetizationGap} />
        <MemoSection heading="Risk Factors" body={m.riskFactors} />
      </div>
    </section>
  );
}

// ---------------- Why this decision? (explainability) ----------------

const PILLAR_LABELS: Record<keyof Report["pillarScores"], string> = {
  engagement: "Engagement quality",
  reach: "Reach & audience size",
  growth: "Growth momentum",
  intent: "Audience purchase intent",
};

function pillarVerdict(score: number): { tone: "green" | "amber" | "red"; text: string } {
  if (score >= 65) return { tone: "green", text: "Strong" };
  if (score >= 40) return { tone: "amber", text: "Moderate" };
  return { tone: "red", text: "Weak" };
}

function WhyThisDecision({ report }: { report: Report }) {
  const pillars = Object.entries(report.pillarScores) as Array<
    [keyof Report["pillarScores"], number]
  >;
  const sorted = [...pillars].sort((a, b) => a[1] - b[1]);

  return (
    <details className="card group" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="section-title">Why this decision?</span>
            <ReasoningPill />
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            How each pillar contributed to the {report.decision} call.
          </p>
        </div>
        <span className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-600 transition group-open:rotate-180">
          ▾
        </span>
      </summary>

      <div className="mt-5 space-y-3">
        {sorted.map(([key, score]) => {
          const v = pillarVerdict(score);
          const barColor =
            v.tone === "green"
              ? "bg-emerald-500"
              : v.tone === "amber"
                ? "bg-amber-500"
                : "bg-rose-500";
          return (
            <div
              key={key}
              className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-lg border border-neutral-200 bg-white px-4 py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-neutral-900">
                    {PILLAR_LABELS[key]}
                  </span>
                  <Badge label={v.text} tone={v.tone} />
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full ${barColor}`}
                    style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
                  />
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums text-neutral-900">
                  {score}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
                  / 100
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">
          Recommended strategy
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-neutral-800">
          {report.memo.recommendedStrategy}
        </p>
      </div>

      <p className="mt-4 text-xs text-neutral-500">
        Commercial Score = 35% engagement quality + 25% reach + 25% growth + 15% audience intent.
        Each pillar is benchmarked against the creator's tier baseline before contributing to the call.
      </p>
    </details>
  );
}

// ---------------- Action layer ----------------

function ActionLayerHeader() {
  return (
    <div className="flex items-baseline justify-between border-b border-neutral-200 pb-3">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500">
          From decision to campaign
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Outreach drafts and the next-action plan are tuned to this specific decision.
        </p>
      </div>
      <span className="hidden text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700 sm:inline">
        Next step
      </span>
    </div>
  );
}

function OutreachCard({ report }: { report: Report }) {
  return (
    <section className="card">
      <div>
        <div className="section-title">Outreach Message Generator</div>
        <p className="mt-1 text-sm text-neutral-500">
          Three pre-drafted messages, tuned to the creator's signal. Edit, copy, send.
        </p>
      </div>
      <div className="mt-5">
        <OutreachPanel outreach={report.outreach} />
      </div>
    </section>
  );
}

const PRIORITY_STYLES: Record<
  "now" | "next" | "watch",
  { label: string; bg: string; ring: string; text: string }
> = {
  now: { label: "Do now", bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-800" },
  next: { label: "Do next", bg: "bg-amber-50", ring: "ring-amber-200", text: "text-amber-800" },
  watch: { label: "Track", bg: "bg-neutral-100", ring: "ring-neutral-200", text: "text-neutral-700" },
};

function NextActions({ report }: { report: Report }) {
  return (
    <section className="card">
      <div>
        <div className="section-title">Next Action Plan</div>
        <p className="mt-1 text-sm text-neutral-500">
          Three decision-grade moves, prioritized by sequence.
        </p>
      </div>
      <ol className="mt-5 space-y-3">
        {report.nextActions.map((a, idx) => {
          const p = PRIORITY_STYLES[a.priority];
          return (
            <li
              key={idx}
              className="grid grid-cols-[auto_1fr] gap-4 rounded-xl border border-neutral-200 bg-white p-4"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold text-white">
                {idx + 1}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-neutral-900">{a.title}</span>
                  <span className={`badge ${p.bg} ${p.text} ring-1 ${p.ring}`}>{p.label}</span>
                </div>
                <p className="mt-1.5 text-sm text-neutral-600">{a.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---------------- Top-level ----------------

export function ReportCard({
  report,
  onRestart,
  savedId,
}: {
  report: Report;
  onRestart: () => void;
  savedId?: string;
}) {
  const dateLabel = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
            WIQ
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">
              WorthyIQ · Creator Intelligence Platform
            </div>
            <div className="text-sm text-neutral-700">
              Decision ready · {dateLabel}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {savedId && (
            <Link
              href={`/dataset/${savedId}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-800 hover:bg-emerald-100"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Saved · view in dataset
            </Link>
          )}
          <button type="button" onClick={onRestart} className="btn-secondary">
            Evaluate another creator
          </button>
        </div>
      </header>

      {/* The decision leads — system takes responsibility. */}
      <DecisionBanner
        decision={report.decision}
        rationale={report.decisionRationale}
        confidence={report.decisionConfidence}
        confidenceReason={report.decisionConfidenceReason}
      />

      <Snapshot report={report} />

      <OpportunityBrief report={report} />

      <WhyThisDecision report={report} />

      <ActionLayerHeader />

      <OutreachCard report={report} />

      <NextActions report={report} />
    </div>
  );
}
