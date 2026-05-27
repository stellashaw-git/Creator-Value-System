import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./env";

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}

/** Safe client accessor — returns null when env is missing. */
export function tryCreateClient() {
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
