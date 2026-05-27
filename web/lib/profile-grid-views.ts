/**
 * Instagram profile Reels/Video tab — extract thumbnail view counts from grid.
 */

import { coerceMetricCount } from "./extract";
import type { ScreenshotLabel } from "./extract";
import type { PerImagePostMetricsInput } from "./recent-post-aggregate";

export interface ProfileGridViewsResult {
  view_counts: number[];
  avg_views: number | null;
  source_indices: number[];
}

function snippetList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
  }
  if (typeof value === "string" && value.trim().length > 0) return [value.trim()];
  return [];
}

function perImageEntry(
  perImage: PerImagePostMetricsInput[],
  index: number
): PerImagePostMetricsInput | undefined {
  if (!Array.isArray(perImage)) return undefined;
  return perImage.find((p) => p.image_index === index) ?? perImage[index];
}

function isExcludedSnippet(text: string): boolean {
  return /followers?|following|subscribers?|\bposts?\s*\d/i.test(text);
}

/** Reels/video tab grid — thumbnail view counts, not a single post icon row. */
export function isInstagramReelsGrid(
  snippets: string[],
  visualSignals: string[],
  excludeCounts: number[] = []
): boolean {
  const combined = [...snippets, ...visualSignals].join(" ");
  const lower = combined.toLowerCase();
  const gridCounts = parseGridViewCountsFromText(snippets, visualSignals, excludeCounts);

  const hasPostEngagement =
    /\blikes?\s*:\s*[\d,.]+/i.test(combined) ||
    /\bcomments?\s*:\s*[\d,.]+/i.test(combined) ||
    /\bshares?\s*:\s*[\d,.]+/i.test(combined) ||
    /\b1,\d{3}\b/.test(combined);

  const hasGridUi =
    /video thumbnails|view counts|instagram grid|reels?\s*(tab|grid)?|grid layout|thumbnail views/i.test(
      lower
    );

  if (hasGridUi && !hasPostEngagement) return true;

  if (gridCounts.length >= 3) {
    if (/reels?|video thumbnails|view counts|play icon|grid layout/i.test(lower)) return true;
    const hasLikesLabel = /\blikes?\b/i.test(lower);
    const hasCommaThousands = /\b\d{1,2},\d{3}\b/.test(combined);
    const mostlyLarge = gridCounts.filter((n) => n >= 10_000).length >= 3;
    if (!hasLikesLabel && !hasCommaThousands && mostlyLarge) return true;
  }

  return false;
}

/** Parse Reels grid view counts (e.g. 74.7K, 149K) from OCR / visual signals. */
export function parseGridViewCountsFromText(
  snippets: string[],
  visualSignals: string[],
  excludeCounts: number[] = []
): number[] {
  const exclude = new Set(excludeCounts.filter((n): n is number => n !== null && n > 0));
  const counts: number[] = [];
  const seen = new Set<number>();

  const tryAdd = (n: number | null) => {
    if (n === null || n < 1000 || exclude.has(n) || seen.has(n)) return;
    seen.add(n);
    counts.push(n);
  };

  for (const raw of [...snippets, ...visualSignals]) {
    const t = raw.trim();
    if (!t || isExcludedSnippet(t)) continue;
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) continue;

    for (const m of t.matchAll(/([\d,.]+)\s*([kmb])?\s*views?\b/gi)) {
      tryAdd(coerceMetricCount(`${m[1]}${m[2] ?? ""}`));
    }

    for (const m of t.matchAll(/\b([\d,.]+)\s*([kmb])\b/gi)) {
      tryAdd(coerceMetricCount(`${m[1]}${m[2]}`));
    }

    if (/^[\d,.]+\s*[kmb]$/i.test(t.replace(/\s/g, ""))) {
      tryAdd(coerceMetricCount(t));
    }
  }

  return counts;
}

function averageRounded(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function averageFromGridCounts(counts: number[]): number | null {
  return averageRounded(counts);
}

function normalizeCountArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => coerceMetricCount(x))
    .filter((n): n is number => n !== null && n >= 1000);
}

/** Aggregate view counts from profile screenshots showing a Reels/video grid. */
export function aggregateProfileGridViews(
  perImage: PerImagePostMetricsInput[],
  finalTypes: ScreenshotLabel[],
  imageCount: number,
  excludeCounts: number[] = [],
  parsedTopLevel?: Record<string, unknown>
): ProfileGridViewsResult {
  const allCounts: number[] = [];
  const sourceIndices: number[] = [];

  for (let i = 0; i < imageCount; i++) {
    const entry = (perImageEntry(perImage, i) ?? {}) as Record<string, unknown>;
    const snippets = snippetList(entry.ocr_snippets);
    const signals = snippetList(entry.visual_signals);
    const isGrid = isInstagramReelsGrid(snippets, signals, excludeCounts);
    if (finalTypes[i] !== "profile" && !isGrid) continue;

    const visionList = normalizeCountArray(entry.reel_view_counts);
    const counts = parseGridViewCountsFromText(snippets, signals, excludeCounts);
    const visionAvg = coerceMetricCount(entry.average_views);

    if (visionList.length >= 2) {
      sourceIndices.push(i);
      allCounts.push(...visionList);
      continue;
    }

    if (counts.length >= 2) {
      sourceIndices.push(i);
      allCounts.push(...counts);
      continue;
    }

    if (counts.length === 1) {
      allCounts.push(counts[0]!);
      sourceIndices.push(i);
    } else if (visionAvg !== null) {
      allCounts.push(visionAvg);
      sourceIndices.push(i);
    }
  }

  if (allCounts.length === 0 && parsedTopLevel) {
    const topAvg = coerceMetricCount(
      parsedTopLevel.average_views ?? parsedTopLevel.avg_views
    );
    if (topAvg !== null) {
      return {
        view_counts: [topAvg],
        avg_views: topAvg,
        source_indices: [],
      };
    }
  }

  const avg_views = averageRounded(allCounts);

  console.log("[profile-grid-views] profile grid view extraction", {
    source_indices: sourceIndices,
    view_counts: allCounts,
    avg_views,
  });

  return {
    view_counts: allCounts,
    avg_views: allCounts.length > 0 ? avg_views : null,
    source_indices: sourceIndices,
  };
}

export function mergeProfileGridViewsInto<T extends Record<string, unknown>>(
  out: T,
  grid: ProfileGridViewsResult
): T & Record<string, unknown> {
  if (grid.avg_views === null) return out;
  return {
    ...out,
    avg_views: grid.avg_views,
    average_views: grid.avg_views,
    views_count: grid.avg_views,
    profile_grid_view_counts: grid.view_counts,
    profile_grid_avg_views: grid.avg_views,
  };
}
