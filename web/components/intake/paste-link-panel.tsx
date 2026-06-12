"use client";

import { useEffect, useState } from "react";
import type { Platform } from "@/lib/types";
import type { IntakePreviewResponse } from "@/lib/intake/types";
import { isIntakePreviewError } from "@/lib/intake/types";

export function isUrlIntakeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_URL_INTAKE === "true";
}

export interface IntakeRecognized {
  platform: Platform;
  handle: string;
}

interface PasteLinkPanelProps {
  url?: string;
  onUrlChange?: (url: string) => void;
  recognized?: IntakeRecognized | null;
  onRecognized?: (result: IntakeRecognized) => void;
  screenshotUploadAnchorId?: string;
}

export function PasteLinkPanel({
  url: urlProp,
  onUrlChange,
  recognized: recognizedProp,
  onRecognized,
  screenshotUploadAnchorId = "screenshot-upload",
}: PasteLinkPanelProps) {
  const [url, setUrl] = useState(urlProp ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recognized, setRecognized] = useState<IntakeRecognized | null>(
    recognizedProp ?? null
  );

  useEffect(() => {
    if (urlProp !== undefined) setUrl(urlProp);
  }, [urlProp]);

  useEffect(() => {
    if (recognizedProp !== undefined) setRecognized(recognizedProp);
  }, [recognizedProp]);

  const updateUrl = (next: string) => {
    setUrl(next);
    onUrlChange?.(next);
  };

  const scrollToScreenshots = () => {
    requestAnimationFrame(() => {
      document
        .getElementById(screenshotUploadAnchorId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const recognizeLink = async () => {
    setError(null);
    setRecognized(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Paste a creator profile link first.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/intake/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const json = (await res.json()) as IntakePreviewResponse;

      if (!res.ok || isIntakePreviewError(json)) {
        setError(
          isIntakePreviewError(json)
            ? json.error
            : "Unsupported or invalid creator profile link"
        );
        return;
      }

      const result: IntakeRecognized = {
        platform: json.platform,
        handle: json.handle,
      };
      setRecognized(result);
      onRecognized?.(result);
      scrollToScreenshots();
    } catch {
      setError("Could not check that link. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mb-8 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-semibold text-neutral-900">
        Paste a creator profile link
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        We&apos;ll recognize the platform and guide what screenshots to add next.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          enterKeyHint="go"
          placeholder="https://www.instagram.com/creator/"
          className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-300"
          value={url}
          onChange={(e) => {
            updateUrl(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void recognizeLink();
            }
          }}
          aria-label="Creator profile URL"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => void recognizeLink()}
          className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {loading ? "Checking…" : "Recognize link"}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-xs text-rose-600" role="alert">
          {error}
        </p>
      )}

      {recognized && (
        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-3 text-sm text-emerald-950">
          <p className="font-medium">
            Link recognized: {recognized.platform} · @{recognized.handle}
          </p>
          <p className="mt-1 text-xs text-emerald-800/90">
            Link recognized — add 1–2 screenshots to confirm metrics.
          </p>
        </div>
      )}
    </section>
  );
}
