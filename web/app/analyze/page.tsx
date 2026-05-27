"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ReportCard } from "@/components/report-card";
import { AgentThinking } from "@/components/agent-thinking";
import { PasteLinkPanel, isUrlIntakeEnabled } from "@/components/intake/paste-link-panel";
import { ScreenshotUpload } from "@/components/screenshot-upload";
import { intakeProfileToAnalyzeHints, mockIntakeProfile } from "@/lib/intake/to-analyze-payload";
import { TrialPaywall } from "@/components/trial-paywall";
import { TrialUsageHint } from "@/components/trial-usage-hint";
import { EarlyAccessModal } from "@/components/early-access-modal";
import { WebhookSyncDevTest } from "@/components/webhook-sync-dev-test";
import { saveEvaluation } from "@/lib/dataset";
import { syncIntelligenceRecord } from "@/lib/intelligence-sync";
import { useMounted } from "@/lib/use-mounted";
import { canRunFreeEvaluation, incrementTrialUsage } from "@/lib/trial";
import type {
  ExtractedSignals,
  ExtractionMeta,
  ExtractionMode,
} from "@/lib/extract";
import { labelDisplayName } from "@/lib/extract";
import type { RecentPostMetricRow } from "@/lib/recent-post-aggregate";
import {
  computeEngagementMetrics,
  engagementDisplayFromMetrics,
} from "@/lib/engagement-metrics";
import { parseNonNegativeNumber } from "@/lib/parse-numeric-input";
import {
  logExtractionFormMapping,
  mapExtractionToFormPatch,
} from "@/lib/extraction-form-map";
import {
  BRAND_CATEGORY_TAGS,
  CAMPAIGN_GOALS,
  type BrandCategoryTag,
  type CampaignGoal,
} from "@/lib/intelligence-types";
import type { AnalyzeInput, Niche, Platform, Report } from "@/lib/types";

type NumField =
  | "followers"
  | "avgViews"
  | "averageLikes"
  | "averageComments"
  | "averageReposts"
  | "averageShares"
  | "averageSaves"
  | "followers30DaysAgo";

const PLATFORMS: Platform[] = [
  "Instagram", "TikTok", "YouTube", "X / Twitter", "Xiaohongshu / RED", "Other",
];
const NICHES: Niche[] = [
  "Beauty", "Fashion", "Fitness", "Lifestyle", "Luxury",
  "Tech", "Food", "Gaming", "Other",
];

const DEMO: AnalyzeInput = {
  name: "Maya Ortega",
  platform: "Instagram",
  niche: "Fitness",
  followers: 82_400,
  avgViews: 24_500,
  averageLikes: 3000,
  averageComments: 790,
  followers30DaysAgo: 74234,
  brandCategory: "Fitness",
  campaignGoal: "Conversion",
  comments: [
    "where did you get this?", "link pls 🙏", "so pretty 😍",
    "omg how", "price?", "code please", "amazing", "🔥🔥🔥",
    "is this on amazon?", "which one do you recommend?",
    "love this vibe", "queen 👑", "what brand?", "how much?",
    "yes!", "stunning", "size?", "restock when",
  ],
};

type Stage = "form" | "loading" | "result";

function engagementDisplayPct(
  followers: string,
  avgLikes: string,
  avgComments: string,
  avgReposts: string,
  avgShares: string,
  avgSaves: string,
  avgViews: string
): string {
  const f = parseNonNegativeNumber(followers);
  if (!f.ok || f.value <= 0) return "Not enough data";
  const num = (s: string) => {
    const r = parseNonNegativeNumber(s);
    return r.ok ? r.value : undefined;
  };
  return engagementDisplayFromMetrics(
    computeEngagementMetrics({
      followers: f.value,
      averageLikes: num(avgLikes),
      averageComments: num(avgComments),
      averageReposts: num(avgReposts),
      averageShares: num(avgShares),
      averageSaves: num(avgSaves),
      averageViews: num(avgViews),
    })
  );
}

function growthDisplayPct(followers: string, followers30: string): string {
  if (!followers.trim() || !followers30.trim()) return "Unknown";
  const f = parseNonNegativeNumber(followers);
  const f0 = parseNonNegativeNumber(followers30);
  if (!f.ok || f.value <= 0 || !f0.ok) return "Unknown";
  if (f0.value <= 0) return "Unknown";
  return `${(((f.value - f0.value) / f0.value) * 100).toFixed(2)}%`;
}

