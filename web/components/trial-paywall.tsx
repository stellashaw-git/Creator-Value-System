"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { canRunFreeEvaluation } from "@/lib/trial";

/** Shown only after the free evaluation limit — no counter on first load. */
export function TrialPaywall({ refreshKey = 0 }: { refreshKey?: number }) {
  const [atLimit, setAtLimit] = useState(false);

  useEffect(() => {
    setAtLimit(!canRunFreeEvaluation());
  }, [refreshKey]);

  if (!atLimit) return null;

  return (
    <div className="rounded-2xl border border-neutral-200/80 bg-gradient-to-b from-neutral-900 to-neutral-800 p-6 text-white shadow-lg sm:p-8">
      <p className="text-sm font-medium text-neutral-300">
        You&apos;ve reached today&apos;s free creator evaluations.
      </p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-neutral-400">
        Join early access to continue evaluating creators and unlock creator comparison.
      </p>
      <Link
        href="/waitlist"
        className="mt-5 inline-flex rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
      >
        Join Early Access
      </Link>
    </div>
  );
}
