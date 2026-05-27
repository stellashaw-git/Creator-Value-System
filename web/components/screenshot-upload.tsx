"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Platform } from "@/lib/types";
import {
  CLASSIFIER_VERSION,
  refreshTypeDetections,
  type PerImageClassificationHints,
  type ScreenshotTypeDetection,
} from "@/lib/screenshot-type-detect";
import {
  DEFAULT_LABEL_SEQUENCE,
  labelDisplayName,
  SCREENSHOT_LABEL_OPTIONS,
  type ExtractedSignals,
  type ExtractionMeta,
  type ExtractionMode,
  type ScreenshotLabel,
} from "@/lib/extract";
import {
  PLATFORM_OVERRIDE_OPTIONS,
  platformConfidenceLabel,
  type PlatformConfidence,
} from "@/lib/platform-detect";
import {
  compressScreenshot,
  dedupeScreenshotFiles,
} from "@/lib/compress-screenshot";
import {
  buildExtractionCacheKey,
  getCachedExtraction,
  setCachedExtraction,
} from "@/lib/extraction-cache";
import {
  canAttemptExtraction,
  recordExtractionAttempt,
} from "@/lib/extraction-rate-limit";

const MAX_FILES = 5;

function defaultLabelForIndex(i: number): ScreenshotLabel {
  return DEFAULT_LABEL_SEQUENCE[Math.min(i, DEFAULT_LABEL_SEQUENCE.length - 1)];
}

function isImageFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  if (type.startsWith("video/") || type.startsWith("audio/")) return false;
  if (type === "application/pdf" || type.startsWith("text/")) return false;
  if (
    type === "application/octet-stream" ||
    !type ||
    /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif|tiff?)$/i.test(file.name)
  ) {
    return true;
  }
  return true;
}

type UploadBatch = {
  files: File[];
  previews: string[];
  labels: ScreenshotLabel[];
};

const EMPTY_BATCH: UploadBatch = { files: [], previews: [], labels: [] };

type BatchAction =
  | { type: "add"; incoming: File[] }
  | { type: "remove"; index: number }
  | { type: "set_label"; index: number; label: ScreenshotLabel }
  | { type: "clear" };

function batchReducer(state: UploadBatch, action: BatchAction): UploadBatch {
  switch (action.type) {
    case "add": {
      return appendToBatch(state, action.incoming).batch;
    }
    case "remove": {
      URL.revokeObjectURL(state.previews[action.index]);
      return {
        files: state.files.filter((_, i) => i !== action.index),
        previews: state.previews.filter((_, i) => i !== action.index),
        labels: state.labels.filter((_, i) => i !== action.index),
      };
    }
    case "set_label": {
      return {
        ...state,
        labels: state.labels.map((l, i) =>
          i === action.index ? action.label : l
        ),
      };
    }
    case "clear": {
      state.previews.forEach((u) => URL.revokeObjectURL(u));
      return EMPTY_BATCH;
    }
    default:
      return state;
  }
}

function appendToBatch(prev: UploadBatch, incoming: File[]): {
  batch: UploadBatch;
  accepted: File[];
  rejectedNonImage: number;
  truncated: number;
} {
  const images = incoming.filter(isImageFile);
  const rejectedNonImage = incoming.length - images.length;
  const existingKeys = new Set(
    prev.files.map((f) => `${f.name}:${f.size}:${f.lastModified}`)
  );
  const uniqueIncoming: File[] = [];
  for (const file of images) {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    uniqueIncoming.push(file);
  }
  const room = MAX_FILES - prev.files.length;
  const accepted = uniqueIncoming.slice(0, Math.max(0, room));
  const truncated = Math.max(0, uniqueIncoming.length - accepted.length);

  if (accepted.length === 0) {
    return { batch: prev, accepted, rejectedNonImage, truncated };
  }

  const newPreviews = accepted.map((f) => URL.createObjectURL(f));
  const newLabels = accepted.map((_, j) =>
    defaultLabelForIndex(prev.files.length + j)
  );

  return {
    batch: {
      files: [...prev.files, ...accepted],
      previews: [...prev.previews, ...newPreviews],
      labels: [...prev.labels, ...newLabels],
    },
    accepted,
    rejectedNonImage,
    truncated,
  };
}