export default function AnalyzePage() {
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [usageRefresh, setUsageRefresh] = useState(0);
  const [atLimit, setAtLimit] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const mounted = useMounted();

  const [name, setName] = useState("");
  const [creatorHandle, setCreatorHandle] = useState<string | undefined>();
  const [displayName, setDisplayName] = useState<string | undefined>();
  const [platform, setPlatform] = useState<Platform>("Instagram");
  const [niche, setNiche] = useState<Niche>("Beauty");
  const [followers, setFollowers] = useState("");
  const [avgViews, setAvgViews] = useState("");
  const [averageLikes, setAverageLikes] = useState("");
  const [averageComments, setAverageComments] = useState("");
  const [averageReposts, setAverageReposts] = useState("");
  const [averageShares, setAverageShares] = useState("");
  const [averageSaves, setAverageSaves] = useState("");
  const [followers30DaysAgo, setFollowers30DaysAgo] = useState("");
  const [screenshotTypesUploaded, setScreenshotTypesUploaded] = useState<string[]>([]);
  const [screenshotTypesDetected, setScreenshotTypesDetected] = useState<string[]>([]);
  const [recentPostMetrics, setRecentPostMetrics] = useState<RecentPostMetricRow[]>([]);
  const [recentPostCount, setRecentPostCount] = useState(0);
  const [detectedPlatform, setDetectedPlatform] = useState<string | undefined>();
  const [platformConfidence, setPlatformConfidence] = useState<
    "high" | "medium" | "low" | undefined
  >();
  const [platformOverride, setPlatformOverride] = useState<string | undefined>();
  const [platformFromScreenshots, setPlatformFromScreenshots] = useState(false);
  const [profileDetailsNote, setProfileDetailsNote] = useState<string | null>(null);
  const [brandCategory, setBrandCategory] = useState<BrandCategoryTag | "">("");
  const [campaignGoal, setCampaignGoal] = useState<CampaignGoal | "">("");
  const [comments, setComments] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<NumField, string>>>({});
  const clearFieldError = (key: NumField) => {
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleNumericBlur = (key: NumField, raw: string) => {
    const r = parseNonNegativeNumber(raw);
    const set =
      key === "followers"
        ? setFollowers
        : key === "avgViews"
          ? setAvgViews
          : key === "averageLikes"
            ? setAverageLikes
            : key === "averageComments"
              ? setAverageComments
              : key === "averageReposts"
                ? setAverageReposts
                : key === "averageShares"
                  ? setAverageShares
                  : key === "averageSaves"
                    ? setAverageSaves
                    : setFollowers30DaysAgo;

    if (r.ok) {
      set(String(r.value));
      clearFieldError(key);
      return;
    }
    if (r.empty) {
      clearFieldError(key);
      return;
    }
    setFieldErrors((prev) => ({ ...prev, [key]: "Enter a valid value" }));
  };

  useEffect(() => {
    if (!mounted) return;
    setAtLimit(!canRunFreeEvaluation());
  }, [usageRefresh, mounted]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") {
      setName(DEMO.name);
      setPlatform(DEMO.platform);
      setNiche(DEMO.niche);
      setFollowers(String(DEMO.followers));
      setAvgViews(String(DEMO.avgViews));
      if (DEMO.averageLikes !== undefined) setAverageLikes(String(DEMO.averageLikes));
      if (DEMO.averageComments !== undefined) setAverageComments(String(DEMO.averageComments));
      if (DEMO.followers30DaysAgo !== undefined) {
        setFollowers30DaysAgo(String(DEMO.followers30DaysAgo));
      }
      setBrandCategory((DEMO.brandCategory as BrandCategoryTag) || "");
      setCampaignGoal((DEMO.campaignGoal as CampaignGoal) || "");
      setComments(DEMO.comments.join("\n"));
      setFieldErrors({});
      setManualOpen(true);
    }
  }, []);

  /**
   * Pre-fill the form from a screenshot extraction. We do NOT auto-submit —
   * the user always reviews and edits before evaluation runs.
   */
  const onExtracted = (
    data: ExtractedSignals,
    _mode: ExtractionMode,
    meta: ExtractionMeta
  ) => {
    const avgCommentsBefore = averageComments;
    const resolved =
      meta.platformOverride ??
      meta.detectedPlatform ??
      (data.platform && (PLATFORMS as string[]).includes(data.platform)
        ? (data.platform as Platform)
        : null);

    const finalTypes = meta.finalTypes ?? meta.labels;

    const patch = mapExtractionToFormPatch(data, {
      platforms: PLATFORMS,
      niches: NICHES,
      resolvedPlatform: resolved,
      finalTypes,
      current: { name, followers, averageComments },
    });

    logExtractionFormMapping(data, patch, {
      avgCommentsBefore,
      finalTypes,
      classifications: meta.typeDetections?.map((det, i) => ({
        filename: `screenshot_${i + 1}`,
        detectedType: det.auto_detected_type,
        finalType: finalTypes[i] ?? det.auto_detected_type,
        typeUsedForExtraction: finalTypes[i] ?? det.auto_detected_type,
      })),
    });

    const applyIfEmpty = (value: string | undefined, current: string, set: (v: string) => void) => {
      if (value !== undefined && value !== "" && !current.trim()) set(value);
    };

    const applyExtracted = (value: string | undefined, set: (v: string) => void) => {
      if (value !== undefined && value !== "") set(value);
    };

    applyIfEmpty(patch.name, name, setName);
    if (patch.creatorHandle && !creatorHandle) setCreatorHandle(patch.creatorHandle);
    applyIfEmpty(patch.displayName ?? "", displayName ?? "", (v) => setDisplayName(v));
    if (patch.platform) {
      setPlatform(patch.platform);
      setPlatformFromScreenshots(true);
    }
    setDetectedPlatform(
      meta.detectedPlatform ?? data.detected_platform ?? undefined
    );
    setPlatformConfidence(meta.platformConfidence ?? data.platform_confidence);
    setPlatformOverride(meta.platformOverride ?? undefined);
    setScreenshotTypesDetected(meta.screenshotTypesDetected);
    setScreenshotTypesUploaded(
      (meta.finalTypes ?? meta.labels).map((id) => labelDisplayName(id))
    );
    if (patch.niche) setNiche(patch.niche);

    applyIfEmpty(patch.followers, followers, setFollowers);
    setProfileDetailsNote(
      patch.profileDetailsIncomplete
        ? "Profile details not fully visible — add manually for higher confidence."
        : null
    );
    applyExtracted(patch.avgViews, setAvgViews);
    applyExtracted(patch.averageLikes, setAverageLikes);
    applyExtracted(patch.averageComments, setAverageComments);
    applyExtracted(patch.averageReposts, setAverageReposts);
    applyExtracted(patch.averageShares, setAverageShares);
    applyExtracted(patch.averageSaves, setAverageSaves);
    applyIfEmpty(patch.followers30DaysAgo, followers30DaysAgo, setFollowers30DaysAgo);

    setRecentPostMetrics(patch.recentPostMetrics);
    setRecentPostCount(patch.recentPostCount);

    if (patch.comments) setComments(patch.comments);

    setManualOpen(true);
    requestAnimationFrame(() => {
      document
        .getElementById("review-anchor")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const runAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setError(null);
    if (!canRunFreeEvaluation()) {
      return setError("You've used your free evaluations. Join early access to continue.");
    }
    if (!name.trim()) return setError("Creator name is required.");

    const fr = parseNonNegativeNumber(followers);
    if (!fr.ok) {
      setFieldErrors({ followers: "Enter a valid value" });
      return setError("Followers: Enter a valid value");
    }
    if (fr.value <= 0) {
      setFieldErrors({ followers: "Followers must be greater than 0." });
      return setError("Followers must be greater than 0.");
    }

    let avgViewsNum = 0;
    if (avgViews.trim() !== "") {
      const vr = parseNonNegativeNumber(avgViews);
      if (!vr.ok) {
        setFieldErrors({ avgViews: "Enter a valid value" });
        return setError("Average views: Enter a valid value");
      }
      avgViewsNum = vr.value;
    }

    let averageLikesNum: number | undefined;
    if (averageLikes.trim() !== "") {
      const lr = parseNonNegativeNumber(averageLikes);
      if (!lr.ok) {
        setFieldErrors({ averageLikes: "Enter a valid value" });
        return setError("Avg likes: Enter a valid value");
      }
      averageLikesNum = lr.value;
    }

    let averageCommentsNum: number | undefined;
    if (averageComments.trim() !== "") {
      const cr = parseNonNegativeNumber(averageComments);
      if (!cr.ok) {
        setFieldErrors({ averageComments: "Enter a valid value" });
        return setError("Avg comments: Enter a valid value");
      }
      averageCommentsNum = cr.value;
    }

    let averageRepostsNum: number | undefined;
    if (averageReposts.trim() !== "") {
      const rr = parseNonNegativeNumber(averageReposts);
      if (!rr.ok) {
        setFieldErrors({ averageReposts: "Enter a valid value" });
        return setError("Avg reposts: Enter a valid value");
      }
      averageRepostsNum = rr.value;
    }

    let averageSharesNum: number | undefined;
    if (averageShares.trim() !== "") {
      const sr = parseNonNegativeNumber(averageShares);
      if (!sr.ok) {
        setFieldErrors({ averageShares: "Enter a valid value" });
        return setError("Avg shares: Enter a valid value");
      }
      averageSharesNum = sr.value;
    }

    let averageSavesNum: number | undefined;
    if (averageSaves.trim() !== "") {
      const sv = parseNonNegativeNumber(averageSaves);
      if (!sv.ok) {
        setFieldErrors({ averageSaves: "Enter a valid value" });
        return setError("Avg saves: Enter a valid value");
      }
      averageSavesNum = sv.value;
    }

    let followers30Num: number | undefined;
    if (followers30DaysAgo.trim() !== "") {
      const pr = parseNonNegativeNumber(followers30DaysAgo);
      if (!pr.ok) {
        setFieldErrors({ followers30DaysAgo: "Enter a valid value" });
        return setError("Followers ~30 days ago: Enter a valid value (must be greater than 0).");
      }
      if (pr.value <= 0) {
        setFieldErrors({ followers30DaysAgo: "Enter a valid value" });
        return setError("Followers ~30 days ago: Enter a valid value (must be greater than 0).");
      }
      followers30Num = pr.value;
    }

    setStage("loading");

    const body: AnalyzeInput = {
      name: name.trim(),
      creatorHandle,
      displayName,
      platform,
      niche,
      followers: fr.value,
      avgViews: avgViewsNum,
      averageLikes: averageLikesNum,
      averageComments: averageCommentsNum,
      averageReposts: averageRepostsNum,
      averageShares: averageSharesNum,
      averageSaves: averageSavesNum,
      followers30DaysAgo: followers30Num,
      screenshotTypesUploaded:
        screenshotTypesUploaded.length > 0 ? screenshotTypesUploaded : undefined,
      screenshotTypesDetected:
        screenshotTypesDetected.length > 0 ? screenshotTypesDetected : undefined,
      recentPostMetrics: recentPostMetrics.length > 0 ? recentPostMetrics : undefined,
      recentPostCount: recentPostCount > 0 ? recentPostCount : undefined,
      detectedPlatform,
      platformConfidence,
      platformOverride,
      brandCategory: brandCategory || undefined,
      campaignGoal: campaignGoal || undefined,
      comments: comments
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    };

    // Kick off the request and the AI thinking animation in parallel.
    const minLoadingMs = 5400; // long enough to play all 6 steps
    const startedAt = Date.now();
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Analysis failed.");

      const elapsed = Date.now() - startedAt;
      if (elapsed < minLoadingMs) {
        await new Promise((r) => setTimeout(r, minLoadingMs - elapsed));
      }
      const saved = saveEvaluation(json.report);
      setReport(json.report);
      // Non-blocking — API returns instantly; Make runs in background.
      void syncIntelligenceRecord(saved, json.report, "created");
      incrementTrialUsage();
      setUsageRefresh((k) => k + 1);
      setSavedId(saved.id);
      setStage("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("form");
    }
  };

  const reset = () => {
    setStage("form");
    setReport(null);
    setSavedId(null);
    setFieldErrors({});
  };

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-4">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-base font-extrabold tracking-tight">WorthyIQ</span>
              <span className="hidden text-xs uppercase tracking-[0.16em] text-neutral-500 sm:inline">
                Creator Intelligence Platform
              </span>
            </Link>
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
          {stage === "form" && (
            <Link href="/analyze?demo=1" className="text-xs font-semibold text-neutral-500 hover:text-neutral-900">
              Try sample creator →
            </Link>
          )}
        </div>
      </header>

      <div
        className={`mx-auto px-6 py-12 sm:py-14 ${
          stage === "result" ? "max-w-4xl" : "max-w-3xl"
        }`}
      >
        {stage === "form" && (
            <FormView
            {...{
              name, setName, creatorHandle, setCreatorHandle, platform, setPlatform, niche, setNiche,
              followers, setFollowers, avgViews, setAvgViews,
              averageLikes, setAverageLikes,
              averageComments, setAverageComments,
              averageReposts, setAverageReposts,
              averageShares, setAverageShares,
              averageSaves, setAverageSaves,
              followers30DaysAgo, setFollowers30DaysAgo,
              brandCategory, setBrandCategory,
              campaignGoal, setCampaignGoal,
              comments, setComments,
              fieldErrors,
              onNumericBlur: handleNumericBlur,
              onNumericFocus: clearFieldError,
              error,
              onSubmit: runAnalysis,
              onExtracted,
              onPlatformCorrected: (plat) => {
                setPlatform(plat);
                setPlatformOverride(plat);
                setPlatformFromScreenshots(true);
              },
              platformFromScreenshots,
              profileDetailsNote,
              atLimit,
              usageRefresh,
              manualOpen,
              onManualOpenChange: setManualOpen,
            }}
          />
        )}
        {stage === "loading" && (
          <div className="flex min-h-[60vh] items-center justify-center">
            <AgentThinking active />
          </div>
        )}
        {stage === "result" && report && (
          <ReportCard report={report} onRestart={reset} savedId={savedId ?? undefined} />
        )}
        {process.env.NODE_ENV === "development" && <WebhookSyncDevTest />}
      </div>
      <EarlyAccessModal
        refreshKey={usageRefresh}
        onSubmitted={() => setUsageRefresh((k) => k + 1)}
      />
    </main>
  );
}

