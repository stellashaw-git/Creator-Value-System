"use client";

import { useState } from "react";
import type { IntelligenceRecord } from "@/lib/intelligence-schema";

function sampleIntelligenceRecord(): IntelligenceRecord {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    creator_evaluation: {
      evaluation_id: `dev-webhook-test-${Date.now()}`,
      creator_name: "Webhook Test Creator",
      platform: "Instagram",
      niche: "Beauty",
      followers: 50_000,
      engagement_rate: 0.045,
      comments_signal: "Dev sample — Make.com webhook test",
      commercial_score: 72,
      campaign_fit: "Strong fit for awareness campaigns",
      recommendation: "Strong Candidate",
      confidence: "Medium",
      timestamp: now,
      brand_category: "Beauty",
      campaign_goal: "Awareness",
    },
    user_workflow: {
      saved: true,
      shortlisted: true,
      contacted: false,
      campaign_launched: false,
    },
    outcome_status: "unknown",
    campaign_context: {
      brand_category: "Beauty",
      campaign_goal: "Awareness",
    },
    updated_at: now,
  };
}

type SyncApiResponse = {
  ok?: boolean;
  synced?: boolean;
  webhookQueued?: boolean;
  webhookConfigured?: boolean;
  channel?: string | null;
  webhookStatus?: number;
  webhookError?: string;
  message?: string;
  error?: string;
};

function makePingRecord(): IntelligenceRecord {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    creator_evaluation: {
      evaluation_id: `make-ping-${Date.now()}`,
      creator_name: "MAKE_CONNECTION_PING",
      platform: "Instagram",
      niche: "Other",
      followers: 0,
      engagement_rate: null,
      comments_signal: "ping",
      commercial_score: 0,
      campaign_fit: "ping",
      recommendation: "Watchlist",
      confidence: "Low",
      timestamp: now,
    },
    user_workflow: {
      saved: false,
      shortlisted: false,
      contacted: false,
      campaign_launched: false,
    },
    outcome_status: "unknown",
    updated_at: now,
  };
}

export function WebhookSyncDevTest() {
  const [loading, setLoading] = useState(false);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [body, setBody] = useState<SyncApiResponse | null>(null);

  const postSync = async (payload: unknown) => {
    setLoading(true);
    setBody(null);
    setHttpStatus(null);
    try {
      const res = await fetch("/api/intelligence/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setHttpStatus(res.status);
      setBody((await res.json()) as SyncApiResponse);
    } catch (err) {
      setBody({
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setLoading(false);
    }
  };

  const runTest = async () => {
    await postSync({
      kind: "record",
      reason: "updated",
      source: "dev-test",
      devTest: true,
      record: sampleIntelligenceRecord(),
    });
  };

  const pingMake = async () => {
    await postSync({
      kind: "record",
      reason: "updated",
      source: "dev-ping",
      record: makePingRecord(),
    });
  };

  const errorText = body?.webhookError ?? body?.error;
  const webhookStatus = body?.webhookStatus;
  const configured = body?.webhookConfigured ?? body?.channel === "webhook";
  const delivered = body?.synced === true && webhookStatus !== undefined;

  return (
    <div className="mt-10 border-t border-dashed border-neutral-200 pt-6">
      <p className="text-[11px] font-medium text-neutral-400">
        Dev only — does not use your evaluation result
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={() => void pingMake()}
          disabled={loading}
          className="text-xs font-semibold text-neutral-600 underline hover:text-neutral-900 disabled:opacity-50"
        >
          {loading ? "Sending…" : "Ping Make (use during Run once)"}
        </button>
        <button
          type="button"
          onClick={() => void runTest()}
          disabled={loading}
          className="text-xs font-semibold text-neutral-500 underline hover:text-neutral-900 disabled:opacity-50"
        >
          Test API only (no Make)
        </button>
      </div>
      {body && (
        <dl className="mt-3 space-y-1 font-mono text-[11px] text-neutral-600">
          <div className="flex gap-2">
            <dt className="text-neutral-400">ok</dt>
            <dd>{String(body.ok ?? false)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-neutral-400">synced</dt>
            <dd>{String(body.synced ?? false)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-neutral-400">delivered</dt>
            <dd>{String(delivered)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-neutral-400">webhook configured</dt>
            <dd>{String(configured)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-neutral-400">api status</dt>
            <dd>{httpStatus ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-neutral-400">make status</dt>
            <dd>{webhookStatus ?? "(see dev server terminal)"}</dd>
          </div>
          {body.message && !errorText ? (
            <div className="flex gap-2">
              <dt className="text-neutral-400">note</dt>
              <dd className="break-all text-neutral-500">{body.message}</dd>
            </div>
          ) : null}
          {errorText ? (
            <div className="flex gap-2">
              <dt className="text-neutral-400">error</dt>
              <dd className="break-all text-rose-700">{errorText}</dd>
            </div>
          ) : null}
        </dl>
      )}
    </div>
  );
}
