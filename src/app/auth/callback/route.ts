import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Where Supabase redirects back to after Google OAuth (and any future
// third-party provider) — exchanges the one-time `code` for a real
// session, written to cookies by the server client, then sends the user
// on to the dashboard. Errors (denied consent, expired code, etc.) go
// back to sign-in with a message instead of a bare redirect loop.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // "/" is the public marketing homepage (src/app/page.tsx, "Add public
  // homepage") — this fallback predates that page and was never updated,
  // so a Google sign-in with no explicit ?next= (the common case; the
  // param is only set when sign-in/page.tsx forwards one through) landed
  // signed-in users back on the marketing page instead of the app. The
  // password sign-in path already defaults to /dashboard for the same
  // reason (see sign-in/page.tsx's own comment on that line).
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