interface FormProps {
  name: string;
  setName: (v: string) => void;
  creatorHandle?: string;
  setCreatorHandle: (v: string | undefined) => void;
  platform: Platform;
  setPlatform: (v: Platform) => void;
  niche: Niche;
  setNiche: (v: Niche) => void;
  followers: string;
  setFollowers: (v: string) => void;
  avgViews: string;
  setAvgViews: (v: string) => void;
  averageLikes: string;
  setAverageLikes: (v: string) => void;
  averageComments: string;
  setAverageComments: (v: string) => void;
  averageReposts: string;
  setAverageReposts: (v: string) => void;
  averageShares: string;
  setAverageShares: (v: string) => void;
  averageSaves: string;
  setAverageSaves: (v: string) => void;
  followers30DaysAgo: string;
  setFollowers30DaysAgo: (v: string) => void;
  brandCategory: BrandCategoryTag | "";
  setBrandCategory: (v: BrandCategoryTag | "") => void;
  campaignGoal: CampaignGoal | "";
  setCampaignGoal: (v: CampaignGoal | "") => void;
  comments: string;
  setComments: (v: string) => void;
  fieldErrors: Partial<Record<NumField, string>>;
  onNumericBlur: (key: NumField, raw: string) => void;
  onNumericFocus: (key: NumField) => void;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onExtracted: (
    data: ExtractedSignals,
    mode: ExtractionMode,
    meta: ExtractionMeta
  ) => void;
  onPlatformCorrected: (platform: Platform) => void;
  platformFromScreenshots: boolean;
  profileDetailsNote: string | null;
  atLimit: boolean;
  usageRefresh: number;
  manualOpen: boolean;
  onManualOpenChange: (open: boolean) => void;
}

