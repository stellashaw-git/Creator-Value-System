import Link from "next/link";
import { EvaluationPreview } from "@/components/evaluation-preview";

const PERSONAS = [
  {
    tag: "For brands",
    title: "Run influencer marketing without guessing.",
    body: "Decide which creators are worth campaign budget before sending the first brief. Stop spending on reach that doesn't convert.",
  },
  {
    tag: "For MCN agencies",
    title: "Match creators to brands with confidence.",
    body: "Pre-qualify creators with a clear decision and evidence your clients can trust.",
  },
];

const OUTCOMES = [
  "Identify which creators are worth investing in before spending budget.",
  "Turn creator data into faster, smarter campaign decisions.",
  "Reduce guesswork in influencer marketing — every approval has a stated confidence.",
];

const FLOW_STEPS = [
  {
    title: "Brief the platform",
    body: "Drop in the creator's profile, performance metrics, and a recent comment sample.",
  },
  {
    title: "Signals are evaluated",
    body: "Audience intent, engagement quality, monetization gap, brand fit, partnership readiness — all benchmarked against tier baselines.",
  },
  {
    title: "Get your evaluation",
    body: "A clear decision, commercial score, campaign fit, and recommended next steps — plus outreach you can send today.",
  },
];

const CAPABILITIES = [
  {
    label: "Evaluation",
    body: "Pillar-level commercial scoring against tier baselines — not vanity follower counts.",
  },
  {
    label: "Reasoning",
    body: "Every decision exposes the signal contributions behind it. No black box your CMO can't defend.",
  },
  {
    label: "Decision",
    body: "A Final Decision (Strong Candidate / Watchlist / Not Recommended) with stated confidence.",
  },
  {
    label: "Action",
    body: "Outreach drafts and a prioritized next-action plan — straight into campaign execution.",
  },
];

const BRIEF_SECTIONS = [
  "Executive Summary",
  "Why This Creator Matters",
  "Commercial Upside",
  "Audience & Engagement Signal",
  "Monetization Gap",
  "Risk Factors",
  "Final Decision",
];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-4">
            <div className="flex items-baseline gap-2">
              <span className="text-base font-extrabold tracking-tight">WorthyIQ</span>
              <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                Creator Intelligence Platform
              </span>
            </div>
            <nav className="hidden items-center gap-3 text-xs font-semibold text-neutral-500 sm:flex">
              <Link href="/dataset" className="hover:text-neutral-900">
                Saved
              </Link>
              <Link href="/compare" className="hover:text-neutral-900">
                Compare
              </Link>
              <Link href="/waitlist" className="text-neutral-400 hover:text-neutral-900">
                Early access
              </Link>
            </nav>
          </div>
          <Link href="/analyze" className="btn-primary !py-1.5 !px-4">
            Analyze Your Own Creator
          </Link>
        </div>
      </header>

      {/* Hero — identity + value only; workflow lives on /analyze */}
      <section className="mx-auto max-w-6xl px-6 pt-24 pb-28 sm:min-h-[calc(100vh-4.5rem)] sm:flex sm:flex-col sm:justify-center sm:pt-32 sm:pb-36">
        <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
          WorthyIQ
        </h1>
        <p className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
          An AI-driven decision platform for{" "}
          <span className="text-emerald-600">influencer marketing</span>.
        </p>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-600">
          Evaluate creators before you spend on influencer marketing.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/analyze?demo=1" className="btn-secondary">
            Try Sample Creator
          </Link>
          <Link href="/analyze" className="btn-primary">
            Analyze Your Own Creator →
          </Link>
        </div>
        <p className="mt-4 text-xs text-neutral-500">
          Free creator evaluations during early access
        </p>
      </section>

      {/* Value proof + sample output — below hero */}
      <section className="border-t border-neutral-200/80 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 py-14 lg:grid-cols-2 lg:gap-14">
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-1">
            {OUTCOMES.map((o, i) => (
              <li key={i} className="text-sm leading-relaxed text-neutral-600">
                {o}
              </li>
            ))}
          </ul>
          <EvaluationPreview />
        </div>
      </section>

      {/* Personas — primary users */}
      <section className="border-y border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-neutral-500">
            Who uses WorthyIQ
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            {PERSONAS.map((p) => (
              <div
                key={p.tag}
                className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-8"
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                  {p.tag}
                </div>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">
                  {p.title}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-neutral-700">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities — light, secondary */}
      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <p className="text-sm font-medium text-neutral-500">What you can do</p>
        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
          {CAPABILITIES.map((c) => (
            <div key={c.label}>
              <p className="text-base font-semibold text-neutral-900">{c.label}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works — minimal, no cards */}
      <section className="border-t border-neutral-100">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
          <p className="text-sm font-medium text-neutral-500">How it works</p>
          <div className="mt-8 flex flex-col gap-8 md:flex-row md:gap-12">
            {FLOW_STEPS.map((s) => (
              <div key={s.title} className="flex-1 md:max-w-[200px]">
                <p className="text-base font-semibold text-neutral-900">{s.title}</p>
                <p className="mt-1 text-sm text-neutral-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Brief preview */}
      <section className="border-t border-neutral-200">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-20 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-neutral-500">
              What you get
            </h2>
            <h3 className="mt-3 text-3xl font-extrabold tracking-tight text-neutral-900">
              A clear creator decision your team can act on — not a metrics dump.
            </h3>
            <p className="mt-4 text-base leading-relaxed text-neutral-700">
              Every evaluation returns a decision, commercial score, campaign fit, and a
              recommended next step. Expand for full analysis, risks, and outreach drafts when
              you need more detail.
            </p>
          </div>
          <ul className="space-y-3">
            {BRIEF_SECTIONS.map((m) => (
              <li
                key={m}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
              >
                <span className="text-sm font-medium text-neutral-800">{m}</span>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                  in brief
                </span>
              </li>
            ))}
            <li className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              + 3 outreach drafts (brand / MCN / casual warm DM) and a 3-step action plan.
            </li>
          </ul>
        </div>
      </section>

      {/* Save & compare — customer-facing, not infrastructure narrative */}
      <section className="border-t border-neutral-200 bg-neutral-50/40">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-extrabold tracking-tight text-neutral-900">
            Save and compare creators
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-600">
            Evaluations stay on your device so you can shortlist creators and compare decisions
            before outreach.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dataset" className="btn-secondary">
              View saved creators
            </Link>
            <Link href="/compare" className="btn-secondary">
              Compare creators
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-900 p-10 text-center text-white sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-400">
              60-second demo
            </div>
            <h3 className="mt-2 text-2xl font-extrabold">
              Run a real campaign decision in under a minute.
            </h3>
          </div>
          <div className="flex gap-3">
            <Link
              href="/analyze?demo=1"
              className="rounded-lg border border-neutral-700 bg-transparent px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              Try Sample Creator
            </Link>
            <Link
              href="/analyze"
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
            >
              Analyze Your Own Creator
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-200 py-8 text-center text-xs text-neutral-500">
        <p>
          © {new Date().getFullYear()} WorthyIQ · Creator Intelligence Platform · For brands and MCN agencies
        </p>
        <p className="mt-2">
          <Link href="/waitlist" className="text-neutral-600 hover:text-neutral-900">
            Get notified when advanced creator comparison launches
          </Link>
        </p>
      </footer>
    </main>
  );
}
