import { type NextRequest, NextResponse } from "next/server";
import { CLOUD_MEMORY_ENABLED } from "@/lib/supabase/env";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  if (!CLOUD_MEMORY_ENABLED) {
    return NextResponse.next({ request });
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/workspace/:path*", "/login", "/auth/:path*"],
};