function FormView(p: FormProps) {
  const formReady = useMounted();

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
          Evaluate a creator
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Upload → extract → decision
        </p>
        <TrialUsageHint refreshKey={p.usageRefresh} />
      </div>

      {isUrlIntakeEnabled() && (
        <PasteLinkPanel
          onRecognized={({ platform, handle }) => {
            const hints = intakeProfileToAnalyzeHints(
              mockIntakeProfile(
                platform,
                handle,
                `https://intake.local/${platform}/${handle}`
              )
            );
            if (hints.platform) p.setPlatform(hints.platform);
            if (hints.name) p.setName(hints.name);
            if (hints.creatorHandle) p.setCreatorHandle(hints.creatorHandle);
          }}
        />
      )}

      <div id="screenshot-upload" className="scroll-mt-6">
        <ScreenshotUpload
          onExtracted={p.onExtracted}
          onPlatformCorrected={p.onPlatformCorrected}
        />
      </div>

      <TrialPaywall refreshKey={p.usageRefresh} />

      {!formReady ? (
        <div className="mt-12 rounded-xl border border-neutral-100 bg-neutral-50/80 px-4 py-8 text-center text-sm text-neutral-500">
          Preparing form…
        </div>
      ) : (
      <form
        onSubmit={p.onSubmit}
        className="mt-12 space-y-8"
        suppressHydrationWarning
      >
        <details
          id="review-anchor"
          className="group scroll-mt-24"
          open={p.manualOpen}
          suppressHydrationWarning
          onToggle={(e) => p.onManualOpenChange((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer list-none text-sm font-medium text-neutral-600 hover:text-neutral-900">
            <span className="inline-flex items-center gap-2">
              Or add metrics manually
              <span className="text-neutral-400 transition group-open:rotate-180">▾</span>
            </span>
          </summary>

          <p className="mb-4 text-xs text-neutral-500">
            More complete data → more accurate evaluation. Partial data still runs — confidence
            adjusts automatically.
          </p>
          <div className="space-y-5">
        <div className="card-quiet !p-5">
          <p className="text-xs font-medium text-neutral-500">Profile</p>
          {p.profileDetailsNote && (
            <p className="mt-2 text-[11px] text-amber-800/90">{p.profileDetailsNote}</p>
          )}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Creator name *</label>
              <input
                className="input"
                placeholder="e.g. Maya Ortega"
                value={p.name}
                onChange={(e) => p.setName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Platform</label>
              <select
                className="input"
                value={p.platform}
                onChange={(e) => p.setPlatform(e.target.value as Platform)}
              >
                {PLATFORMS.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
              {p.platformFromScreenshots && (
                <p className="mt-1 text-[11px] text-neutral-500">
                  Auto-detected from screenshots — change only if incorrect.
                </p>
              )}
            </div>
            <div>
              <label className="label">Niche</label>
              <select
                className="input"
                value={p.niche}
                onChange={(e) => p.setNiche(e.target.value as Niche)}
              >
                {NICHES.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 border-t border-neutral-100 pt-4">
            <p className="text-[11px] font-medium text-neutral-500">
              Campaign context <span className="font-normal">(optional)</span>
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label text-xs">Brand category</label>
                <select
                  className="input text-sm"
                  value={p.brandCategory}
                  onChange={(e) =>
                    p.setBrandCategory(e.target.value as BrandCategoryTag | "")
                  }
                >
                  <option value="">—</option>
                  {BRAND_CATEGORY_TAGS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-xs">Campaign goal</label>
                <select
                  className="input text-sm"
                  value={p.campaignGoal}
                  onChange={(e) =>
                    p.setCampaignGoal(e.target.value as CampaignGoal | "")
                  }
                >
                  <option value="">—</option>
                  {CAMPAIGN_GOALS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="card-quiet !p-5">
          <p className="text-xs font-medium text-neutral-500">Metrics</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Followers *</label>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={p.followers}
                onChange={(e) => p.setFollowers(e.target.value)}
                onBlur={() => p.onNumericBlur("followers", p.followers)}
                onFocus={() => p.onNumericFocus("followers")}
              />
              {p.fieldErrors.followers && (
                <p className="mt-1 text-xs text-rose-600">{p.fieldErrors.followers}</p>
              )}
            </div>
            <div>
              <label className="label">Average views</label>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={p.avgViews}
                onChange={(e) => p.setAvgViews(e.target.value)}
                onBlur={() => p.onNumericBlur("avgViews", p.avgViews)}
                onFocus={() => p.onNumericFocus("avgViews")}
              />
              {p.fieldErrors.avgViews && (
                <p className="mt-1 text-xs text-rose-600">{p.fieldErrors.avgViews}</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <div className="flex flex-wrap gap-3">
                <div className="min-w-[7rem] flex-1">
                  <label className="label text-xs">Avg likes per post</label>
                  <input
                    className="input text-sm"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="e.g. 3000"
                    value={p.averageLikes}
                    onChange={(e) => p.setAverageLikes(e.target.value)}
                    onBlur={() => p.onNumericBlur("averageLikes", p.averageLikes)}
                    onFocus={() => p.onNumericFocus("averageLikes")}
                  />
                  {p.fieldErrors.averageLikes && (
                    <p className="mt-1 text-xs text-rose-600">{p.fieldErrors.averageLikes}</p>
                  )}
                </div>
                <div className="min-w-[7rem] flex-1">
                  <label className="label text-xs">Avg comments per post</label>
                  <input
                    className="input text-sm"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="e.g. 790"
                    value={p.averageComments}
                    onChange={(e) => p.setAverageComments(e.target.value)}
                    onBlur={() => p.onNumericBlur("averageComments", p.averageComments)}
                    onFocus={() => p.onNumericFocus("averageComments")}
                  />
                  {p.fieldErrors.averageComments && (
                    <p className="mt-1 text-xs text-rose-600">{p.fieldErrors.averageComments}</p>
                  )}
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
                Based on uploaded visible post metrics.
              </p>
            </div>
            <div className="sm:col-span-2">
              <div className="flex flex-wrap gap-3">
                <div className="min-w-[7rem] flex-1">
                  <label className="label text-xs">Avg reposts per post</label>
                  <input
                    className="input text-sm"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="optional"
                    value={p.averageReposts}
                    onChange={(e) => p.setAverageReposts(e.target.value)}
                    onBlur={() => p.onNumericBlur("averageReposts", p.averageReposts)}
                    onFocus={() => p.onNumericFocus("averageReposts")}
                  />
                  {p.fieldErrors.averageReposts && (
                    <p className="mt-1 text-xs text-rose-600">{p.fieldErrors.averageReposts}</p>
                  )}
                </div>
                <div className="min-w-[7rem] flex-1">
                  <label className="label text-xs">Avg shares per post</label>
                  <input
                    className="input text-sm"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="optional"
                    value={p.averageShares}
                    onChange={(e) => p.setAverageShares(e.target.value)}
                    onBlur={() => p.onNumericBlur("averageShares", p.averageShares)}
                    onFocus={() => p.onNumericFocus("averageShares")}
                  />
                  {p.fieldErrors.averageShares && (
                    <p className="mt-1 text-xs text-rose-600">{p.fieldErrors.averageShares}</p>
                  )}
                </div>
                <div className="min-w-[7rem] flex-1">
                  <label className="label text-xs">Avg saves per post</label>
                  <input
                    className="input text-sm"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="optional"
                    value={p.averageSaves}
                    onChange={(e) => p.setAverageSaves(e.target.value)}
                    onBlur={() => p.onNumericBlur("averageSaves", p.averageSaves)}
                    onFocus={() => p.onNumericFocus("averageSaves")}
                  />
                  {p.fieldErrors.averageSaves && (
                    <p className="mt-1 text-xs text-rose-600">{p.fieldErrors.averageSaves}</p>
                  )}
                </div>
              </div>
            </div>
            <div>
              <label className="label">Engagement rate (%)</label>
              <input
                className="input cursor-not-allowed bg-neutral-50 text-neutral-800"
                readOnly
                value={engagementDisplayPct(
                  p.followers,
                  p.averageLikes,
                  p.averageComments,
                  p.averageReposts,
                  p.averageShares,
                  p.averageSaves,
                  p.avgViews
                )}
              />
            </div>
            <div>
              <label className="label">30-day growth (%)</label>
              <input
                className="input cursor-not-allowed bg-neutral-50 text-neutral-800"
                readOnly
                value={growthDisplayPct(p.followers, p.followers30DaysAgo)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Followers ~30 days ago (optional)</label>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. prior month follower count"
                value={p.followers30DaysAgo}
                onChange={(e) => p.setFollowers30DaysAgo(e.target.value)}
                onBlur={() => p.onNumericBlur("followers30DaysAgo", p.followers30DaysAgo)}
                onFocus={() => p.onNumericFocus("followers30DaysAgo")}
              />
              {p.fieldErrors.followers30DaysAgo && (
                <p className="mt-1 text-xs text-rose-600">{p.fieldErrors.followers30DaysAgo}</p>
              )}
            </div>
          </div>
        </div>

        <div className="card-quiet !p-5">
          <p className="text-xs font-medium text-neutral-500">Comments</p>
          <textarea
            className="input mt-3 min-h-[140px] font-mono text-xs"
            placeholder={"where did you get this?\nlink pls 🙏\nprice?\nso pretty 😍"}
            value={p.comments}
            onChange={(e) => p.setComments(e.target.value)}
          />
        </div>
          </div>
        </details>

        {p.error && (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
            {p.error}
          </div>
        )}

        <div className="flex items-center justify-end gap-4 border-t border-neutral-100 pt-8">
          <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">
            Back
          </Link>
          <button type="submit" className="btn-primary !px-8" disabled={p.atLimit}>
            Run evaluation →
          </button>
        </div>
      </form>
      )}
    </div>
  );
}
