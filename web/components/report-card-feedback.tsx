"use client";

import { useEffect, useState } from "react";
import { getEvaluation, type SavedEvaluation } from "@/lib/dataset";
import { WhatHappenedNext } from "./what-happened-next";

export function ReportCardFeedback({ savedId }: { savedId: string }) {
  const [row, setRow] = useState<SavedEvaluation | null>(null);

  useEffect(() => {
    setRow(getEvaluation(savedId) ?? null);
  }, [savedId]);

  if (!row) return null;

  return (
    <WhatHappenedNext
      evaluationId={savedId}
      initialStatus={row.outcome.status}
      initialFollowed={row.followedRecommendation}
      initialPerformance={row.outcome.performance}
    />
  );
}
