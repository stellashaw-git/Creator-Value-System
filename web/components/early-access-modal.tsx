"use client";

import { useEffect, useState } from "react";
import { useMounted } from "@/lib/use-mounted";
import {
  dismissEarlyAccessPrompt,
  EARLY_ACCESS_ROLES,
  shouldShowEarlyAccessPrompt,
  submitEarlyAccess,
  type EarlyAccessRole,
} from "@/lib/early-access";
import { getTrialUsage, isDevEvaluationLimitBypassed } from "@/lib/trial";

export function EarlyAccessModal({
  refreshKey = 0,
  onSubmitted,
}: {
  refreshKey?: number;
  onSubmitted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState<EarlyAccessRole | "">("");
  const [challenge, setChallenge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const mounted = useMounted();

  useEffect(() => {
    if (!mounted) return;
    if (isDevEvaluationLimitBypassed()) {
      setOpen(false);
      return;
    }
    const { free_limit_reached } = getTrialUsage();
    setOpen(free_limit_reached && shouldShowEarlyAccessPrompt());
  }, [refreshKey, mounted]);

  if (!open) return null;

  const onDismiss = () => {
    dismissEarlyAccessPrompt();
    setOpen(false);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email.");
      return;
    }
    setSubmitting(true);
    try {
      await submitEarlyAccess({
        email: email.trim(),
        companyName: companyName.trim() || undefined,
        role: role || undefined,
        challenge: challenge.trim() || undefined,
      });
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="early-access-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-2xl sm:p-8">
        {submitted ? (
          <>
            <p className="text-lg font-semibold tracking-tight text-neutral-900">
              You&apos;re in the founding group.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500">
              Founding users receive expanded evaluations during early access.
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-primary mt-6 w-full !py-2.5"
            >
              Continue evaluating
            </button>
          </>
        ) : (
          <>
            <p
              id="early-access-title"
              className="text-lg font-semibold tracking-tight text-neutral-900"
            >
              You&apos;ve used your free evaluations.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500">
              Join the founding user group for expanded access and early features.
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <label className="label">Email *</label>
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Brand / company</label>
                <input
                  className="input"
                  placeholder="Optional"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Role</label>
                <select
                  className="input"
                  value={role}
                  onChange={(e) => setRole(e.target.value as EarlyAccessRole | "")}
                >
                  <option value="">Optional</option>
                  {EARLY_ACCESS_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Biggest creator evaluation challenge</label>
                <textarea
                  className="input min-h-[72px] resize-y"
                  placeholder="Optional — one line is fine"
                  value={challenge}
                  onChange={(e) => setChallenge(e.target.value)}
                />
              </div>

              {error && (
                <p className="text-sm text-rose-600">{error}</p>
              )}

              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary flex-1 !py-2.5 disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Join Early Access"}
                </button>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="btn-secondary flex-1 !py-2.5"
                >
                  Maybe later
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
