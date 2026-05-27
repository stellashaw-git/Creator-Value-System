/**
 * Recent Post averaging — isolated from UI/extraction copy.
 * Only screenshots with final type "post" (Recent Post) should be passed in.
 */

import type { ScreenshotLabel } from "./extract";
import { isInstagramReelsGrid } from "./profile-grid-views";

export interface RecentPostMetricRow {
  screenshot_id: string;
  likes_count: number | null;
  comments_count: number | null;
  reposts_count: number | null;
  shares_count: number | null;
  saves_count: number | null;
  views_count: number | null;
}

export interface RecentPostAverages {
  recent_post_metrics: RecentPostMetricRow[];
  recent_post_count: number;
  avg_likes: number | null;
  avg_comments: number | null;
  avg_reposts: number | null;
  avg_shares: number | null;
  avg_saves: number | null;
  avg_views: number | null;
}

export interface RecentPostAggregation extends RecentPostAverages {
  aggregation_notes: string[];
}

export type PostMetricLayout = "bottom_row" | "right_side_vertical" | "unknown";

export interface PerImagePostMetricsInput {
  image_index?: number;
  visual_signals?: unknown;
  ocr_snippets?: unknown;
  llm_suggested_type?: string;
  average_views?: unknown;
  reel_view_counts?: unknown;
  post_metrics?: {
    layout_detected?: unknown;
    likes_count?: unknown;
    comments_count?: unknown;
    reposts_count?: unknown;
    shares_count?: unknown;
    shares?: unknown;
    saves_count?: unknown;
    views_count?: unknown;
  };
}

