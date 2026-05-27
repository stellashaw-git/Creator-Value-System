"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signOutCloud } from "@/lib/cloud-evaluations";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { tryCreateClient } from "@/lib/supabase/client";

export function AuthNav() {
  const [email, setEmail] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) return;
    const supabase = tryCreateClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, [configured]);

  if (!configured) {
    return (
      <Link href="/login" className="text-xs font-semibold text-neutral-600 hover:text-neutral-900">
        Sign in
      </Link>
    );
  }

  if (!email) {
    return (
      <Link href="/login" className="text-xs font-semibold text-neutral-600 hover:text-neutral-900">
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="hidden text-neutral-500 sm:inline">{email}</span>
      <button
        type="button"
        onClick={() => void signOutCloud().then(() => setEmail(null))}
        className="font-semibold text-neutral-600 hover:text-neutral-900"
      >
        Sign out
      </button>
    </div>
  );
}
