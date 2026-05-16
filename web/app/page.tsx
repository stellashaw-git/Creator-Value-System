import Link from "next/link";

const PERSONAS = [
  {
    tag: "For brands",
    title: "Run influencer marketing without guessing.",
    body: "Decide which creators are worth campaign budget before sending the first brief. Stop spending on reach that doesn't convert.",
  },
  {
    tag: "For MCN agencies",
    title: "Match creators to brands with confidence.",
    body: "Pre-qualify partnership outreach with a clear Final Decision. Defend rate cards with pillar-level evidence, not hunches.",
  },
];

const OUTCOMES = [
  "Identify which creators are worth investing in before spending budget.",
  "Turn creator data into faster, smarter campaign decisions.",
  "Reduce guesswork in influencer marketing — every approval has a stated confidence.",
];

const FLOW_STEPS = [
  {
    num: "01",
    title: "Brief the platform",
    body: "Drop in the creator's profile, performance metrics, and a recent comment sample.",
  },
  {
    num: "02",
    title: "Signals are evaluated",
    body: "Audience intent, engagement quality, monetization gap, brand fit, partnership readiness — all benchmarked against tier baselines.",
  },
  {
    num: "03",
    title: "Receive a Creator Opportunity Brief",
    body: "Investor-style memo, a Final Decision with confidence, three outreach drafts, and a next-action plan tuned for campaign execution.",
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
                Dataset
              </Link>
            </nav>
          </div>
          <Link href="/analyze" className="btn-primary !py-1.5 !px-4">
            Evaluate a Creator
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-24 pb-16 sm:pt-32">
        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Decision system · live demo
        </div>
        <h1 className="mt-6 max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
          The decision system for{" "}
          <span className="text-emerald-600">influencer marketing</span>.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-700">
          WorthyIQ helps brands and MCN agencies evaluate creators, improve marketing ROI,
          and turn creator signals into actionable campaign decisions.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/analyze" className="btn-primary">
            Evaluate a Creator →
          </Link>
          <Link href="/analyze?demo=1" className="btn-secondary">
            Try a sample creator
          </Link>
        </div>

        {/* Outcome bullets */}
        <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {OUTCOMES.map((o, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5">
                  <path
                    d="M5 10.5l3 3 7-7"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </span>
              <span className="text-sm leading-relaxed text-neutral-700">{o}</span>
            </li>
          ))}
        </ul>
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
          <p className="mt-6 text-xs text-neutral-500">
            Also used by creator-economy investors screening operators by commercial signal, not follower count.
          </p>
        </div>
      </section>

      {/* Capability strip */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-neutral-500">
          What the platform delivers
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((c) => (
            <div key={c.label} className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="inline-flex items-center rounded-full border border-neutral-300 bg-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-700">
                {c.label}
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-neutral-800">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Flow */}
      <section className="border-t border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-neutral-500">
            From evaluation to execution
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            {FLOW_STEPS.map((s) => (
              <div key={s.num} className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-6">
                <div className="text-xs font-bold tracking-[0.2em] text-emerald-700">{s.num}</div>
                <div className="mt-2 text-lg font-bold text-neutral-900">{s.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{s.body}</p>
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
              Creator Opportunity Brief
            </h2>
            <h3 className="mt-3 text-3xl font-extrabold tracking-tight text-neutral-900">
              A campaign-grade brief your marketing team can act on — not a dashboard.
            </h3>
            <p className="mt-4 text-base leading-relaxed text-neutral-700">
              Every evaluation ends in a structured brief: executive summary, commercial upside,
              monetization gap, honest risk factors, and the exact partnership shape the platform
              recommends. Paired with a Final Decision banner that states its
              <span className="font-semibold text-neutral-900"> confidence</span>, and an expandable
              <span className="font-semibold text-neutral-900"> Why this decision? </span>
              reasoning view your team can defend internally.
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

      {/* Data moat / learning layer */}
      <section className="border-t border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-700">
                Decision learning layer
              </div>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-neutral-900">
                The moat is creator signal × campaign outcome data.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-neutral-700">
                Every evaluation is stored as <span className="font-semibold text-neutral-900">structured creator
                intelligence</span> — inputs, signals, decision, confidence, outreach, and the actions taken.
                As your team logs real campaign outcomes against those decisions, the dataset compounds into
                a <span className="font-semibold text-neutral-900">creator signal-to-outcome dataset</span> nobody
                else has.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/dataset" className="btn-secondary">
                  Open the dataset →
                </Link>
                <Link href="/analyze?demo=1" className="text-sm font-semibold text-neutral-700 hover:text-neutral-900">
                  Or evaluate a sample creator
                </Link>
              </div>
            </div>
            <ul className="grid grid-cols-1 gap-3">
              {[
                {
                  k: "Inputs",
                  v: "Profile, metrics, comment sample, brand category — captured per evaluation.",
                },
                {
                  k: "Evaluation",
                  v: "Commercial Score, pillar scores, Final Decision, stated confidence.",
                },
                {
                  k: "Action",
                  v: "Outreach drafts and the recommended next-action plan, tied to the decision.",
                },
                {
                  k: "Outcome",
                  v: "Campaign status, budget, estimated vs. actual ROI, conversion notes.",
                },
                {
                  k: "Feedback loop",
                  v: "Outcomes flow back into the dataset, sharpening the next decision.",
                },
              ].map((row) => (
                <li
                  key={row.k}
                  className="grid grid-cols-[120px_1fr] gap-4 rounded-xl border border-neutral-200 bg-neutral-50/60 px-4 py-3"
                >
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                    {row.k}
                  </span>
                  <span className="text-sm leading-relaxed text-neutral-700">{row.v}</span>
                </li>
              ))}
            </ul>
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
              href="/analyze"
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
            >
              Evaluate a Creator
            </Link>
            <Link
              href="/analyze?demo=1"
              className="rounded-lg border border-neutral-700 bg-transparent px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              Try the sample
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-200 py-8 text-center text-xs text-neutral-500">
        © {new Date().getFullYear()} WorthyIQ · Creator Intelligence Platform · For brands and MCN agencies
      </footer>
    </main>
  );
}
