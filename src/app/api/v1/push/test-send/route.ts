import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendFcmToUser } from "@/lib/push/send";

export const runtime = "nodejs";

/**
 * TEMPORARY — real-device verification only, for the iOS native-push
 * work in docs/Mobile App Addendum.md §2.1/§5.4. Self-scoped (always
 * sends to the caller's own device_push_tokens rows, never anyone
 * else's) specifically so it's safe to hit ad hoc without the blast
 * radius of the broad cron sends (send-due-bills etc.). Calls
 * sendFcmToUser directly rather than the public sendPushToUser to skip
 * its VAPID ensureConfigured() check — Web Push's VAPID env vars are
 * separately unset in production right now (found while wiring this
 * up), an unrelated pre-existing gap, not something to fix as a side
 * effect of testing FCM. Delete this route once iOS push delivery is
 * confirmed.
 */
export async function POST() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = getSupabaseAdminClient();
  const result = await sendFcmToUser(admin, user.id, {
    title: "Schuaz test push",
    body: "If you see this, native push delivery works end to end.",
    url: "/dashboard",
    tag: "test-push",
  });
  return NextResponse.json(result);
}
