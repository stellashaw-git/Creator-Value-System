import { NextResponse } from "next/server";
import { CLOUD_MEMORY_ENABLED } from "@/lib/supabase/env";
import { tryCreateClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!CLOUD_MEMORY_ENABLED) {
    const { origin } = new URL(request.url);
    return NextResponse.redirect(`${origin}/analyze`);
  }
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/workspace";

  if (code) {
    const supabase = await tryCreateClient();
    if (supabase) {
      await supabase.auth.exchangeCodeForSession(code);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
