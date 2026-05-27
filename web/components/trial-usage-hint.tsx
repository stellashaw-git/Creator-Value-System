"use client";

import { useEffect, useState } from "react";
import { getTrialUsage } from "@/lib/trial";

/** Subtle free-evaluation counter — not a pricing block. */
export function TrialUsageHint({ refreshKey = 0 }: { refreshKey?: number }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const { used, limit, remaining, early_access_submitted } = getTrialUsage();
    if (early_access_submitted) {
      setText("Founding access — expanded evaluations during early beta.");
      return;
    }
    if (used <= 0) {
      setText(null);
      return;
    }
    setText(`${used} of ${limit} free evaluations used · ${remaining} remaining`);
  }, [refreshKey]);

  if (!text) return null;

  return (
    <p className="mt-3 text-center text-[11px] font-medium tracking-wide text-neutral-400">
      {text}
    </p>
  );
}
