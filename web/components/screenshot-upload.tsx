"use client";

import { useEffect, useRef, useState } from "react";
import type { Platform } from "@/lib/types";
import type {
  ExtractedSignals,
  ExtractionMeta,
  ExtractionMode,
  ScreenshotLabel,
} from "@/lib/extract";
import {
  DEFAULT_LABEL_SEQUENCE,
  labelDisplayName,
  SCREENSHOT_LABEL_OPTIONS,
} from "@/lib/extract";
import {
  PLATFORM_OVERRIDE_OPTIONS,
  platformConfidenceLabel,
  type PlatformConfidence,
} from "@/lib/platform-detect";

const MAX_FILES = 5;
const MAX_DIM = 1280;
const COMPRESS_QUALITY = 0.82;

async function compress(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 350 * 1024) return file;
  try {
    const img = await createImageBitmap(file);
    const ratio = Math.min(MAX_DIM / img.width, MAX_DIM / img.height, 1);
    if (ratio === 1 && file.size < 900 * 1024) return file;
    const w = Math.max(1, Math.round(img.width * ratio));
    const h = Math.max(1, Math.round(img.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", COMPRESS_QUALITY);
    });
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}

function defaultLabelForIndex(i: number): ScreenshotLabel {
  return DEFAULT_LABEL_SEQUENCE[Math.min(i, DEFAULT_LABEL_SEQUENCE.length - 1)];
}

function labelsToDetectedNames(labels: ScreenshotLabel[]): string[] {
  return labels.map((id) => labelDisplayName(id));
}

