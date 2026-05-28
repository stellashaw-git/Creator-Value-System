import Link from "next/link";
import {
  campaignFitFromReport,
  campaignFitTone,
} from "@/lib/campaign-fit";
import type { Report } from "@/lib/types";
import { isEngagementKnown, isGrowthKnown } from "@/lib/scoring";
import { Badge, toneFor } from "./score-badge";
import { DecisionBanner } from "./decision-banner";
import { OutreachPanel } from "./outreach-panel";
import { ReportCardFeedback } from "./report-card-feedback";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

const PILLAR_LABELS: Record<keyof Report["pillarScores"], string> = {
  engagement: "Engagement",
  reach: "Reach",
  growth: "Growth",
  intent: "Conversion evidence",
};

// ---------------- Insight-first blocks ----------------

function CampaignFit({ report }: { report: Report }) {
  const fit = campaignFitFromReport(report);
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-neutral-50/80 px-5 py-4 ring-1 ring-neutral-100 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="section-title">Campaign fit</p>
        <p className="mt-1 text-sm text-neutral-600">
          How well this creator matches your category and campaign goals.
        </p>
      </div>
      <Badge label={fit} tone={campaignFitTone(fit)} />
    </section>
  );
}

const ROLE_LABELS: Record<Report["recommendedRole"], string> = {
  Awareness: "Awareness Creator",
  Community: "Community Creator",
  Conversion: "Conversion Creator",
  Distribution: "Viral Distribution Creator",
  BrandFit: "Brand Fit / Aesthetic Creator",
};

function CommercialPotential({ report }: { report: Report }) {
  const { input } = report;
  const archetype =
    report.memo.creatorArchetype ?? ROLE_LABELS[report.recommendedRole];
  return (
    <section className="insight-panel">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="section-title">Commercial potential</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-5xl font-extrabold tracking-tight text-neutral-900">
              {report.overallScore}
            </span>
            <span className="text-lg font-medium text-neutral-400">/ 100</span>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {input.name} · {input.platform} · {input.niche}
          </p>
          <p className="mt-2 text-sm font-medium text-neutral-700">
            Recommended role: {archetype}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Badge label={report.engagement.label} tone={toneFor(report.engagement.label)} />
          <Badge label={report.growth.label} tone={toneFor(report.growth.label)} />
        </div>
      </div>
      <p className="mt-5 text-sm leading-relaxed text-neutral-600">
        {report.memo.executiveSummary}
      </p>
    </section>
  );
}

function MonetizationSignal({ report }: { report: Report }) {
  const text =
    report.signalInsights?.monetizationSignal ??
    report.memo.audienceSignal;
  return (
    <section className="rounded-2xl bg-neutral-50/80 px-5 py-4 ring-1 ring-neutral-100">
      <p className="section-title">Monetization signal</p>
      <p className="mt-2 text-sm leading-relaxed text-neutral-800">{text}</p>
      {report.signalInsights?.purchaseIntentNote && (
        <p className="mt-3 text-xs text-neutral-500">
          {report.signalInsights.purchaseIntentNote}
        </p>
      )}
    </section>
  );
}

function EvidenceConfidence({ report }: { report: Report }) {
  const insights = report.signalInsights;
  if (!insights) return null;
  const tone =
    insights.evidenceConfidenceLevel === "High"
      ? "green"
      : insights.evidenceConfidenceLevel === "Moderate"
        ? "amber"
        : "red";
  return (
    <section className="rounded-2xl bg-neutral-50/80 px-5 py-4 ring-1 ring-neutral-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="section-title">Evidence confidence</p>
        <Badge label={insights.evidenceConfidenceLevel} tone={tone} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-neutral-700">
        {insights.evidenceConfidence}
      </p>
    </section>
  );
}

