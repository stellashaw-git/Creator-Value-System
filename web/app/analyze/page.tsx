"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ReportCard } from "@/components/report-card";
import { AgentThinking } from "@/components/agent-thinking";
import { ScreenshotUpload } from "@/components/screenshot-upload";
import { saveEvaluation } from "@/lib/dataset";
import type { ExtractedSignals } from "@/lib/extract";
import { parseNonNegativeNumber } from "@/lib/parse-numeric-input";
import type { AnalyzeInput, Niche, Platform, Report } from "@/lib/types";

type NumField =
  | "followers"
  | "avgViews"
  | "averageLikes"
  | "averageComments"
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
  brandCategory: "supplements",
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
  avgComments: string
): string {
  const f = parseNonNegativeNumber(followers);
  if (!f.ok || f.value <= 0) return "Not enough data";
  const L = parseNonNegativeNumber(avgLikes);
  const C = parseNonNegativeNumber(avgComments);
  if (!L.ok || !C.ok) return "Not enough data";
  return `${(((L.value + C.value) / f.value) * 100).toFixed(2)}%`;
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

  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<Platform>("Instagram");
  const [niche, setNiche] = useState<Niche>("Beauty");
  const [followers, setFollowers] = useState("");
  const [avgViews, setAvgViews] = useState("");
  const [averageLikes, setAverageLikes] = useState("");
  const [averageComments, setAverageComments] = useState("");
  const [followers30DaysAgo, setFollowers30DaysAgo] = useState("");
  const [brandCategory, setBrandCategory] = useState("");
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
      setBrandCategory(DEMO.brandCategory || "");
      setComments(DEMO.comments.join("\n"));
      setFieldErrors({});
    }
  }, []);

  /**
   * Pre-fill the form from a screenshot extraction. We do NOT auto-submit —
   * the user always reviews and edits before evaluation runs.
   */
  const onExtracted = (data: ExtractedSignals) => {
    if (data.creator_name) setName(data.creator_name);
    if (data.platform && (PLATFORMS as string[]).includes(data.platform)) {
      setPlatform(data.platform as Platform);
    }
    if (data.niche && (NICHES as string[]).includes(data.niche)) {
      setNiche(data.niche as Niche);
    }
    if (typeof data.followers === "number" && data.followers > 0) {
      setFollowers(String(data.followers));
    }
    if (typeof data.average_views === "number" && data.average_views > 0) {
      setAvgViews(String(data.average_views));
    }
    if (typeof data.likes === "number" && data.likes >= 0) {
      setAverageLikes(String(data.likes));
    }
    if (typeof data.comments_count === "number" && data.comments_count >= 0) {
      setAverageComments(String(data.comments_count));
    }
    if (typeof data.growth_30d === "number" && Number.isFinite(data.growth_30d)) {
      const fNow =
        typeof data.followers === "number" && data.followers > 0 ? data.followers : 0;
      if (fNow > 0) {
        const raw = data.growth_30d;
        const gDec = Math.abs(raw) <= 1 ? raw : raw / 100;
        if (Number.isFinite(gDec) && gDec > -0.99) {
          setFollowers30DaysAgo(String(Math.round(fNow / (1 + gDec))));
        }
      }
    }
    const merged = [
      ...data.purchase_intent_comments,
      ...data.curiosity_comments,
      ...data.generic_comments,
    ].filter((c) => typeof c === "string" && c.trim().length > 0);
    const commentLines = merged.length > 0 ? merged : data.sample_comments;
    if (commentLines.length > 0) {
      setComments(commentLines.join("\n"));
    }
    // Smooth scroll to the form so the user can review.
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
      platform,
      niche,
      followers: fr.value,
      avgViews: avgViewsNum,
      averageLikes: averageLikesNum,
      averageComments: averageCommentsNum,
      followers30DaysAgo: followers30Num,
      brandCategory: brandCategory.trim() || undefined,
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
      setReport(json.report);
      // Persist to the local Creator Intelligence Dataset.
      const saved = saveEvaluation(json.report);
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
                Dataset
              </Link>
            </nav>
          </div>
          {stage === "form" && (
            <Link href="/analyze?demo=1" className="text-xs font-semibold text-neutral-500 hover:text-neutral-900">
              Load sample creator →
            </Link>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {stage === "form" && (
            <FormView
            {...{
              name, setName, platform, setPlatform, niche, setNiche,
              followers, setFollowers, avgViews, setAvgViews,
              averageLikes, setAverageLikes,
              averageComments, setAverageComments,
              followers30DaysAgo, setFollowers30DaysAgo,
              brandCategory, setBrandCategory, comments, setComments,
              fieldErrors,
              onNumericBlur: handleNumericBlur,
              onNumericFocus: clearFieldError,
              error,
              onSubmit: runAnalysis,
              onExtracted,
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
      </div>
    </main>
  );
}

interface FormProps {
  name: string;
  setName: (v: string) => void;
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
  followers30DaysAgo: string;
  setFollowers30DaysAgo: (v: string) => void;
  brandCategory: string;
  setBrandCategory: (v: string) => void;
  comments: string;
  setComments: (v: string) => void;
  fieldErrors: Partial<Record<NumField, string>>;
  onNumericBlur: (key: NumField, raw: string) => void;
  onNumericFocus: (key: NumField) => void;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onExtracted: (data: ExtractedSignals) => void;
}

function FormView(p: FormProps) {
  return (
    <div>
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Step 1 · Drop in screenshots or fill manually
        </div>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
          Which creator should we evaluate?
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600">
          Upload screenshots of the creator's profile, posts, or comments and we'll extract the
          signals into the form below — so your campaign team moves from research to a decision
          brief in minutes, not days. Manual input still works as a fallback.
        </p>
      </div>

      <div className="mt-8 space-y-6">
        <ScreenshotUpload onExtracted={p.onExtracted} />
      </div>

      <div id="review-anchor" className="mt-10 flex items-center gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">
          Step 2
        </span>
        <span className="h-px flex-1 bg-neutral-200" />
        <h2 className="text-base font-bold tracking-tight text-neutral-900">
          Review the extracted profile
        </h2>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Edit any field that's wrong or missing. This is the data the platform will evaluate.
      </p>

      <form onSubmit={p.onSubmit} className="mt-6 space-y-6">
        <div className="card">
          <h2 className="section-title">Profile</h2>
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
            <div>
              <label className="label">Brand category (optional)</label>
              <input
                className="input"
                placeholder="e.g. supplements, skincare"
                value={p.brandCategory}
                onChange={(e) => p.setBrandCategory(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="section-title">Audience metrics</h2>
          <p className="mt-2 text-xs text-neutral-600">
            More complete data → more accurate evaluation
          </p>
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
                  <label className="label text-xs">Avg likes (per post)</label>
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
                  <label className="label text-xs">Avg comments (per post)</label>
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
                Use averages from posts in the <span className="font-medium text-neutral-700">last 30 days</span> so
                the numbers reflect current cadence, not lifetime or one-off viral spikes.
              </p>
            </div>
            <div>
              <label className="label">Engagement rate (%)</label>
              <input
                className="input cursor-not-allowed bg-neutral-50 text-neutral-800"
                readOnly
                value={engagementDisplayPct(p.followers, p.averageLikes, p.averageComments)}
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                Auto-calculated from likes, comments, and followers
              </p>
            </div>
            <div>
              <label className="label">30-day growth (%)</label>
              <input
                className="input cursor-not-allowed bg-neutral-50 text-neutral-800"
                readOnly
                value={growthDisplayPct(p.followers, p.followers30DaysAgo)}
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                Optional — only if historical data is available
              </p>
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

        <div className="card">
          <h2 className="section-title">Sample comments</h2>
          <p className="mt-1 text-xs text-neutral-500">
            One per line. Drives the audience-intent read. 15+ for a real signal.
          </p>
          <textarea
            className="input mt-3 min-h-[180px] font-mono text-xs"
            placeholder={"where did you get this?\nlink pls 🙏\nprice?\nso pretty 😍"}
            value={p.comments}
            onChange={(e) => p.setComments(e.target.value)}
          />
        </div>

        {p.error && (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
            {p.error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">
            ← Back
          </Link>
          <button type="submit" className="btn-primary">
            Evaluate a Creator →
          </button>
        </div>
      </form>
    </div>
  );
}