function coerceCount(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v);
  const s = String(v).trim().replace(/,/g, "").replace(/\s+/g, "");
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s*([kmb])?$/i);
  if (m) {
    let n = parseFloat(m[1]);
    if (!Number.isFinite(n) || n < 0) return null;
    const suffix = (m[2] || "").toLowerCase();
    if (suffix === "k") n *= 1_000;
    else if (suffix === "m") n *= 1_000_000;
    else if (suffix === "b") n *= 1_000_000_000;
    return Math.round(n);
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
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

function pickPostMetric(
  pm: Record<string, unknown> | undefined,
  entry: Record<string, unknown>,
  parsedTop: Record<string, unknown> | undefined,
  keys: string[],
  useParsedFallback: boolean
): number | null {
  for (const key of keys) {
    const n = coerceCount(pm?.[key]);
    if (n !== null) return n;
  }
  for (const key of keys) {
    const n = coerceCount(entry[key]);
    if (n !== null) return n;
  }
  if (useParsedFallback && parsedTop) {
    for (const key of keys) {
      const n = coerceCount(parsedTop[key]);
      if (n !== null) return n;
    }
  }
  return null;
}

function isNonMetricSnippet(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return true;
  if (/\b(days?|hours?|minutes?|weeks?|months?|years?|ago|yesterday)\b/i.test(t)) {
    return true;
  }
  if (/^(more|posts|likes?|comments?|views?|reposts?|shares?|saves?|send)$/i.test(t)) {
    return true;
  }
  return false;
}

function hasExplicitViewsLabel(snippets: string[], visualSignals: string[]): boolean {
  const combined = [...snippets, ...visualSignals].join(" ");
  return /\bviews?\b|\bplays?\b|\bimpressions?\b|\breach\b/i.test(combined);
}

function hasExplicitSavesLabel(snippets: string[], visualSignals: string[]): boolean {
  const combined = [...snippets, ...visualSignals].join(" ");
  return /\bsaves?\b|\bbookmarks?\b/i.test(combined);
}

function isInstagramPlatform(parsedTopLevel?: Record<string, unknown>): boolean {
  const platform = String(
    parsedTopLevel?.platform ?? parsedTopLevel?.detected_platform ?? ""
  );
  return /instagram|threads/i.test(platform);
}

/** Profile Reels grid view counts (many large K/M values) — not single-post engagement. */
function looksLikeReelsGridViewCounts(
  snippets: string[],
  visualSignals: string[],
  excludeCounts: number[] = []
): boolean {
  if (isInstagramReelsGrid(snippets, visualSignals, excludeCounts)) return true;
  const ordered = orderedBareNumbers(snippets, visualSignals);
  if (ordered.length < 3) return false;
  const combined = [...snippets, ...visualSignals].join(" ");
  if (/\b(heart|like\s*icon|speech|comment\s+bubble|paper\s+plane|bookmark)\b/i.test(combined)) {
    return false;
  }
  const large = ordered.filter((n) => n >= 100_000);
  return large.length >= 3;
}

function orderedBareNumbers(snippets: string[], visualSignals: string[]): number[] {
  const ordered: number[] = [];
  const seen = new Set<number>();
  for (const raw of [...snippets, ...visualSignals]) {
    const t = raw.trim();
    if (isNonMetricSnippet(t)) continue;
    if (/^[\d,.]+[kmb]?$/i.test(t.replace(/\s/g, ""))) {
      const n = coerceCount(t);
      if (n !== null && !seen.has(n)) {
        ordered.push(n);
        seen.add(n);
      }
    }
  }
  return ordered;
}

function layoutFromPm(pm: Record<string, unknown> | undefined): PostMetricLayout | null {
  const v = pm?.layout_detected;
  if (v === "bottom_row" || v === "right_side_vertical" || v === "unknown") {
    return v;
  }
  return null;
}

/** Detect engagement metric layout from vision hints + OCR. */
export function detectPostMetricLayout(
  snippets: string[],
  visualSignals: string[],
  pm?: Record<string, unknown>
): PostMetricLayout {
  const fromPm = layoutFromPm(pm);
  if (fromPm && fromPm !== "unknown") return fromPm;

  const combined = [...visualSignals, ...snippets].join(" ").toLowerCase();

  if (
    /\b(right[\s-]?(side|column|edge)|vertical\s+(column|stack)|engagement\s+(icons?|metrics?)\s+on\s+the\s+right|stacked\s+on\s+the\s+right|icons?\s+on\s+right)\b/.test(
      combined
    ) ||
    (/\b(reels?|tiktok|full[\s-]?screen)\b/.test(combined) &&
      /\b(heart|speech|comment\s+bubble|paper\s+plane|bookmark|reshare|repost)\b/.test(
        combined
      ))
  ) {
    return "right_side_vertical";
  }

  if (
    /\blikes?\s*[·•|]\s*comments?/i.test(combined) ||
    /\b(icon\s+row|below\s+(the\s+)?caption|bottom\s+(row|bar)|under\s+the\s+caption)\b/.test(
      combined
    )
  ) {
    return "bottom_row";
  }

  const ordered = orderedBareNumbers(snippets, visualSignals);
  if (
    ordered.length >= 3 &&
    !/\blikes?\s*[·•]\s*comments?/i.test(combined) &&
    !looksLikeReelsGridViewCounts(snippets, visualSignals)
  ) {
    return "right_side_vertical";
  }

  return fromPm ?? "unknown";
}

type PostMetricFields = Pick<
  RecentPostMetricRow,
  | "likes_count"
  | "comments_count"
  | "reposts_count"
  | "shares_count"
  | "saves_count"
  | "views_count"
>;

const VERTICAL_SLOT_ORDER: (keyof PostMetricFields)[] = [
  "likes_count",
  "comments_count",
  "reposts_count",
  "shares_count",
  "saves_count",
];

/** Map icon keywords in OCR/visual_signals to metric fields. */
function parseIconLabeledCounts(
  snippets: string[],
  visualSignals: string[]
): PostMetricFields {
  const out: PostMetricFields = {
    likes_count: null,
    comments_count: null,
    reposts_count: null,
    shares_count: null,
    saves_count: null,
    views_count: null,
  };

  const iconPatterns: { key: keyof PostMetricFields; patterns: RegExp[] }[] = [
    {
      key: "likes_count",
      patterns: [
        /(?:heart|❤|♥|like\s*icon)[^\d]{0,60}([\d,.]+)\s*([kmb])?/i,
        /([\d,.]+)\s*([kmb])?[^\d]{0,20}(?:likes?|heart)\b/i,
        /(?:likes?)\s*[:\-]?\s*([\d,.]+)\s*([kmb])?/i,
      ],
    },
    {
      key: "comments_count",
      patterns: [
        /(?:speech|comment\s+bubble|💬)[^\d]{0,60}([\d,.]+)\s*([kmb])?/i,
        /([\d,.]+)\s*([kmb])?[^\d]{0,20}(?:comments?|speech)\b/i,
        /(?:comments?)\s*[:\-]?\s*([\d,.]+)\s*([kmb])?/i,
      ],
    },
    {
      key: "reposts_count",
      patterns: [
        /(?:repost|reshare|retweet|↗|two\s+arrows)[^\d]{0,60}([\d,.]+)\s*([kmb])?/i,
        /([\d,.]+)\s*([kmb])?[^\d]{0,20}(?:reposts?|reshares?|retweets?)\b/i,
      ],
    },
    {
      key: "shares_count",
      patterns: [
        /(?:paper\s+plane|send|share\s+arrow|↗\s*send)[^\d]{0,60}([\d,.]+)\s*([kmb])?/i,
        /([\d,.]+)\s*([kmb])?[^\d]{0,20}(?:shares?|sends?)\b/i,
      ],
    },
    {
      key: "saves_count",
      patterns: [
        /(?:bookmark|save\s*icon|ribbon)[^\d]{0,60}([\d,.]+)\s*([kmb])?/i,
        /([\d,.]+)\s*([kmb])?[^\d]{0,20}(?:saves?|bookmarks?)\b/i,
      ],
    },
    {
      key: "views_count",
      patterns: [
        /(?:play|view\s*count|views?)[^\d]{0,60}([\d,.]+)\s*([kmb])?/i,
        /([\d,.]+)\s*([kmb])?[^\d]{0,20}(?:views?|plays?)\b/i,
      ],
    },
  ];

  for (const line of [...visualSignals, ...snippets]) {
    const t = line.trim();
    if (!t) continue;
    for (const { key, patterns } of iconPatterns) {
      if (out[key] !== null) continue;
      for (const re of patterns) {
        const m = t.match(re);
        if (!m) continue;
        const n = coerceCount(`${m[1]}${m[2] ?? ""}`);
        if (n !== null) {
          out[key] = n;
          break;
        }
      }
    }
  }

  return out;
}

/**
 * Right-side vertical stack (Reels/TikTok): top-to-bottom is typically
 * likes → comments → reposts → shares → saves.
 */
function resolveVerticalRightColumnMetrics(
  snippets: string[],
  visualSignals: string[],
  knownLikes: number | null
): PostMetricFields {
  const out = parseIconLabeledCounts(snippets, visualSignals);
  if (knownLikes !== null) out.likes_count = knownLikes;

  const ordered = orderedBareNumbers(snippets, visualSignals);
  let slot = 0;
  for (const n of ordered) {
    if (knownLikes !== null && n === knownLikes) {
      out.likes_count = out.likes_count ?? knownLikes;
      continue;
    }
    while (slot < VERTICAL_SLOT_ORDER.length && out[VERTICAL_SLOT_ORDER[slot]] !== null) {
      slot++;
    }
    if (slot >= VERTICAL_SLOT_ORDER.length) break;
    const key = VERTICAL_SLOT_ORDER[slot]!;
    out[key] = out[key] ?? n;
    slot++;
  }

  if (!hasExplicitSavesLabel(snippets, visualSignals)) {
    out.saves_count = null;
  }
  if (!hasExplicitViewsLabel(snippets, visualSignals)) {
    out.views_count = null;
  } else {
    const combined = [...snippets, ...visualSignals].join(" ");
    const vm =
      combined.match(/([\d,.]+)\s*([kmb])?\s*views?\b/i) ??
      combined.match(/views?\s*[:\-]?\s*([\d,.]+)\s*([kmb])?\b/i) ??
      combined.match(/([\d,.]+)\s*([kmb])?\s*plays?\b/i);
    if (vm && out.views_count === null) {
      out.views_count = coerceCount(`${vm[1]}${vm[2] ?? ""}`);
    }
  }

  return out;
}

/**
 * Instagram bottom icon row: comments → reposts → shares → saves (likes excluded).
 * Never infer views from icon-row numbers — feed posts don't show views.
 */
function resolveInstagramIconRowMetrics(
  snippets: string[],
  visualSignals: string[],
  likes_count: number | null
): Pick<
  RecentPostMetricRow,
  "comments_count" | "reposts_count" | "shares_count" | "saves_count" | "views_count"
> {
  const combined = [...snippets, ...visualSignals].join(" ");
  const ordered = orderedBareNumbers(snippets, visualSignals);
  const rest =
    likes_count !== null ? ordered.filter((n) => n !== likes_count) : ordered;

  const out = {
    comments_count: rest[0] ?? null,
    reposts_count: rest[1] ?? null,
    shares_count: rest[2] ?? null,
    saves_count: rest.length >= 4 ? (rest[3] ?? null) : null,
    views_count: null as number | null,
  };

  if (!hasExplicitSavesLabel(snippets, visualSignals)) {
    out.saves_count = null;
  }

  if (hasExplicitViewsLabel(snippets, visualSignals)) {
    const vm =
      combined.match(/([\d,.]+)\s*([kmb])?\s*views?\b/i) ??
      combined.match(/views?\s*[:\-]?\s*([\d,.]+)\s*([kmb])?\b/i) ??
      combined.match(/([\d,.]+)\s*([kmb])?\s*plays?\b/i);
    if (vm) out.views_count = coerceCount(`${vm[1]}${vm[2] ?? ""}`);
  }

  return out;
}

/** Parse Instagram icon-row / bare-number engagement when post_metrics is incomplete. */
function parseInstagramEngagementFromSnippets(
  snippets: string[],
  visualSignals: string[],
  knownLikes: number | null
): ReturnType<typeof parsePostMetricsFromOcr> {
  const out: ReturnType<typeof parsePostMetricsFromOcr> = {};
  const combined = [...snippets, ...visualSignals].join(" ");

  const likesComments = combined.match(
    /([\d,.]+)\s*([kmb])?\s*likes?\s*[·•]\s*([\d,.]+)\s*([kmb])?\s*comments?/i
  );
  if (likesComments) {
    out.likes_count = coerceCount(`${likesComments[1]}${likesComments[2] ?? ""}`);
    out.comments_count = coerceCount(`${likesComments[3]}${likesComments[4] ?? ""}`);
  }

  const ordered: number[] = [];
  const seen = new Set<number>();
  for (const raw of [...snippets, ...visualSignals]) {
    const t = raw.trim();
    if (isNonMetricSnippet(t)) continue;

    const labeled = t.match(
      /([\d,.]+)\s*([kmb])?\s*(comments?|reposts?|retweets?|shares?|sends?|saves?|bookmarks?|views?|likes?)\b/i
    );
    if (labeled) {
      const n = coerceCount(`${labeled[1]}${labeled[2] ?? ""}`);
      const word = labeled[3].toLowerCase();
      if (n !== null) {
        if (word.startsWith("comment")) out.comments_count = n;
        else if (word.startsWith("repost") || word.startsWith("retweet")) out.reposts_count = n;
        else if (word.startsWith("share") || word.startsWith("send")) out.shares_count = n;
        else if (word.startsWith("save") || word.startsWith("bookmark")) out.saves_count = n;
        else if (word.startsWith("view")) out.views_count = n;
        else if (word.startsWith("like")) out.likes_count = n;
      }
      continue;
    }

    if (/^[\d,.]+[kmb]?$/i.test(t.replace(/\s/g, ""))) {
      const n = coerceCount(t);
      if (n !== null && !seen.has(n)) {
        ordered.push(n);
        seen.add(n);
      }
    }
  }

  const likeVal = knownLikes ?? out.likes_count ?? null;
  const assignKeys: (keyof typeof out)[] = [
    "comments_count",
    "reposts_count",
    "shares_count",
    "saves_count",
  ];
  let idx = 0;
  for (const n of ordered) {
    if (likeVal !== null && n === likeVal) continue;
    while (idx < assignKeys.length && out[assignKeys[idx]] != null) idx++;
    if (idx >= assignKeys.length) break;
    out[assignKeys[idx]!] = n;
    idx++;
  }

  return out;
}

function mergePostMetricFields(
  base: PostMetricFields,
  patch: Partial<PostMetricFields>
): PostMetricFields {
  return {
    likes_count: mergeRowMetric(base.likes_count, patch.likes_count),
    comments_count: mergeRowMetric(base.comments_count, patch.comments_count),
    reposts_count: mergeRowMetric(base.reposts_count, patch.reposts_count),
    shares_count: mergeRowMetric(base.shares_count, patch.shares_count),
    saves_count: mergeRowMetric(base.saves_count, patch.saves_count),
    views_count: mergeRowMetric(base.views_count, patch.views_count),
  };
}

function parsePostMetricsFromOcr(combined: string): {
  likes_count?: number | null;
  comments_count?: number | null;
  reposts_count?: number | null;
  shares_count?: number | null;
  saves_count?: number | null;
  views_count?: number | null;
} {
  const out: {
    likes_count?: number | null;
    comments_count?: number | null;
    reposts_count?: number | null;
    shares_count?: number | null;
    saves_count?: number | null;
    views_count?: number | null;
  } = {};
  const patterns: {
    key: keyof typeof out;
    re: RegExp;
  }[] = [
    { key: "likes_count", re: /([\d,.]+)\s*([kmb])?\s*likes?\b/i },
    { key: "likes_count", re: /likes?\s*[:\-]?\s*([\d,.]+)\s*([kmb])?\b/i },
    { key: "comments_count", re: /([\d,.]+)\s*([kmb])?\s*comments?\b/i },
    { key: "comments_count", re: /comments?\s*[:\-]?\s*([\d,.]+)\s*([kmb])?\b/i },
    { key: "reposts_count", re: /([\d,.]+)\s*([kmb])?\s*(?:reposts?|retweets?)\b/i },
    { key: "reposts_count", re: /(?:reposts?|retweets?)\s*[:\-]?\s*([\d,.]+)\s*([kmb])?\b/i },
    { key: "shares_count", re: /([\d,.]+)\s*([kmb])?\s*(?:shares?|sends?)\b/i },
    { key: "shares_count", re: /(?:shares?|sends?)\s*[:\-]?\s*([\d,.]+)\s*([kmb])?\b/i },
    { key: "saves_count", re: /([\d,.]+)\s*([kmb])?\s*(?:saves?|bookmarks?)\b/i },
    { key: "saves_count", re: /(?:saves?|bookmarks?)\s*[:\-]?\s*([\d,.]+)\s*([kmb])?\b/i },
    { key: "views_count", re: /([\d,.]+)\s*([kmb])?\s*views?\b/i },
    { key: "views_count", re: /views?\s*[:\-]?\s*([\d,.]+)\s*([kmb])?\b/i },
  ];
  for (const { key, re } of patterns) {
    const m = combined.match(re);
    if (!m) continue;
    const n = coerceCount(`${m[1]}${m[2] ?? ""}`);
    if (n !== null) out[key] = n;
  }
  return out;
}

function mergeRowMetric(
  current: number | null,
  next: number | null | undefined
): number | null {
  if (current !== null) return current;
  if (next === null || next === undefined) return null;
  return next;
}

function averageIgnoreNull(values: (number | null | undefined)[]): number | null {
  const nums = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0
  );
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

const METRIC_LABELS: { key: keyof RecentPostMetricRow; label: string }[] = [
  { key: "likes_count", label: "likes" },
  { key: "comments_count", label: "comments" },
  { key: "reposts_count", label: "reposts" },
  { key: "shares_count", label: "shares" },
  { key: "saves_count", label: "saves" },
  { key: "views_count", label: "views" },
];

/** Map `screenshot_N` row id to zero-based upload index. */
export function screenshotIndexFromRowId(id: string): number | null {
  const m = id.match(/^screenshot_(\d+)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 ? n - 1 : null;
}

/** Keep only rows for images the user labeled Recent Post (final type). */
export function filterRecentPostMetricsByFinalType(
  rows: RecentPostMetricRow[],
  finalTypes: ScreenshotLabel[]
): RecentPostMetricRow[] {
  if (!finalTypes.length) return rows;
  const postCount = finalTypes.filter((t) => t === "post").length;
  if (postCount === 0) return [];

  return rows.filter((row) => {
    const idx = screenshotIndexFromRowId(row.screenshot_id);
    if (idx === null || idx < 0 || idx >= finalTypes.length) {
      return postCount === 1 && rows.length === 1;
    }
    return finalTypes[idx] === "post";
  });
}

/** Pure average calculation from per-post rows. Ignores null/undefined; keeps 0. */
export function calculateRecentPostAverages(
  rows: RecentPostMetricRow[]
): RecentPostAverages {
  if (rows.length === 0) {
    return {
      recent_post_metrics: [],
      recent_post_count: 0,
      avg_likes: null,
      avg_comments: null,
      avg_reposts: null,
      avg_shares: null,
      avg_saves: null,
      avg_views: null,
    };
  }

  return {
    recent_post_metrics: rows,
    recent_post_count: rows.length,
    avg_likes: averageIgnoreNull(rows.map((r) => r.likes_count)),
    avg_comments: averageIgnoreNull(rows.map((r) => r.comments_count)),
    avg_reposts: averageIgnoreNull(rows.map((r) => r.reposts_count)),
    avg_shares: averageIgnoreNull(rows.map((r) => r.shares_count)),
    avg_saves: averageIgnoreNull(rows.map((r) => r.saves_count)),
    avg_views: averageIgnoreNull(rows.map((r) => r.views_count)),
  };
}

export function aggregateRecentPostMetrics(
  rows: RecentPostMetricRow[]
): RecentPostAggregation {
  const averages = calculateRecentPostAverages(rows);
  if (averages.recent_post_count === 0) {
    return { ...averages, aggregation_notes: [] };
  }

  const notes: string[] = [
    `Aggregated ${rows.length} recent post screenshot${rows.length === 1 ? "" : "s"}.`,
  ];

  for (const { key, label } of METRIC_LABELS) {
    const missing = rows.filter((r) => r[key] == null).length;
    if (missing > 0 && missing < rows.length) {
      notes.push(`Missing ${label} on ${missing} of ${rows.length} posts.`);
    } else if (missing === rows.length) {
      notes.push(`No ${label} visible across ${rows.length} posts.`);
    }
  }

  return { ...averages, aggregation_notes: notes };
}

/** Build per-post rows using FINAL screenshot types only (post = Recent Post). */
export function buildRecentPostMetricsFromVision(
  perImage: PerImagePostMetricsInput[] | undefined,
  finalTypes: ScreenshotLabel[],
  imageCount: number,
  parsedTopLevel?: Record<string, unknown>
): RecentPostAggregation {
  const rows: RecentPostMetricRow[] = [];
  const postIndices: number[] = [];
  const perImageList = Array.isArray(perImage) ? perImage : [];
  const useParsedFallback = finalTypes.filter((t) => t === "post").length === 1;

  for (let i = 0; i < imageCount; i++) {
    if (finalTypes[i] !== "post") continue;
    postIndices.push(i);
    const entry = (perImageList.find((p) => p.image_index === i) ??
      perImageList[i] ??
      {}) as Record<string, unknown>;
    const pm = entry.post_metrics as Record<string, unknown> | undefined;
    const visualSnippets = snippetList(entry.visual_signals);
    const ocrSnippets = snippetList(entry.ocr_snippets);

    const ocrText = [...visualSnippets, ...ocrSnippets].join(" ");
    const ocrMetrics = parsePostMetricsFromOcr(ocrText);
    const layout_detected = detectPostMetricLayout(ocrSnippets, visualSnippets, pm);

    let metrics: PostMetricFields = {
      likes_count: pickPostMetric(pm, entry, parsedTopLevel, ["likes_count", "likes"], useParsedFallback),
      comments_count: pickPostMetric(
        pm,
        entry,
        parsedTopLevel,
        ["comments_count", "comments", "comment_count"],
        useParsedFallback
      ),
      reposts_count: pickPostMetric(
        pm,
        entry,
        parsedTopLevel,
        ["reposts_count", "reposts", "retweets_count", "retweets", "repost_count"],
        useParsedFallback
      ),
      shares_count: pickPostMetric(
        pm,
        entry,
        parsedTopLevel,
        ["shares_count", "shares", "send_count", "sends"],
        useParsedFallback
      ),
      saves_count: pickPostMetric(
        pm,
        entry,
        parsedTopLevel,
        ["saves_count", "saves", "bookmarks_count", "bookmarks", "save_count"],
        useParsedFallback
      ),
      views_count: pickPostMetric(
        pm,
        entry,
        parsedTopLevel,
        ["views_count", "views", "average_views", "avg_views"],
        useParsedFallback
      ),
    };

    metrics = mergePostMetricFields(metrics, {
      likes_count: ocrMetrics.likes_count ?? null,
      comments_count: ocrMetrics.comments_count ?? null,
      reposts_count: ocrMetrics.reposts_count ?? null,
      shares_count: ocrMetrics.shares_count ?? null,
      saves_count: ocrMetrics.saves_count ?? null,
      views_count: ocrMetrics.views_count ?? null,
    });

    if (
      layout_detected === "right_side_vertical" ||
      layout_detected === "unknown"
    ) {
      const vertical = resolveVerticalRightColumnMetrics(
        ocrSnippets,
        visualSnippets,
        metrics.likes_count
      );
      metrics = mergePostMetricFields(metrics, vertical);
    }

    if (layout_detected === "bottom_row") {
      const bottomSnippets = parseInstagramEngagementFromSnippets(
        ocrSnippets,
        visualSnippets,
        metrics.likes_count
      );
      metrics = mergePostMetricFields(metrics, {
        likes_count: bottomSnippets.likes_count ?? null,
        comments_count: bottomSnippets.comments_count ?? null,
        reposts_count: bottomSnippets.reposts_count ?? null,
        shares_count: bottomSnippets.shares_count ?? null,
        saves_count: bottomSnippets.saves_count ?? null,
        views_count: bottomSnippets.views_count ?? null,
      });

      if (isInstagramPlatform(parsedTopLevel)) {
        const iconRow = resolveInstagramIconRowMetrics(
          ocrSnippets,
          visualSnippets,
          metrics.likes_count
        );
        metrics = mergePostMetricFields(metrics, {
          comments_count: iconRow.comments_count,
          reposts_count: iconRow.reposts_count,
          shares_count: iconRow.shares_count,
          saves_count: iconRow.saves_count,
          views_count: iconRow.views_count,
        });
      }
    }

    let {
      likes_count,
      comments_count,
      reposts_count,
      shares_count,
      saves_count,
      views_count,
    } = metrics;

    if (!hasExplicitViewsLabel(ocrSnippets, visualSnippets)) {
      views_count = null;
    }

    console.log("[recent-post-aggregate] post metric extraction", {
      screenshot_id: `screenshot_${i + 1}`,
      finalType: "Recent Post",
      layout_detected,
      extracted_post_metrics: {
        likes_count,
        comments_count,
        reposts_count,
        shares_count,
        saves_count,
        views_count,
      },
    });

    const hasAnyMetric =
      likes_count !== null ||
      comments_count !== null ||
      reposts_count !== null ||
      shares_count !== null ||
      saves_count !== null ||
      views_count !== null;
    if (!hasAnyMetric) {
      console.log("[recent-post-aggregate] skipping post row with no metrics", i);
      continue;
    }

    rows.push({
      screenshot_id: `screenshot_${i + 1}`,
      likes_count,
      comments_count,
      reposts_count,
      shares_count,
      saves_count,
      views_count,
    });
  }

  console.log("[recent-post-aggregate] recent post screenshots used", postIndices);
  console.log("[recent-post-aggregate] raw recent post metrics", rows);

  const aggregation = aggregateRecentPostMetrics(rows);
  console.log("[recent-post-aggregate] calculated averages", {
    recent_post_count: aggregation.recent_post_count,
    avg_likes: aggregation.avg_likes,
    avg_comments: aggregation.avg_comments,
    avg_reposts: aggregation.avg_reposts,
    avg_shares: aggregation.avg_shares,
    avg_saves: aggregation.avg_saves,
    avg_views: aggregation.avg_views,
  });

  return aggregation;
}

/** Merge aggregated post averages into extraction payload (backward compatible top-level fields). */
export function applyRecentPostAggregation<T extends Record<string, unknown>>(
  parsed: T,
  aggregation: RecentPostAggregation
): T & RecentPostAggregation & Record<string, unknown> {
  if (aggregation.recent_post_count === 0) {
    return {
      ...parsed,
      recent_post_metrics: [],
      recent_post_count: 0,
      avg_likes: null,
      avg_comments: null,
      avg_reposts: null,
      avg_shares: null,
      avg_saves: null,
      avg_views: null,
      aggregation_notes: [],
    };
  }

  const singlePost = aggregation.recent_post_count === 1;
  const resolveAvg = (aggVal: number | null, ...keys: string[]): number | null => {
    if (aggVal !== null) return aggVal;
    if (!singlePost) return null;
    for (const key of keys) {
      const n = coerceCount(parsed[key]);
      if (n !== null) return n;
    }
    return null;
  };

  const existingNotes = Array.isArray(parsed.extraction_notes)
    ? (parsed.extraction_notes as string[])
    : [];

  const avg_likes = resolveAvg(aggregation.avg_likes, "avg_likes", "likes_count", "likes");
  const avg_comments = resolveAvg(aggregation.avg_comments, "avg_comments", "comments_count");
  const avg_reposts = resolveAvg(aggregation.avg_reposts, "avg_reposts", "reposts_count");
  const avg_shares = resolveAvg(aggregation.avg_shares, "avg_shares", "shares");
  const avg_saves = resolveAvg(aggregation.avg_saves, "avg_saves", "saves_count");
  const avg_views = aggregation.avg_views;

  return {
    ...parsed,
    ...aggregation,
    avg_likes,
    avg_comments,
    avg_reposts,
    avg_shares,
    avg_saves,
    avg_views,
    likes_count: avg_likes ?? parsed.likes_count,
    likes: avg_likes ?? parsed.likes,
    comments_count: avg_comments ?? parsed.comments_count,
    reposts_count: avg_reposts ?? parsed.reposts_count,
    shares: avg_shares ?? parsed.shares,
    saves_count: avg_saves ?? parsed.saves_count,
    views_count: avg_views,
    average_views: avg_views,
    extraction_notes: [...existingNotes, ...aggregation.aggregation_notes],
  };
}
