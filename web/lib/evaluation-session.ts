/**
 * Client-side draft + last-report persistence for /analyze.
 * Does not touch extraction, scoring, or evaluation logic.
 */

import type { BrandCategoryTag, CampaignGoal } from "./intelligence-types";
import type { RecentPostMetricRow } from "./recent-post-aggregate";
import type { AnalyzeInput, Niche, Platform, Report } from "./types";

export const EVALUATION_DRAFT_KEY = "worthyiq_evaluation_draft";
export const LAST_REPORT_KEY = "worthyiq_last_report";
export const ACTIVE_SESSION_KEY = "worthyiq_active_session";

export type EvaluationStage = "form" | "result";

export interface IntakeRecognizedDraft {
  platform: Platform;
  handle: string;
}

export interface EvaluationDraft {
  version: 1;
  updatedAt: string;
  profileUrl: string;
  intakeRecognized: IntakeRecognizedDraft | null;
  lastStage: EvaluationStage;
  savedId: string | null;
  name: string;
  creatorHandle?: string;
  displayName?: string;
  platform: Platform;
  niche: Niche;
  followers: string;
  avgViews: string;
  averageLikes: string;
  averageComments: string;
  averageReposts: string;
  averageShares: string;
  averageSaves: string;
  followers30DaysAgo: string;
  screenshotTypesUploaded: string[];
  screenshotTypesDetected: string[];
  recentPostMetrics: RecentPostMetricRow[];
  recentPostCount: number;
  detectedPlatform?: string;
  platformConfidence?: "high" | "medium" | "low";
  platformOverride?: string;
  platformFromScreenshots: boolean;
  profileDetailsNote: string | null;
  brandCategory: BrandCategoryTag | "";
  campaignGoal: CampaignGoal | "";
  comments: string;
  manualOpen: boolean;
}

export interface StoredLastReport {
  version: 1;
  updatedAt: string;
  report: Report;
  savedId: string | null;
}

const isBrowser = (): boolean => typeof window !== "undefined";

function readJson<T>(key: string): T | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota / disabled
  }
}

function removeKey(key: string): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function isPlatform(v: unknown): v is Platform {
  return (
    v === "Instagram" ||
    v === "TikTok" ||
    v === "YouTube" ||
    v === "X / Twitter" ||
    v === "Xiaohongshu / RED" ||
    v === "Other"
  );
}

function isNiche(v: unknown): v is Niche {
  return (
    v === "Beauty" ||
    v === "Fashion" ||
    v === "Fitness" ||
    v === "Lifestyle" ||
    v === "Luxury" ||
    v === "Tech" ||
    v === "Food" ||
    v === "Gaming" ||
    v === "Other"
  );
}

function parseDraft(raw: unknown): EvaluationDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<EvaluationDraft>;
  if (d.version !== 1) return null;
  if (typeof d.updatedAt !== "string") return null;
  if (!isPlatform(d.platform) || !isNiche(d.niche)) return null;
  if (typeof d.name !== "string") return null;
  return {
    version: 1,
    updatedAt: d.updatedAt,
    profileUrl: typeof d.profileUrl === "string" ? d.profileUrl : "",
    intakeRecognized:
      d.intakeRecognized &&
      typeof d.intakeRecognized === "object" &&
      isPlatform(d.intakeRecognized.platform) &&
      typeof d.intakeRecognized.handle === "string"
        ? d.intakeRecognized
        : null,
    lastStage: d.lastStage === "result" ? "result" : "form",
    savedId: typeof d.savedId === "string" ? d.savedId : null,
    name: d.name,
    creatorHandle:
      typeof d.creatorHandle === "string" ? d.creatorHandle : undefined,
    displayName: typeof d.displayName === "string" ? d.displayName : undefined,
    platform: d.platform,
    niche: d.niche,
    followers: typeof d.followers === "string" ? d.followers : "",
    avgViews: typeof d.avgViews === "string" ? d.avgViews : "",
    averageLikes: typeof d.averageLikes === "string" ? d.averageLikes : "",
    averageComments:
      typeof d.averageComments === "string" ? d.averageComments : "",
    averageReposts:
      typeof d.averageReposts === "string" ? d.averageReposts : "",
    averageShares:
      typeof d.averageShares === "string" ? d.averageShares : "",
    averageSaves: typeof d.averageSaves === "string" ? d.averageSaves : "",
    followers30DaysAgo:
      typeof d.followers30DaysAgo === "string" ? d.followers30DaysAgo : "",
    screenshotTypesUploaded: Array.isArray(d.screenshotTypesUploaded)
      ? d.screenshotTypesUploaded.map(String)
      : [],
    screenshotTypesDetected: Array.isArray(d.screenshotTypesDetected)
      ? d.screenshotTypesDetected.map(String)
      : [],
    recentPostMetrics: Array.isArray(d.recentPostMetrics)
      ? (d.recentPostMetrics as RecentPostMetricRow[])
      : [],
    recentPostCount:
      typeof d.recentPostCount === "number" ? d.recentPostCount : 0,
    detectedPlatform:
      typeof d.detectedPlatform === "string" ? d.detectedPlatform : undefined,
    platformConfidence:
      d.platformConfidence === "high" ||
      d.platformConfidence === "medium" ||
      d.platformConfidence === "low"
        ? d.platformConfidence
        : undefined,
    platformOverride:
      typeof d.platformOverride === "string" ? d.platformOverride : undefined,
    platformFromScreenshots: Boolean(d.platformFromScreenshots),
    profileDetailsNote:
      typeof d.profileDetailsNote === "string" ? d.profileDetailsNote : null,
    brandCategory:
      typeof d.brandCategory === "string"
        ? (d.brandCategory as BrandCategoryTag | "")
        : "",
    campaignGoal:
      typeof d.campaignGoal === "string"
        ? (d.campaignGoal as CampaignGoal | "")
        : "",
    comments: typeof d.comments === "string" ? d.comments : "",
    manualOpen: Boolean(d.manualOpen),
  };
}

