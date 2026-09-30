import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AI_CONSENT_REQUIRED_CODE, hasAiConsent } from "@/lib/ai-consent";

/**
 * Server-side half of lib/ai-consent.ts — the client asks before calling
 * any AI route, but that alone would leave consent enforced only by UI
 * (an old app build, a direct API call, a missed call site). Every route
 * that forwards user data to AI Gateway calls this before doing so and
 * returns its response as-is when non-null.
 *
 * Pass the user when the route already has it from auth.getUser(); routes
 * that only have a user id (requireHouseholdMember) call it bare and it
 * looks the user up itself.
 */
export async function requireAiConsent(user?: User | null): Promise<NextResponse | null> {
  let caller = user;
  if (caller === undefined) {
    const supabase = await getSupabaseServerClient();
    caller = (await supabase.auth.getUser()).data.user;
  }
  if (!caller) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!hasAiConsent(caller)) {
    return NextResponse.json(
      { error: "Turn on AI features in Settings to use this.", code: AI_CONSENT_REQUIRED_CODE, retryable: false },
      { status: 403 }
    );
  }
  return null;
}
