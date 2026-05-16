"use client";

import { useEffect, useState } from "react";
import type { OutreachMessages } from "@/lib/types";

type Tab = keyof OutreachMessages;

const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: "brand", label: "Brand collaboration", sub: "Paid product-fit test" },
  { id: "mcn", label: "MCN / partnership", sub: "Representation outreach" },
  { id: "warmDm", label: "Casual warm DM", sub: "First-touch, conversational" },
];

export function OutreachPanel({ outreach }: { outreach: OutreachMessages }) {
  const [active, setActive] = useState<Tab>("brand");
  const [drafts, setDrafts] = useState<OutreachMessages>(outreach);
  const [copied, setCopied] = useState<Tab | null>(null);

  useEffect(() => {
    setDrafts(outreach);
  }, [outreach]);

  const handleCopy = async () => {
    const text = drafts[active];
    try {
      await navigator.clipboard.writeText(text);
      setCopied(active);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // clipboard may be blocked in some environments — fall through silently
    }
  };

  const handleReset = () => {
    setDrafts((d) => ({ ...d, [active]: outreach[active] }));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={`group flex flex-col items-start rounded-lg border px-4 py-2.5 text-left transition ${
                isActive
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-900 hover:border-neutral-400"
              }`}
            >
              <span className="text-sm font-semibold">{t.label}</span>
              <span
                className={`text-[11px] uppercase tracking-wider ${
                  isActive ? "text-white/70" : "text-neutral-500"
                }`}
              >
                {t.sub}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50">
        <textarea
          value={drafts[active]}
          onChange={(e) => setDrafts((d) => ({ ...d, [active]: e.target.value }))}
          className="block w-full resize-y rounded-t-xl border-0 bg-transparent p-4 font-mono text-[13px] leading-relaxed text-neutral-900 focus:outline-none"
          rows={Math.max(8, drafts[active].split("\n").length + 1)}
          spellCheck={false}
        />
        <div className="flex items-center justify-between rounded-b-xl border-t border-neutral-200 bg-white px-4 py-2.5">
          <span className="text-xs text-neutral-500">
            Editable. Drop in your brand name + sign-off before sending.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
            >
              {copied === active ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