export function ScreenshotUpload({
  onExtracted,
  onPlatformCorrected,
}: {
  onExtracted: (data: ExtractedSignals, mode: ExtractionMode, meta: ExtractionMeta) => void;
  /** Fired when user corrects detected platform after extraction. */
  onPlatformCorrected?: (platform: Platform) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [labels, setLabels] = useState<ScreenshotLabel[]>([]);
  const [editingLabelIdx, setEditingLabelIdx] = useState<number | null>(null);
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

  useEffect(() => {
    return () => previews.forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectivePlatform = platformOverride ?? detectedPlatform;

  const addFiles = (incoming: FileList | File[]) => {
    setError(null);
    setAwaitingPlatformConfirm(false);
    setPendingMeta(null);
    setLastResult(null);
    const arr = Array.from(incoming).filter((f) => f.type.startsWith("image/"));
    const room = MAX_FILES - files.length;
    const accepted = arr.slice(0, Math.max(0, room));
    if (arr.length > accepted.length) {
      setError(`Maximum ${MAX_FILES} screenshots — extras were ignored.`);
    }
    if (accepted.length === 0) return;
    const newPreviews = accepted.map((f) => URL.createObjectURL(f));
    const startIdx = files.length;
    const newLabels = accepted.map((_, j) => defaultLabelForIndex(startIdx + j));
    setFiles((prev) => [...prev, ...accepted]);
    setPreviews((prev) => [...prev, ...newPreviews]);
    setLabels((prev) => [...prev, ...newLabels]);
  };

  const removeAt = (i: number) => {
    URL.revokeObjectURL(previews[i]);
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
    setPreviews((prev) => prev.filter((_, idx) => idx !== i));
    setLabels((prev) => prev.filter((_, idx) => idx !== i));
    if (editingLabelIdx === i) setEditingLabelIdx(null);
  };

  const setLabelAt = (i: number, label: ScreenshotLabel) => {
    setLabels((prev) => prev.map((l, idx) => (idx === i ? label : l)));
    setEditingLabelIdx(null);
  };

  const clearAll = () => {
    previews.forEach((u) => URL.revokeObjectURL(u));
    setFiles([]);
    setPreviews([]);
    setLabels([]);
    setLastResult(null);
    setWarning(null);
    setError(null);
    setDetectedPlatform(null);
    setPlatformOverride(null);
    setShowPlatformChange(false);
    setAwaitingPlatformConfirm(false);
    setPendingMeta(null);
    setEditingLabelIdx(null);
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
    labelPayload: ScreenshotLabel[]
  ) => {
    const platform = (data.platform as Platform | null) ?? null;
    const confidence = data.platform_confidence;
    const autoDetected = files.map((_, i) => defaultLabelForIndex(i));
    const meta: ExtractionMeta = {
      labels: labelPayload,
      detectedPlatform: platform,
      platformConfidence: confidence,
      platformOverride: platformOverride,
      screenshotTypesDetected: labelsToDetectedNames(autoDetected),
    };

    setDetectedPlatform(platform);
    setPlatformConfidence(confidence);
    setLastResult({ data, mode });

    if (confidence === "low") {
      setAwaitingPlatformConfirm(true);
      setPendingMeta(meta);
      setShowPlatformChange(true);
      return;
    }

    finishExtraction(data, mode, meta);
  };

  const handleExtract = async () => {
    if (files.length === 0) return;
    setExtracting(true);
    setError(null);
    setWarning(null);
    setAwaitingPlatformConfirm(false);
    setPendingMeta(null);
    try {
      const compressed = await Promise.all(files.map(compress));
      const fd = new FormData();
      for (const f of compressed) fd.append("files", f);
      const labelPayload = labels.length
        ? labels
        : files.map((_, i) => defaultLabelForIndex(i));
      fd.append("image_labels", JSON.stringify(labelPayload));
      if (platformOverride) {
        fd.append("platform_override", platformOverride);
      }
      const res = await fetch("/api/extract-screenshot", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok && !json.extraction) {
        throw new Error(json.error || "Extraction failed.");
      }
      const result = {
        data: json.extraction as ExtractedSignals,
        mode: (json.mode as ExtractionMode) || "openai",
      };
      if (json.warning) setWarning(json.warning);
      applyExtractionResult(result.data, result.mode, labelPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExtracting(false);
    }
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

      <label
        htmlFor="screenshot-input"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-14 text-center transition sm:py-20 ${
          dragOver
            ? "border-neutral-900 bg-neutral-900/[0.02]"
            : "border-neutral-200 bg-white/60 hover:border-neutral-400"
        }`}
      >
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
          More complete screenshots improve accuracy · up to {MAX_FILES} images
        </div>
        <input
          id="screenshot-input"
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.currentTarget.value = "";
          }}
        />
      </label>

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
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {files.map((f, i) => {
            const lab = labels[i] ?? defaultLabelForIndex(i);
            const editing = editingLabelIdx === i;
            return (
              <li
                key={`${f.name}-${i}`}
                className="group relative overflow-hidden rounded-lg border border-neutral-200 bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previews[i]}
                  alt={f.name}
                  className="h-28 w-full object-cover"
                />
                <div className="px-2 py-1.5">
                  {editing ? (
                    <select
                      className="w-full rounded border border-neutral-200 bg-white px-1 py-0.5 text-[10px] font-medium text-neutral-700"
                      value={lab}
                      onChange={(e) =>
                        setLabelAt(i, e.target.value as ScreenshotLabel)
                      }
                      aria-label={`Screenshot type for ${f.name}`}
                    >
                      {SCREENSHOT_LABEL_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[10px] text-neutral-600">
                      Detected: {labelDisplayName(lab)}{" "}
                      <button
                        type="button"
                        className="font-semibold text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline"
                        onClick={() => setEditingLabelIdx(i)}
                      >
                        Change
                      </button>
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
          {files.length === 0 ? "" : `${files.length} ready`}
        </div>
        <button
          type="button"
          onClick={handleExtract}
          disabled={files.length === 0 || extracting || awaitingPlatformConfirm}
          className="btn-primary !py-2.5 !px-5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {extracting ? "Detecting & extracting…" : "Extract signals"}
        </button>
      </div>

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

  const metricBits: string[] = [];
  if (platform) metricBits.push(platform);
  if (data.likes_count != null) metricBits.push(`${data.likes_count.toLocaleString()} likes`);
  if (data.comments_count != null) metricBits.push(`${data.comments_count} comments`);
  if (data.reposts_count != null) metricBits.push(`${data.reposts_count} reposts`);
  if (data.shares != null) metricBits.push(`${data.shares} shares`);
  if (data.saves_count != null) metricBits.push(`${data.saves_count} saves`);

  return (
    <div className="mt-5 rounded-xl bg-emerald-50/80 px-4 py-3 ring-1 ring-emerald-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-emerald-900">
          Signals extracted — review below if needed, then run evaluation.
        </p>
        <span className={`badge ring-1 ${modeBadge.tone}`}>{modeBadge.label}</span>
      </div>
      {metricBits.length > 0 && (
        <p className="mt-2 text-xs text-emerald-800/90">{metricBits.join(" · ")}</p>
      )}
    </div>
  );
}