function labelsToDetectedNames(labels: ScreenshotLabel[]): string[] {
  return labels.map((id) => labelDisplayName(id));
}

function readSelectedFiles(list: FileList | null): File[] {
  if (!list || list.length === 0) return [];
  const selected: File[] = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i] ?? list.item(i);
    if (file) selected.push(file);
  }
  return selected;
}

export function ScreenshotUpload({
  onExtracted,
  onPlatformCorrected,
}: {
  onExtracted: (data: ExtractedSignals, mode: ExtractionMode, meta: ExtractionMeta) => void;
  onPlatformCorrected?: (platform: Platform) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewsRef = useRef<string[]>([]);
  const batchRef = useRef(EMPTY_BATCH);
  const [batch, dispatchBatch] = useReducer(batchReducer, EMPTY_BATCH);
  const { files, previews, labels } = batch;
  previewsRef.current = previews;
  batchRef.current = batch;

  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    data: ExtractedSignals;
    mode: ExtractionMode;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [detectedPlatform, setDetectedPlatform] = useState<Platform | null>(null);
  const [platformConfidence, setPlatformConfidence] =
    useState<PlatformConfidence>("medium");
  const [platformOverride, setPlatformOverride] = useState<Platform | null>(null);
  const [showPlatformChange, setShowPlatformChange] = useState(false);
  const [awaitingPlatformConfirm, setAwaitingPlatformConfirm] = useState(false);
  const [pendingMeta, setPendingMeta] = useState<ExtractionMeta | null>(null);
  const [autoDetectedLabels, setAutoDetectedLabels] = useState<ScreenshotLabel[]>([]);
  const [detectionRuleReasons, setDetectionRuleReasons] = useState<string[]>([]);
  const [labelOverrides, setLabelOverrides] = useState<boolean[]>([]);
  const [labelsAtExtraction, setLabelsAtExtraction] = useState<ScreenshotLabel[]>([]);
  const [labelsDirty, setLabelsDirty] = useState(false);
  const [reExtractNotice, setReExtractNotice] = useState(false);

  const hasExtracted = !!lastResult && !awaitingPlatformConfirm;
  const extractionStale =
    hasExtracted &&
    (labelsDirty ||
      (labelsAtExtraction.length === labels.length &&
        labels.some((l, i) => l !== labelsAtExtraction[i])));

  const extractSignalsDisabled = files.length === 0 || extracting;
  const extractDisabledReason = extracting
    ? "extracting"
    : files.length === 0
      ? "no_files"
      : null;

  useEffect(() => {
    console.log("[Extract signals button]", {
      uploadedFilesLength: files.length,
      isExtracting: extracting,
      disabledReason: extractDisabledReason ?? "none",
      extractSignalsDisabled,
      hasExtracted,
      awaitingPlatformConfirm,
    });
  }, [
    files.length,
    extracting,
    extractSignalsDisabled,
    hasExtracted,
    awaitingPlatformConfirm,
    extractDisabledReason,
  ]);

  useEffect(() => {
    setLabelOverrides((prev) => {
      if (prev.length === files.length) return prev;
      if (prev.length < files.length) {
        return [...prev, ...Array(files.length - prev.length).fill(false)];
      }
      return prev.slice(0, files.length);
    });
  }, [files.length]);

  const ingestSelectedFiles = useCallback((incoming: FileList | File[], source: string) => {
    const arr = Array.from(incoming);
    if (arr.length === 0) return;

    setError(null);
    setAwaitingPlatformConfirm(false);
    setPendingMeta(null);
    setLastResult(null);

    const preview = appendToBatch(batchRef.current, arr);
    const { accepted, rejectedNonImage, truncated } = preview;

    if (accepted.length === 0) {
      if (rejectedNonImage > 0) {
        setError("Could not read selected images — try JPG/PNG or pick again.");
      } else if (truncated > 0) {
        setError(`Maximum ${MAX_FILES} screenshots — extras were ignored.`);
      } else if (
        arr.length > 0 &&
        preview.batch.files.length >= MAX_FILES &&
        batchRef.current.files.length >= MAX_FILES
      ) {
        setError(`Maximum ${MAX_FILES} screenshots — remove one to add more.`);
      } else if (arr.length > 0) {
        console.log("[Screenshot upload] duplicate pick ignored", { source });
      }
      return;
    }

    dispatchBatch({ type: "add", incoming: arr });

    console.log("[Screenshot upload]", {
      source,
      selectedCount: arr.length,
      acceptedCount: accepted.length,
      nextUploadedFilesLength: preview.batch.files.length,
    });
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const syncFromInput = (source: string) => {
      const selected = readSelectedFiles(input.files);
      if (selected.length === 0) return;
      ingestSelectedFiles(selected, source);
    };

    const onNativePick = () => syncFromInput("native-change");
    input.addEventListener("change", onNativePick);
    input.addEventListener("input", onNativePick);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      window.setTimeout(() => syncFromInput("visibility"), 300);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      input.removeEventListener("change", onNativePick);
      input.removeEventListener("input", onNativePick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ingestSelectedFiles]);

  useEffect(() => {
    return () => {
      previewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const effectivePlatform = platformOverride ?? detectedPlatform;

  const addFiles = useCallback((incoming: FileList | File[]) => {
    ingestSelectedFiles(incoming, "react-add");
  }, [ingestSelectedFiles]);

  const removeAt = (i: number) => {
    dispatchBatch({ type: "remove", index: i });
    setLabelOverrides((prev) => prev.filter((_, idx) => idx !== i));
    setAutoDetectedLabels((prev) => prev.filter((_, idx) => idx !== i));
    setDetectionRuleReasons((prev) => prev.filter((_, idx) => idx !== i));
  };

  const setFinalLabelAt = (i: number, label: ScreenshotLabel) => {
    const baseline = labelsAtExtraction[i] ?? autoDetectedLabels[i] ?? labels[i];
    dispatchBatch({ type: "set_label", index: i, label });
    setLabelOverrides((prev) => {
      const next = [...prev];
      next[i] = true;
      return next;
    });
    if (hasExtracted && label !== baseline) {
      setLabelsDirty(true);
      setReExtractNotice(false);
    }
  };

  const clearAll = () => {
    dispatchBatch({ type: "clear" });
    if (inputRef.current) inputRef.current.value = "";
    setLastResult(null);
    setWarning(null);
    setError(null);
    setDetectedPlatform(null);
    setPlatformOverride(null);
    setShowPlatformChange(false);
    setAwaitingPlatformConfirm(false);
    setPendingMeta(null);
    setAutoDetectedLabels([]);
    setDetectionRuleReasons([]);
    setLabelOverrides([]);
    setLabelsAtExtraction([]);
    setLabelsDirty(false);
    setReExtractNotice(false);
  };

  const finishExtraction = (
    data: ExtractedSignals,
    mode: ExtractionMode,
    meta: ExtractionMeta
  ) => {
    onExtracted(data, mode, meta);
    setAwaitingPlatformConfirm(false);
    setPendingMeta(null);
  };

  const applyExtractionResult = (
    data: ExtractedSignals,
    mode: ExtractionMode,
    labelPayload: ScreenshotLabel[],
    typeDetections?: ScreenshotTypeDetection[],
    finalTypes?: ScreenshotLabel[]
  ) => {
    const platform = (data.platform as Platform | null) ?? null;
    const confidence = data.platform_confidence;
    const meta: ExtractionMeta = {
      labels: finalTypes ?? labelPayload,
      detectedPlatform: platform,
      platformConfidence: confidence,
      platformOverride: platformOverride,
      screenshotTypesDetected: typeDetections
        ? typeDetections.map((d) => labelDisplayName(d.auto_detected_type))
        : labelsToDetectedNames(labelPayload),
      typeDetections,
      finalTypes: finalTypes ?? labelPayload,
    };

    setDetectedPlatform(platform);
    setPlatformConfidence(confidence);
    setLastResult({ data, mode });

    if (confidence === "low") {
      setAwaitingPlatformConfirm(true);
      setPendingMeta(meta);
      setShowPlatformChange(true);
      onExtracted(data, mode, meta);
      return;
    }

    finishExtraction(data, mode, meta);
  };

  const handleExtract = async (options?: { reExtract?: boolean }) => {
    if (files.length === 0) return;
    const reExtract = options?.reExtract === true;
    setExtracting(true);
    setError(null);
    if (!reExtract) setWarning(null);
    setAwaitingPlatformConfirm(false);
    setPendingMeta(null);
    try {
      const labelPayload = labels.length
        ? labels
        : files.map((_, i) => defaultLabelForIndex(i));
      const labelsChanged =
        labelsDirty ||
        labelsAtExtraction.length !== labelPayload.length ||
        labelPayload.some((l, i) => l !== labelsAtExtraction[i]);
      const cacheKey = buildExtractionCacheKey(
        files,
        labelPayload,
        platformOverride
      );

      const cached = getCachedExtraction(cacheKey);
      if (cached && !reExtract) {
        console.log("[Screenshot extract] cache hit");
        applyCachedExtraction(cached, labelPayload, reExtract);
        return;
      }

      const rate = canAttemptExtraction();
      if (!rate.ok) {
        setError(rate.reason ?? "Extraction rate limit reached.");
        return;
      }

      const uniqueFiles = dedupeScreenshotFiles(files);
      const compressed = await Promise.all(uniqueFiles.map(compressScreenshot));
      const fd = new FormData();
      for (const f of compressed) fd.append("files", f);
      fd.append("image_labels", JSON.stringify(labelPayload));
      fd.append("image_names", JSON.stringify(files.map((f) => f.name)));
      if (reExtract) {
        fd.append("re_extract", "true");
        fd.append("label_overrides", JSON.stringify(labelPayload.map(() => true)));
        fd.append("labels_changed", labelsChanged ? "true" : "false");
      } else {
        fd.append(
          "label_overrides",
          JSON.stringify(labelOverrides.slice(0, files.length))
        );
      }
      if (platformOverride) {
        fd.append("platform_override", platformOverride);
      }

      recordExtractionAttempt();
      const res = await fetch("/api/extract-screenshot", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok && !json.extraction) {
        throw new Error(json.error || "Extraction failed.");
      }
      if (json.usage && process.env.NODE_ENV === "development") {
        console.log("[Screenshot extract] openai usage", json.usage);
        if (typeof json.usage.estimated_cost_usd === "number") {
          console.log(
            `[Screenshot extract] estimated cost: $${json.usage.estimated_cost_usd.toFixed(4)} USD`
          );
        }
      }

      setCachedExtraction(cacheKey, {
        extraction: json.extraction as ExtractedSignals,
        mode: (json.mode as ExtractionMode) || "openai",
        type_detections: refreshTypeDetections(
          json.type_detections,
          json.per_image_hints
        ),
        final_types: json.final_types,
        per_image_hints: json.per_image_hints,
        warning: json.warning,
      });

      processExtractionResponse(json, labelPayload, reExtract);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExtracting(false);
    }
  };

  const processExtractionResponse = (
    json: {
      extraction: ExtractedSignals;
      mode?: ExtractionMode;
      warning?: string;
      type_detections?: ScreenshotTypeDetection[];
      final_types?: ScreenshotLabel[];
      per_image_hints?: PerImageClassificationHints[];
    },
    labelPayload: ScreenshotLabel[],
    reExtract: boolean
  ) => {
    const typeDetections = refreshTypeDetections(
      json.type_detections,
      json.per_image_hints
    );
    const finalTypes = json.final_types;

    console.log("[Screenshot type detection] extraction completed", {
      classifier_version: CLASSIFIER_VERSION,
    });

    if (typeDetections?.length) {
      typeDetections.forEach((det, i) => {
        console.log("[Screenshot type detection] detectedType assigned", {
          index: i,
          detectedType: det.auto_detected_type,
        });
      });
      setAutoDetectedLabels(typeDetections.map((d) => d.auto_detected_type));
      setDetectionRuleReasons(
        typeDetections.map((d) => d.classification_reason ?? "unknown")
      );
    }

    const syncedLabels = labelPayload.map((label, i) => {
      if (reExtract) return label;
      const det = typeDetections?.[i];
      if (labelOverrides[i]) return label;
      if (det) return det.auto_detected_type;
      return finalTypes?.[i] ?? label;
    });

    syncedLabels.forEach((label, i) => {
      dispatchBatch({ type: "set_label", index: i, label });
    });

    syncedLabels.forEach((finalType, i) => {
      console.log("[Screenshot type detection] finalType initialized", {
        index: i,
        finalType,
        detectedType: typeDetections?.[i]?.auto_detected_type,
      });
    });

    setLabelsAtExtraction([...syncedLabels]);
    setLabelsDirty(false);
    setReExtractNotice(reExtract);

    const result = {
      data: json.extraction,
      mode: (json.mode as ExtractionMode) || "openai",
    };
    if (json.warning) setWarning(json.warning);
    applyExtractionResult(
      result.data,
      result.mode,
      syncedLabels,
      typeDetections,
      syncedLabels
    );
  };

  const applyCachedExtraction = (
    cached: {
      extraction: ExtractedSignals;
      mode: ExtractionMode;
      type_detections?: ScreenshotTypeDetection[];
      final_types?: ScreenshotLabel[];
      per_image_hints?: PerImageClassificationHints[];
      warning?: string;
    },
    labelPayload: ScreenshotLabel[],
    reExtract: boolean
  ) => {
    processExtractionResponse(
      {
        extraction: cached.extraction,
        mode: cached.mode,
        warning: cached.warning,
        type_detections: cached.type_detections,
        final_types: cached.final_types,
        per_image_hints: cached.per_image_hints,
      },
      labelPayload,
      reExtract
    );
  };

  const confirmLowConfidencePlatform = () => {
    if (!lastResult || !pendingMeta) return;
    const platform = platformOverride ?? detectedPlatform;
    const data: ExtractedSignals = {
      ...lastResult.data,
      platform,
    };
    const meta: ExtractionMeta = {
      ...pendingMeta,
      detectedPlatform: platform,
      platformOverride: platformOverride,
      platformConfidence: platformConfidence,
    };
    finishExtraction(data, lastResult.mode, meta);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  return (
    <div className="upload-surface">
      {files.length > 0 && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-semibold text-neutral-500 hover:text-neutral-900"
          >
            Clear all
          </button>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-14 text-center transition sm:py-20 ${
          dragOver
            ? "border-neutral-900 bg-neutral-900/[0.02]"
            : "border-neutral-200 bg-white/60 hover:border-neutral-400"
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-900 text-lg text-white shadow-md">
            ↑
          </div>
          <div className="text-base font-semibold text-neutral-900">
            Upload creator screenshots
          </div>
          <div className="max-w-sm text-xs leading-relaxed text-neutral-500">
            We&apos;ll detect the platform and extract visible creator signals automatically.
          </div>
          <div className="text-[11px] text-neutral-400">
            {files.length > 0
              ? `${files.length} screenshot${files.length === 1 ? "" : "s"} uploaded`
              : `More complete screenshots improve accuracy · up to ${MAX_FILES} images`}
          </div>
          <div className="mt-2 w-full max-w-sm px-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              disabled={extracting}
              className="block w-full text-sm text-neutral-700 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-neutral-900 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-neutral-800 disabled:opacity-50"
              style={{ fontSize: 16 }}
              aria-label="Upload creator screenshots"
            />
          </div>
        </div>
      </div>

      <details className="mt-4 group">
        <summary className="cursor-pointer text-xs font-medium text-neutral-500 hover:text-neutral-800">
          What screenshots work best?
        </summary>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-neutral-500">
          <li>Creator profile — username, bio, followers, niche</li>
          <li>Recent post — likes, comments, shares, views if visible</li>
          <li>Comment section — purchase questions, sentiment</li>
          <li>Analytics — saves, reach, impressions when available</li>
        </ul>
      </details>

      {files.length > 0 && (
        <p className="mt-4 text-center text-sm font-medium text-neutral-800">
          {files.length} screenshot{files.length === 1 ? "" : "s"} uploaded
        </p>
      )}

      {files.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {files.map((f, i) => {
            const lab = labels[i] ?? defaultLabelForIndex(i);
            const auto = autoDetectedLabels[i];
            const ruleReason = detectionRuleReasons[i];
            return (
              <li
                key={`${f.name}-${f.size}-${f.lastModified}-${i}`}
                className="group relative overflow-hidden rounded-lg border border-neutral-200 bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previews[i]}
                  alt={f.name}
                  className="h-28 w-full object-cover bg-neutral-100"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "data:image/svg+xml," +
                      encodeURIComponent(
                        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect fill="#f5f5f5" width="100%" height="100%"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#737373" font-size="11">Preview</text></svg>'
                      );
                  }}
                />
                <div className="px-2 py-1.5">
                  <p className="truncate text-[10px] font-medium text-neutral-700">{f.name}</p>
                  {hasExtracted ? (
                    <div className="mt-1 space-y-1">
                      <p className="text-[10px] text-neutral-500">
                        Detected: {labelDisplayName(auto ?? "other")}
                      </p>
                      {(ruleReason || auto != null) && (
                        <p className="text-[9px] leading-snug text-amber-800">
                          classification reason: {ruleReason ?? "unknown"}
                        </p>
                      )}
                      <p className="text-[9px] leading-snug text-amber-800/70">
                        classifier_version: {CLASSIFIER_VERSION}
                      </p>
                      <p className="text-[10px] font-medium text-neutral-800">
                        Final: {labelDisplayName(lab)}
                        {auto != null && lab !== auto && (
                          <span className="ml-1 font-normal text-amber-700">· corrected</span>
                        )}
                      </p>
                      <label className="block text-[10px] text-neutral-500">
                        Change type
                        <select
                          className="mt-0.5 w-full rounded border border-neutral-200 bg-white px-1 py-0.5 text-[10px] font-medium text-neutral-800"
                          value={lab}
                          suppressHydrationWarning
                          onChange={(e) =>
                            setFinalLabelAt(i, e.target.value as ScreenshotLabel)
                          }
                          aria-label={`Final screenshot type for ${f.name}`}
                        >
                          {SCREENSHOT_LABEL_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <p className="text-[10px] text-neutral-400">
                      Type detected after extraction
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded-full bg-neutral-900/80 text-xs font-bold text-white group-hover:flex"
                  aria-label={`Remove ${f.name}`}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {extractionStale && (
        <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3">
          <p className="text-xs text-amber-950">
            Screenshot labels changed — re-extract to update extracted signals.
          </p>
          <button
            type="button"
            onClick={() => handleExtract({ reExtract: true })}
            disabled={extracting || awaitingPlatformConfirm}
            className="btn-primary mt-3 !py-2 !px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {extracting ? "Re-extracting…" : "Re-extract with updated labels"}
          </button>
        </div>
      )}

      {(effectivePlatform || lastResult) && !awaitingPlatformConfirm && (
        <PlatformLine
          platform={effectivePlatform}
          confidence={platformConfidence}
          showChange={showPlatformChange}
          onToggleChange={() => setShowPlatformChange((v) => !v)}
          override={platformOverride}
          onOverrideChange={(p) => {
            setPlatformOverride(p);
            setDetectedPlatform(p);
          }}
        />
      )}

      {awaitingPlatformConfirm && (
        <div className="mt-4 rounded-xl bg-amber-50/90 px-4 py-3 ring-1 ring-amber-200">
          <p className="text-sm font-medium text-amber-950">
            Platform detection is uncertain — confirm before continuing
          </p>
          {lastResult?.data.platform_detection_notes && (
            <p className="mt-1 text-xs text-amber-900/80">
              {lastResult.data.platform_detection_notes}
            </p>
          )}
          <PlatformLine
            platform={platformOverride ?? detectedPlatform}
            confidence={platformConfidence}
            showChange
            onToggleChange={() => {}}
            override={platformOverride}
            onOverrideChange={(p) => {
              setPlatformOverride(p);
              onPlatformCorrected?.(p);
            }}
          />
          <button
            type="button"
            onClick={confirmLowConfidencePlatform}
            className="btn-primary mt-3 !py-2 !px-4 text-sm"
          >
            Confirm platform &amp; continue
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-neutral-500">
          {files.length === 0
            ? extractDisabledReason === "no_files"
              ? "Choose files above — Extract enables once screenshots are loaded."
              : ""
            : `${files.length} screenshot${files.length === 1 ? "" : "s"} uploaded`}
        </div>
        {!hasExtracted && (
          <button
            type="button"
            onClick={() => handleExtract()}
            disabled={extractSignalsDisabled}
            aria-disabled={extractSignalsDisabled}
            title={
              extractDisabledReason === "no_files"
                ? "Upload at least one screenshot first"
                : extractDisabledReason === "extracting"
                  ? "Extraction in progress"
                  : undefined
            }
            className="btn-primary !py-2.5 !px-5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {extracting ? "Detecting & extracting…" : "Extract signals"}
          </button>
        )}
      </div>

      {reExtractNotice && !extractionStale && (
        <p className="mt-3 text-xs font-medium text-emerald-800">
          Re-extracted using updated screenshot labels.
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </div>
      )}

      {warning && (
        <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800 ring-1 ring-amber-200">
          {warning}
        </div>
      )}

      {lastResult && !awaitingPlatformConfirm && (
        <ExtractionSummary result={lastResult} platform={effectivePlatform} />
      )}
    </div>
  );
}

function PlatformLine({
  platform,
  confidence,
  showChange,
  onToggleChange,
  override,
  onOverrideChange,
}: {
  platform: Platform | null;
  confidence: PlatformConfidence;
  showChange: boolean;
  onToggleChange: () => void;
  override: Platform | null;
  onOverrideChange: (p: Platform) => void;
}) {
  if (!platform) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
      <span>
        Detected platform:{" "}
        <span className="font-semibold text-neutral-900">{platform}</span>
        {" · "}
        {platformConfidenceLabel(confidence)}
        {override ? " (corrected)" : ""}
      </span>
      {!showChange ? (
        <button
          type="button"
          onClick={onToggleChange}
          className="font-semibold text-neutral-500 hover:text-neutral-900"
        >
          Change
        </button>
      ) : (
        <select
          className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-xs font-medium"
          value={override ?? platform}
          onChange={(e) => onOverrideChange(e.target.value as Platform)}
        >
          {PLATFORM_OVERRIDE_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function ExtractionSummary({
  result,
  platform,
}: {
  result: { data: ExtractedSignals; mode: ExtractionMode };
  platform: Platform | null;
}) {
  const { data, mode } = result;
  const modeBadge =
    mode === "openai"
      ? { label: "Vision API", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" }
      : mode === "mock_fallback"
        ? { label: "Mock fallback", tone: "bg-amber-50 text-amber-800 ring-amber-200" }
        : { label: "Demo mock", tone: "bg-neutral-100 text-neutral-700 ring-neutral-200" };

  const aggregated = data.recent_post_count > 0;
  const likes = aggregated ? data.avg_likes : data.likes_count;
  const comments = aggregated ? data.avg_comments : data.comments_count;
  const reposts = aggregated ? data.avg_reposts : data.reposts_count;
  const shares = aggregated ? data.avg_shares : data.shares;
  const saves = aggregated ? data.avg_saves : data.saves_count;

  const metricBits: string[] = [];
  if (platform) metricBits.push(platform);
  if (likes != null) metricBits.push(`${likes.toLocaleString()} avg likes`);
  if (comments != null) metricBits.push(`${comments} avg comments`);
  if (reposts != null) metricBits.push(`${reposts} avg reposts`);
  if (shares != null) metricBits.push(`${shares} avg shares`);
  if (saves != null) metricBits.push(`${saves} avg saves`);

  return (
    <div className="mt-5 rounded-xl bg-emerald-50/80 px-4 py-3 ring-1 ring-emerald-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-emerald-900">
          Signals extracted — review below if needed, then run evaluation.
        </p>
        <span className={`badge ring-1 ${modeBadge.tone}`}>{modeBadge.label}</span>
      </div>
      {aggregated && (
        <p className="mt-2 text-xs font-medium text-emerald-900/90">
          Based on {data.recent_post_count} recent post screenshot
          {data.recent_post_count === 1 ? "" : "s"}
        </p>
      )}
      {metricBits.length > 0 && (
        <p className="mt-2 text-xs text-emerald-800/90">{metricBits.join(" · ")}</p>
      )}
    </div>
  );
}
