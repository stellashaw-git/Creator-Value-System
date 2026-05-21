"use client";

import Link from "next/link";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import {
  BUDGET_RANGES,
  exportWaitlistAsJSON,
  saveWaitlistEntry,
  type BudgetRange,
} from "@/lib/waitlist";

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState("");
  const [budgetRange, setBudgetRange] = useState<BudgetRange>("$1k–$5k / month");
  const [creatorTypes, setCreatorTypes] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !email.includes("@")) {
      return setError("Please enter a valid email.");
    }
    if (!companyName.trim()) return setError("Brand / company name is required.");
    if (!role.trim()) return setError("Your role is required.");
    if (!creatorTypes.trim()) return setError("Tell us what type of creators you work with.");

    const entry = saveWaitlistEntry({
      email: email.trim(),
      companyName: companyName.trim(),
      role: role.trim(),
      budgetRange,
      creatorTypes: creatorTypes.trim(),
      note: note.trim() || undefined,
    });

    try {
      await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
    } catch {
      // local save already succeeded
    }

    setSubmitted(true);
  };

  const copyExport = async () => {
    const data = exportWaitlistAsJSON();
    try {
      await navigator.clipboard.writeText(data);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — try Export JSON instead.");
    }
  };

  const downloadJson = () => {
    const blob = new Blob([exportWaitlistAsJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `worthyiq-waitlist-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto max-w-xl px-6 py-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">
          Early access
        </div>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-neutral-900">
          Join early access
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          Get notified when advanced creator comparison and expanded evaluation limits launch.
        </p>

        {submitted ? (
          <div className="card mt-8 space-y-4">
            <p className="text-sm font-semibold text-emerald-800">
              You&apos;re on the list. We&apos;ll reach out when early access opens.
            </p>
            <p className="text-sm text-neutral-600">
              In the meantime, you can still view creators you already saved or compare them.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/saved" className="btn-secondary">
                Saved Creators
              </Link>
              <Link href="/compare" className="btn-secondary">
                Compare Creators
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="card mt-8 space-y-4">
            <div>
              <label className="label">Email *</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@brand.com"
              />
            </div>
            <div>
              <label className="label">Brand / company name *</label>
              <input
                className="input"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Glow DTC"
              />
            </div>
            <div>
              <label className="label">Your role *</label>
              <input
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Founder, Marketing lead, MCN manager"
              />
            </div>
            <div>
              <label className="label">Monthly influencer marketing budget *</label>
              <select
                className="input"
                value={budgetRange}
                onChange={(e) => setBudgetRange(e.target.value as BudgetRange)}
              >
                {BUDGET_RANGES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">What type of creators do you work with? *</label>
              <input
                className="input"
                value={creatorTypes}
                onChange={(e) => setCreatorTypes(e.target.value)}
                placeholder="e.g. fitness micro-influencers, beauty on Instagram"
              />
            </div>
            <div>
              <label className="label">Anything else? (optional)</label>
              <textarea
                className="input min-h-[80px]"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What would make this tool a must-have for your team?"
              />
            </div>
            {error && (
              <p className="text-sm text-rose-600">{error}</p>
            )}
            <button type="submit" className="btn-primary w-full sm:w-auto">
              Join waitlist →
            </button>
          </form>
        )}

        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 bg-neutral-50/80 p-4">
          <p className="text-xs font-semibold text-neutral-700">Testing export (admin)</p>
          <p className="mt-1 text-xs text-neutral-500">
            Waitlist entries are stored in this browser until a backend is added.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={copyExport} className="btn-secondary !py-1.5 !text-xs">
              {copied ? "Copied!" : "Copy waitlist data"}
            </button>
            <button type="button" onClick={downloadJson} className="btn-secondary !py-1.5 !text-xs">
              Export JSON
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
