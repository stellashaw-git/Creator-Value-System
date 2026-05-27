/**
 * Supabase-backed creator memory — optional layer on top of localStorage.
 * Never replaces local saves; syncs when the user is signed in.
 */

import { userWorkflowFromRow, type SavedEvaluation } from "./dataset";
import { CLOUD_MEMORY_ENABLED, isSupabaseConfigured } from "./supabase/env";
import { tryCreateClient } from "./supabase/client";

function rowToPayload(userId: string, row: SavedEvaluation) {
  const r = row.report;
  const input = r.input;
  const wf = userWorkflowFromRow(row);

  return {
    id: row.id,
    user_id: userId,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    creator_handle: input.creatorHandle ?? input.name,
    display_name: input.displayName ?? null,
    platform: input.platform,
    niche: input.niche,
    decision: r.decision,
    commercial_score: r.overallScore,
    purchase_intent_score: r.pillarScores.intent,
    engagement_score: r.pillarScores.engagement,
    growth_score: r.pillarScores.growth,
    confidence_level: r.decisionConfidence,
    evidence_summary: r.signalInsights?.evidenceConfidence ?? null,
    followers: input.followers,
    avg_likes: input.averageLikes ?? null,
    avg_comments: input.averageComments ?? null,
    avg_reposts: input.averageReposts ?? null,
    avg_shares: input.averageShares ?? null,
    avg_saves: input.averageSaves ?? null,
    engagement_rate: input.engagementRate ?? null,
    report_json: row,
    workflow_status: row.outcome.status,
    campaign_outcome: row.outcome.performance ?? null,
    saved: wf.saved,
    shortlisted: wf.shortlisted,
    contacted: wf.contacted,
    campaign_launched: wf.campaign_launched,
    screenshot_count: input.recentPostCount ?? null,
  };
}

function parseSavedEvaluation(raw: unknown): SavedEvaluation | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as SavedEvaluation;
  if (!row.id || !row.report) return null;
  return row;
}

/** Fire-and-forget cloud sync after local save/update. */
export function queueCloudEvaluationSync(row: SavedEvaluation): void {
  if (!CLOUD_MEMORY_ENABLED || typeof window === "undefined") return;
  void syncEvaluationToCloud(row).catch((err) => {
    console.warn("[cloud-evaluations] sync failed:", err);
  });
}

export async function syncEvaluationToCloud(row: SavedEvaluation): Promise<boolean> {
  if (!CLOUD_MEMORY_ENABLED || !isSupabaseConfigured()) return false;
  const supabase = tryCreateClient();
  if (!supabase) return false;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from("evaluations")
    .upsert(rowToPayload(user.id, row), { onConflict: "id" });

  if (error) {
    console.warn("[cloud-evaluations]", error.message);
    return false;
  }
  return true;
}

export async function listCloudEvaluations(): Promise<SavedEvaluation[]> {
  if (!CLOUD_MEMORY_ENABLED || !isSupabaseConfigured()) return [];
  const supabase = tryCreateClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("evaluations")
    .select("report_json, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.warn("[cloud-evaluations] list failed:", error?.message);
    return [];
  }

  return data
    .map((d) => parseSavedEvaluation(d.report_json))
    .filter((r): r is SavedEvaluation => r !== null);
}

export async function getCloudEvaluation(id: string): Promise<SavedEvaluation | null> {
  if (!CLOUD_MEMORY_ENABLED || !isSupabaseConfigured()) return null;
  const supabase = tryCreateClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("evaluations")
    .select("report_json")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return parseSavedEvaluation(data.report_json);
}

export async function getCurrentUserEmail(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = tryCreateClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

export async function signOutCloud(): Promise<void> {
  const supabase = tryCreateClient();
  if (!supabase) return;
  await supabase.auth.signOut();
}
