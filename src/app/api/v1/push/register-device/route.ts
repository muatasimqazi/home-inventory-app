import { NextResponse } from "next/server";
import { requireHouseholdMember } from "@/lib/authorize";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Registers (or re-registers, on token conflict) a Capacitor native
 * app's FCM device token (docs/Mobile App Addendum.md §2.1) — called
 * right after @capacitor/push-notifications' `register()` resolves with
 * a token. Mirrors push/subscribe/route.ts exactly (same admin-client-
 * because-RLS-is-user-scoped reasoning, same upsert-on-conflict shape),
 * just against device_push_tokens (0056_device_push_tokens.sql) instead
 * of push_subscriptions.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { householdId, platform, fcmToken } = (body ?? {}) as { householdId?: unknown; platform?: unknown; fcmToken?: unknown };
  if (typeof householdId !== "string" || !householdId) {
    return NextResponse.json({ error: "`householdId` is required." }, { status: 400 });
  }
  if (platform !== "ios" && platform !== "android") {
    return NextResponse.json({ error: "`platform` must be 'ios' or 'android'." }, { status: 400 });
  }
  if (typeof fcmToken !== "string" || !fcmToken) {
    return NextResponse.json({ error: "`fcmToken` is required." }, { status: 400 });
  }

  const authResult = await requireHouseholdMember(householdId);
  if (!authResult.ok) return NextResponse.json({ error: authResult.error }, { status: authResult.status });

  const admin = getSupabaseAdminClient();
  // Upsert on fcm_token (unique) — a device re-registering (app
  // reinstall, token refresh) lands on the same row rather than
  // accumulating duplicates that would each get a push.
  const { error } = await admin.from("device_push_tokens").upsert(
    {
      household_id: householdId,
      user_id: authResult.userId,
      platform,
      fcm_token: fcmToken,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "fcm_token", ignoreDuplicates: false }
  );
  if (error) {
    console.error("push/register-device: upsert failed:", error);
    return NextResponse.json({ error: "Couldn't save that device." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
