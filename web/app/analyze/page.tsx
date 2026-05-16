"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ReportCard } from "@/components/report-card";
import { AgentThinking } from "@/components/agent-thinking";
import { ScreenshotUpload } from "@/components/screenshot-upload";
import { saveEvaluation } from "@/lib/dataset";
import type { ExtractedSignals } from "@/lib/extract";
import type { AnalyzeInput, Niche, Platform, Report } from "@/lib/types";

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
  engagementRate: 0.046,
  growthRate30d: 0.11,
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

export default function AnalyzePage() {
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<Platform>("Instagram");
  const [niche, setNiche] = useState<Niche>("Beauty");
  const [followers, setFollowers] = useState<number | "">("");
  const [avgViews, setAvgViews] = useState<number | "">("");
  const [engagementRate, setEngagementRate] = useState<number | "">("");
  const [growthRate30d, setGrowthRate30d] = useState<number | "">("");
  const [brandCategory, setBrandCategory] = useState("");
  const [comments, setComments] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") {
      setName(DEMO.name);
      setPlatform(DEMO.platform);
      setNiche(DEMO.niche);
      setFollowers(DEMO.followers);
      setAvgViews(DEMO.avgViews);
      setEngagementRate(DEMO.engagementRate * 100);
      setGrowthRate30d(DEMO.growthRate30d * 100);
      setBrandCategory(DEMO.brandCategory || "");
      setComments(DEMO.comments.join("\n"));
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
      setFollowers(data.followers);
    }
    if (typeof data.average_views === "number" && data.average_views > 0) {
      setAvgViews(data.average_views);
    }
    if (typeof data.engagement_rate === "number") {
      setEngagementRate(data.engagement_rate);
    }
    if (typeof data.growth_30d === "number") {
      setGrowthRate30d(data.growth_30d);
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
    setError(null);
    if (!name.trim()) return setError("Creator name is required.");
    if (!followers || Number(followers) <= 0)
      return setError("Followers must be greater than 0.");

    setStage("loading");

    const body: AnalyzeInput = {
      name: name.trim(),
      platform,
      niche,
      followers: Number(followers),
      avgViews: Number(avgViews) || 0,
      engagementRate: Number(engagementRate) / 100 || 0,
      growthRate30d: Number(growthRate30d) / 100 || 0,
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
              engagementRate, setEngagementRate,
              growthRate30d, setGrowthRate30d,
              brandCategory, setBrandCategory, comments, setComments,
              error, onSubmit: runAnalysis, onExtracted,
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
  followers: number | "";
  setFollowers: (v: number | "") => void;
  avgViews: number | "";
  setAvgViews: (v: number | "") => void;
  engagementRate: number | "";
  setEngagementRate: (v: number | "") => void;
  growthRate30d: number | "";
  setGrowthRate30d: (v: number | "") => void;
  brandCategory: string;
  setBrandCategory: (v: string) => void;
  comments: string;
  setComments: (v: string) => void;
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
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Followers *</label>
              <input
                className="input"
                type="number"
                min={0}
                step={500}
                value={p.followers}
                onChange={(e) =>
                  p.setFollowers(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </div>
            <div>
              <label className="label">Average views</label>
              <input
                className="input"
                type="number"
                min={0}
                step={250}
                value={p.avgViews}
                onChange={(e) =>
                  p.setAvgViews(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </div>
            <div>
              <label className="label">Engagement rate (%)</label>
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                step={0.1}
                placeholder="e.g. 4.6"
                value={p.engagementRate}
                onChange={(e) =>
                  p.setEngagementRate(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </div>
            <div>
              <label className="label">30-day growth (%)</label>
              <input
                className="input"
                type="number"
                min={-100}
                max={500}
                step={0.1}
                placeholder="e.g. 11"
                value={p.growthRate30d}
                onChange={(e) =>
                  p.setGrowthRate30d(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
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
