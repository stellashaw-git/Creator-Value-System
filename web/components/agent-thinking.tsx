"use client";

import { useEffect, useState } from "react";

const STEPS = [
  "Collecting creator signals",
  "Evaluating audience quality",
  "Detecting monetization gap",
  "Identifying brand fit",
  "Mapping partnership potential",
  "Preparing decision brief",
];

export function AgentThinking({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<boolean[]>(STEPS.map(() => false));

  useEffect(() => {
    if (!active) return;
    setStep(0);
    setDone(STEPS.map(() => false));
    const timers: ReturnType<typeof setTimeout>[] = [];
    STEPS.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          setDone((prev) => {
            const next = [...prev];
            next[i] = true;
            return next;
          });
          setStep(Math.min(STEPS.length - 1, i + 1));
        }, 600 + i * 850)
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [active]);

  return (
    <div className="mx-auto w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-white">
          <span className="absolute inset-0 animate-ping rounded-full bg-neutral-900 opacity-30" />
          <span className="relative text-xs font-bold tracking-wider">WIQ</span>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">
            Evaluation in progress
          </div>
          <div className="text-sm text-neutral-700">
            Synthesizing your creator evaluation…
          </div>
        </div>
      </div>

      <ul className="mt-7 space-y-3">
        {STEPS.map((s, i) => {
          const isDone = done[i];
          const isActive = !isDone && i === step;
          return (
            <li
              key={s}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                isDone
                  ? "bg-neutral-50 text-neutral-900"
                  : isActive
                    ? "bg-neutral-100 text-neutral-900"
                    : "text-neutral-400"
              }`}
            >
              <span className="flex h-5 w-5 items-center justify-center">
                {isDone ? (
                  <svg viewBox="0 0 20 20" className="h-5 w-5 text-emerald-600">
                    <path
                      d="M5 10.5l3 3 7-7"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                ) : isActive ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-neutral-300" />
                )}
              </span>
              <span className={isDone ? "font-medium" : ""}>{s}</span>
            </li>
          );
        })}
      </ul>

      <p className="mt-7 text-xs leading-relaxed text-neutral-500">
        Synthesizing pillar scores, audience intent, brand-fit signal, and partnership readiness
        into a single campaign decision brief.
      </p>
    </div>
  );
}
