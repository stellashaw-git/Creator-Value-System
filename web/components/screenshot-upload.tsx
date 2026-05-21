"use client";

import { useEffect, useRef, useState } from "react";
import type { ExtractedSignals, ExtractionMode } from "@/lib/extract";

const MAX_FILES = 5;
const MAX_DIM = 1280;
const COMPRESS_QUALITY = 0.82;

/**
 * Compress an image client-side using the canvas API. Keeps payloads small
 * and snappy without adding any JS dependency. Returns the original file
 * untouched if compression fails or is unnecessary.
 */
async function compress(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 350 * 1024) return file; // already tiny
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

const CONFIDENCE_TONE: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  medium: "bg-amber-50 text-amber-800 ring-amber-200",
  low: "bg-rose-50 text-rose-800 ring-rose-200",
};

export function ScreenshotUpload({
  onExtracted,
}: {
  onExtracted: (data: ExtractedSignals, mode: ExtractionMode) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    data: ExtractedSignals;
    mode: ExtractionMode;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Cleanup object URLs on unmount.
  useEffect(() => {
    return () => previews.forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (incoming: FileList | File[]) => {
    setError(null);
    const arr = Array.from(incoming).filter((f) => f.type.startsWith("image/"));
    const room = MAX_FILES - files.length;
    const accepted = arr.slice(0, Math.max(0, room));
    if (arr.length > accepted.length) {
      setError(`Maximum ${MAX_FILES} screenshots — extras were ignored.`);
    }
    if (accepted.length === 0) return;
    const newPreviews = accepted.map((f) => URL.createObjectURL(f));
    setFiles((prev) => [...prev, ...accepted]);
    setPreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeAt = (i: number) => {
    URL.revokeObjectURL(previews[i]);
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
    setPreviews((prev) => prev.filter((_, idx) => idx !== i));
  };

  const clearAll = () => {
    previews.forEach((u) => URL.revokeObjectURL(u));
    setFiles([]);
    setPreviews([]);
    setLastResult(null);
    setWarning(null);
    setError(null);
  };

  const handleExtract = async () => {
    if (files.length === 0) return;
    setExtracting(true);
    setError(null);
    setWarning(null);
    try {
      const compressed = await Promise.all(files.map(compress));
      const fd = new FormData();
      for (const f of compressed) fd.append("files", f);
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
      setLastResult(result);
      if (json.warning) setWarning(json.warning);
      onExtracted(result.data, result.mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExtracting(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  return (
    <div className="upload-surface">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-neutral-600">
          Profile, posts, or comments · up to {MAX_FILES} images
        </p>
        {files.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-semibold text-neutral-500 hover:text-neutral-900"
          >
            Clear
          </button>
        )}
      </div>

      <label
        htmlFor="screenshot-input"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`mt-6 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-14 text-center transition sm:py-20 ${
          dragOver
            ? "border-neutral-900 bg-neutral-900/[0.02]"
            : "border-neutral-200 bg-white/60 hover:border-neutral-400"
        }`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-900 text-lg text-white shadow-md">
          ↑
        </div>
        <div className="text-base font-semibold text-neutral-900">
          Drop creator screenshots
        </div>
        <div className="text-xs text-neutral-500">
          or click to browse · PNG / JPEG
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

      {/* Previews */}
      {files.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {files.map((f, i) => (
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
                <div className="truncate text-[11px] font-medium text-neutral-700">
                  {f.name}
                </div>
                <div className="text-[10px] text-neutral-500">
                  {(f.size / 1024).toFixed(0)} KB
                </div>
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
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-neutral-500">
          {files.length === 0
            ? ""
            : `${files.length} ready`}
        </div>
        <button
          type="button"
          onClick={handleExtract}
          disabled={files.length === 0 || extracting}
          className="btn-primary !py-2.5 !px-5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {extracting ? "Extracting…" : "Extract signals"}
        </button>
      </div>

      {/* Errors */}
      {error && (
        <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </div>
      )}

      {/* Warning (e.g. mock fallback) */}
      {warning && (
        <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800 ring-1 ring-amber-200">
          {warning}
        </div>
      )}

      {/* Post-extraction summary */}
      {lastResult && <ExtractionSummary result={lastResult} />}
    </div>
  );
}

function ExtractionSummary({
  result,
}: {
  result: { data: ExtractedSignals; mode: ExtractionMode };
}) {
  const { data, mode } = result;
  const modeBadge =
    mode === "openai"
      ? { label: "Vision API", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" }
      : mode === "mock_fallback"
        ? { label: "Mock fallback", tone: "bg-amber-50 text-amber-800 ring-amber-200" }
        : { label: "Demo mock", tone: "bg-neutral-100 text-neutral-700 ring-neutral-200" };

  return (
    <div className="mt-5 rounded-xl bg-emerald-50/80 px-4 py-3 ring-1 ring-emerald-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-emerald-900">
          Signals extracted — review metrics below, then run evaluation.
        </p>
        <span className={`badge ring-1 ${modeBadge.tone}`}>{modeBadge.label}</span>
      </div>
      {data.missing_fields.length > 0 && (
        <p className="mt-2 text-xs text-emerald-800/90">
          Still needed: {data.missing_fields.join(", ")}
        </p>
      )}
    </div>
  );
}
