import { NextResponse, type NextRequest } from "next/server";

import { getSiteUrl, isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function redirect(url: URL): NextResponse {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function safeNext(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f]/.test(value)
  ) {
    return "/office";
  }
  return value;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  // Behind Docker or a reverse proxy, Next.js may see the container's internal
  // origin (for example localhost:3000) instead of the browser-facing origin.
  // OAuth redirects must always return to the configured public site URL.
  const siteUrl = getSiteUrl();
  if (!isSupabaseConfigured()) {
    return redirect(new URL("/login?error=supabase_not_configured", siteUrl));
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return redirect(new URL("/login?error=missing_oauth_code", siteUrl));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return redirect(new URL("/login?error=oauth_callback_failed", siteUrl));
  }

  return redirect(new URL(safeNext(url.searchParams.get("next")), siteUrl));
}
