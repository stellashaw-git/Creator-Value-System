import type { ExtractionMode, ScreenshotLabel } from "@/lib/extract";
import {
  CLASSIFIER_VERSION,
  type PerImageClassificationHints,
  type ScreenshotTypeDetection,
} from "@/lib/screenshot-type-detect";
import type { ExtractedSignals } from "@/lib/extract";

export interface CachedExtraction {
  extraction: ExtractedSignals;
  mode: ExtractionMode;
  type_detections?: ScreenshotTypeDetection[];
  final_types?: ScreenshotLabel[];
  per_image_hints?: PerImageClassificationHints[];
  warning?: string;
}

const STORAGE_KEY = `worthyiq.extraction-cache.${CLASSIFIER_VERSION}.gridviews-v3`;
const MAX_ENTRIES = 12;

const isBrowser = (): boolean => typeof window !== "undefined";

type CacheStore = Record<string, CachedExtraction>;

function readStore(): CacheStore {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CacheStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: CacheStore): void {
  if (!isBrowser()) return;
  try {
    const keys = Object.keys(store);
    if (keys.length > MAX_ENTRIES) {
      const trimmed = keys.slice(keys.length - MAX_ENTRIES);
      const next: CacheStore = {};
      for (const key of trimmed) next[key] = store[key];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // quota / disabled
  }
}

export function buildExtractionCacheKey(
  files: Array<{ name: string; size: number; lastModified: number }>,
  labels: ScreenshotLabel[],
  platformOverride?: string | null
): string {
  const filePart = files.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join("|");
  const labelPart = labels.join(",");
  const platformPart = platformOverride ?? "";
  return `${filePart}::${labelPart}::${platformPart}::${CLASSIFIER_VERSION}`;
}

export function getCachedExtraction(key: string): CachedExtraction | null {
  return readStore()[key] ?? null;
}

export function setCachedExtraction(key: string, value: CachedExtraction): void {
  const store = readStore();
  store[key] = value;
  writeStore(store);
}
