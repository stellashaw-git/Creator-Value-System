"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMounted } from "@/lib/use-mounted";
import {
  canRunFreeEvaluation,
  FREE_EVALUATION_LIMIT,
  getTrialUsage,
  isDevEvaluationLimitBypassed,
} from "@/lib/trial";

/** Lightweight banner after free limit — not a hard enterprise paywall. */
export function TrialPaywall({ refreshKey = 0 }: { refreshKey?: number }) {
  const mounted = useMounted();
  const [atLimit, setAtLimit] = useState(false);
  const [founding, setFounding] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    if (isDevEvaluationLimitBypassed()) {
      setAtLimit(false);
      setFounding(false);
      return;
    }
    const usage = getTrialUsage();
    setFounding(usage.early_access_submitted);
    setAtLimit(!canRunFreeEvaluation());
  }, [refreshKey, mounted]);

  if (!mounted) return null;
  if (isDevEvaluationLimitBypassed() || !atLimit || founding) return null;

  return (
    <div className="mt-8 rounded-2xl border border-neutral-200/80 bg-neutral-50/90 px-5 py-5 sm:px-6">
      <p className="text-sm font-medium text-neutral-900">
        You&apos;ve used your {FREE_EVALUATION_LIMIT} free evaluations for today.
      </p>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-neutral-500">
        Join the founding user group for expanded access and early features.
      </p>
      <Link
        href="/waitlist"
        className="mt-4 inline-flex rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
      >
        Join Early Access
      </Link>
    </div>
  );
}