function KeySignals({ report }: { report: Report }) {
  const { input } = report;
  const insights = report.signalInsights;
  const items = insights
    ? [
        {
          label: "Engagement quality",
          headline: report.engagement.label,
          detail: insights.engagementQuality,
          score: report.pillarScores.engagement,
        },
        {
          label: "Spread signal",
          headline:
            (input.averageShares ?? 0) > 0 ? "Visible" : "Limited",
          detail: insights.spreadSignal,
          score: report.pillarScores.reach,
        },
        {
          label: "Repost / share",
          headline:
            (input.averageReposts ?? 0) > 0 || (input.averageShares ?? 0) > 0
              ? "Active"
              : "N/A",
          detail: insights.repostShareSignal,
          score: report.pillarScores.engagement,
        },
        {
          label: "Data completeness",
          headline: insights.dataCompleteness.split(" — ")[0] ?? "Moderate",
          detail: insights.dataCompleteness,
          score: report.overallScore,
        },
        {
          label: "Conversion evidence",
          headline: report.monetization.label,
          detail: report.commentIntent.commercialSummary,
          score: report.pillarScores.intent,
          footnote: insights.purchaseIntentNote,
        },
      ]
    : [
        {
          label: PILLAR_LABELS.engagement,
          headline: report.engagement.label,
          detail: isEngagementKnown(input) ? pct(input.engagementRate!) : "Limited data",
          score: report.pillarScores.engagement,
        },
        {
          label: PILLAR_LABELS.growth,
          headline: report.growth.label,
          detail: isGrowthKnown(input)
            ? `+${Math.round(input.growthRate30d! * 100)}% / 30d`
            : "Unknown",
          score: report.pillarScores.growth,
        },
        {
          label: PILLAR_LABELS.intent,
          headline: report.monetization.label,
          detail: `${report.pillarScores.intent}/100 intent`,
          score: report.pillarScores.intent,
        },
        {
          label: "Brand fit",
          headline: `${report.brandFit.score}/100`,
          detail: input.brandCategory || "Niche-native",
          score: report.brandFit.score,
        },
      ];

  return (
    <section>
      <p className="section-title mb-4">Key signals</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-xl bg-neutral-50/80 px-4 py-3.5 ring-1 ring-neutral-100"
          >
            <p className="text-[11px] font-medium text-neutral-500">{item.label}</p>
            <p className="mt-1 text-sm font-semibold text-neutral-900">{item.headline}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{item.detail}</p>
            {"footnote" in item && item.footnote && (
              <p className="mt-2 text-[11px] leading-snug text-neutral-400">
                {item.footnote}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function RecommendedAction({ report }: { report: Report }) {
  const primary = report.nextActions[0];
  const rest = report.nextActions.slice(1);

  return (
    <section className="insight-panel">
      <p className="section-title">Recommended action</p>
      {primary && (
        <div className="mt-4">
          <p className="text-lg font-semibold text-neutral-900">{primary.title}</p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">{primary.detail}</p>
        </div>
      )}

      {(rest.length > 0 || report.outreach) && (
        <details className="mt-6 group">
          <summary className="cursor-pointer text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Outreach drafts & follow-up steps
          </summary>
          <div className="mt-5 space-y-6 border-t border-neutral-100 pt-5">
            {rest.length > 0 && (
              <ol className="space-y-3">
                {rest.map((a, idx) => (
                  <li key={idx} className="text-sm text-neutral-700">
                    <span className="font-semibold text-neutral-900">{a.title}</span>
                    <span className="text-neutral-500"> — {a.detail}</span>
                  </li>
                ))}
              </ol>
            )}
            <OutreachPanel outreach={report.outreach} />
          </div>
        </details>
      )}
    </section>
  );
}

function FullBrief({ report }: { report: Report }) {
  const m = report.memo;
  const sections: { heading: string; body: string }[] = [
    { heading: "Context", body: m.whyMatters },
    { heading: "Possible upside (uploaded evidence)", body: m.commercialUpside },
    { heading: "Caveats", body: m.riskFactors },
  ];

  return (
    <details className="card-quiet group">
      <summary className="cursor-pointer list-none text-sm font-semibold text-neutral-700 hover:text-neutral-900">
        <span className="inline-flex items-center gap-2">
          Detailed evaluation
          <span className="text-neutral-400 transition group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="mt-6 space-y-5 border-t border-neutral-100 pt-6">
        {sections.map((s) => (
          <div key={s.heading}>
            <p className="text-xs font-medium text-neutral-500">{s.heading}</p>
            <p className="mt-2 text-[15px] leading-relaxed text-neutral-800">{s.body}</p>
          </div>
        ))}
        <div className="rounded-xl bg-neutral-50 p-4">
          <p className="text-xs font-medium text-neutral-500">Suggested approach</p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-800">
            {m.recommendedStrategy}
          </p>
        </div>
      </div>
    </details>
  );
}

function ScoringDetail({ report }: { report: Report }) {
  const pillars = Object.entries(report.pillarScores) as Array<
    [keyof Report["pillarScores"], number]
  >;
  const sorted = [...pillars].sort((a, b) => a[1] - b[1]);

  function pillarVerdict(score: number): { tone: "green" | "amber" | "red"; text: string } {
    if (score >= 65) return { tone: "green", text: "Strong" };
    if (score >= 40) return { tone: "amber", text: "Moderate" };
    return { tone: "red", text: "Weak" };
  }

  return (
    <details className="card-quiet group">
      <summary className="cursor-pointer list-none text-sm font-semibold text-neutral-700 hover:text-neutral-900">
        <span className="inline-flex items-center gap-2">
          How we scored this evaluation
          <span className="text-neutral-400 transition group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="mt-6 space-y-3 border-t border-neutral-100 pt-6">
        {sorted.map(([key, score]) => {
          const v = pillarVerdict(score);
          return (
            <div
              key={key}
              className="flex items-center justify-between gap-4 rounded-lg bg-neutral-50/80 px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-neutral-800">
                  {PILLAR_LABELS[key]}
                </span>
                <Badge label={v.text} tone={v.tone} />
              </div>
              <span className="text-lg font-bold tabular-nums text-neutral-900">{score}</span>
            </div>
          );
        })}
      </div>
    </details>
  );
}

// ---------------- Top-level ----------------

export function ReportCard({
  report,
  onRestart,
  savedId,
  showFeedback = true,
}: {
  report: Report;
  onRestart: () => void;
  savedId?: string;
  showFeedback?: boolean;
}) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          Evaluation · <span className="font-semibold text-neutral-800">{report.input.name}</span>
        </p>
        <div className="flex items-center gap-2">
          {savedId && (
            <Link
              href={`/dataset/${savedId}`}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
            >
              Saved →
            </Link>
          )}
          <button type="button" onClick={onRestart} className="btn-secondary !py-2 !px-4 !text-sm">
            New evaluation
          </button>
        </div>
      </div>

      <DecisionBanner
        decision={report.decision}
        rationale={report.decisionRationale}
        confidence={report.decisionConfidence}
        confidenceReason={report.decisionConfidenceReason}
      />

      {report.decisionConfidence !== "High" && (
        <p className="text-center text-xs text-neutral-500">
          Based on partial uploaded evidence — add post, comment, and analytics screenshots for higher confidence.
        </p>
      )}

      <CommercialPotential report={report} />
      <MonetizationSignal report={report} />
      <EvidenceConfidence report={report} />
      <CampaignFit report={report} />
      <RecommendedAction report={report} />
      {savedId && showFeedback && <ReportCardFeedback savedId={savedId} />}
      <KeySignals report={report} />
      <FullBrief report={report} />
      <ScoringDetail report={report} />
    </div>
  );
}