function parseStoredReport(raw: unknown): StoredLastReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<StoredLastReport>;
  if (r.version !== 1 || typeof r.updatedAt !== "string") return null;
  if (!r.report || typeof r.report !== "object") return null;
  const report = r.report as Report;
  if (typeof report.overallScore !== "number" || !report.input) return null;
  return {
    version: 1,
    updatedAt: r.updatedAt,
    report,
    savedId: typeof r.savedId === "string" ? r.savedId : null,
  };
}

export function loadEvaluationDraft(): EvaluationDraft | null {
  return parseDraft(readJson(EVALUATION_DRAFT_KEY));
}

export function saveEvaluationDraft(draft: Omit<EvaluationDraft, "version" | "updatedAt">): void {
  writeJson(EVALUATION_DRAFT_KEY, {
    version: 1,
    updatedAt: new Date().toISOString(),
    ...draft,
  } satisfies EvaluationDraft);
}

export function clearEvaluationDraft(): void {
  removeKey(EVALUATION_DRAFT_KEY);
}

export function loadLastReport(): StoredLastReport | null {
  return parseStoredReport(readJson(LAST_REPORT_KEY));
}

export function saveLastReport(report: Report, savedId: string | null): void {
  writeJson(LAST_REPORT_KEY, {
    version: 1,
    updatedAt: new Date().toISOString(),
    report,
    savedId,
  } satisfies StoredLastReport);
}

export function clearLastReport(): void {
  removeKey(LAST_REPORT_KEY);
}

export function markActiveSession(draftUpdatedAt: string): void {
  if (!isBrowser()) return;
  try {
    sessionStorage.setItem(ACTIVE_SESSION_KEY, draftUpdatedAt);
  } catch {
    // ignore
  }
}

export function clearActiveSession(): void {
  if (!isBrowser()) return;
  try {
    sessionStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function isActiveSession(draftUpdatedAt: string): boolean {
  if (!isBrowser()) return false;
  try {
    return sessionStorage.getItem(ACTIVE_SESSION_KEY) === draftUpdatedAt;
  } catch {
    return false;
  }
}

export function draftHasContent(draft: EvaluationDraft): boolean {
  return Boolean(
    draft.name.trim() ||
      draft.profileUrl.trim() ||
      draft.followers.trim() ||
      draft.avgViews.trim() ||
      draft.comments.trim() ||
      draft.screenshotTypesUploaded.length > 0 ||
      draft.intakeRecognized
  );
}

export function clearEvaluationSession(): void {
  clearEvaluationDraft();
  clearLastReport();
  clearActiveSession();
}

/** Build AnalyzeInput-shaped snapshot from draft strings (for display only). */
export function draftToAnalyzeInputPreview(draft: EvaluationDraft): Partial<AnalyzeInput> {
  return {
    name: draft.name,
    platform: draft.platform,
    niche: draft.niche,
    brandCategory: draft.brandCategory || undefined,
    campaignGoal: draft.campaignGoal || undefined,
  };
}
