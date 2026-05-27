"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { CLOUD_MEMORY_ENABLED, isSupabaseConfigured } from "@/lib/supabase/env";
import { tryCreateClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!CLOUD_MEMORY_ENABLED) {
      router.replace("/analyze");
    }
  }, [router]);

  useEffect(() => {
    if (!CLOUD_MEMORY_ENABLED || !configured) return;
    const supabase = tryCreateClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace("/workspace");
    });
  }, [configured, router]);

  const redirectTo = () =>
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : "/auth/callback";

  const signInWithGoogle = async () => {
    setError(null);
    setMessage(null);
    const supabase = tryCreateClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    setLoading(false);
    if (err) setError(err.message);
  };

  const signInWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const supabase = tryCreateClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo() },
    });
    setLoading(false);
    if (err) setError(err.message);
    else setMessage("Check your email for a sign-in link.");
  };

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto flex max-w-md flex-col px-6 py-16">
        <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Sign in</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Save evaluations across devices and reopen creator intelligence anytime.
        </p>

        {!configured && (
          <div className="mt-8 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-100">
            Add <code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable cloud
            memory. Local saves still work without sign-in.
          </div>
        )}

        {configured && (
          <div className="mt-8 space-y-4">
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={loading}
              className="btn-primary w-full !py-3"
            >
              Continue with Google
            </button>

            <div className="relative py-2 text-center text-xs text-neutral-400">
              <span className="bg-[var(--bg)] px-2">or</span>
            </div>

            <form onSubmit={signInWithEmail} className="space-y-3">
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="btn-secondary w-full !py-3"
              >
                Email me a sign-in link
              </button>
            </form>

            {message && <p className="text-sm text-emerald-700">{message}</p>}
            {error && <p className="text-sm text-rose-700">{error}</p>}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-neutral-500">
          <Link href="/analyze" className="font-semibold hover:text-neutral-800">
            Continue without signing in →
          </Link>
        </p>
      </div>
    </main>
  );
}
