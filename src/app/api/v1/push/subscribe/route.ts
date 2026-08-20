import { NextResponse } from "next/server";
import { requireHouseholdMember } from "@/lib/authorize";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Registers (or re-registers, on endpoint conflict) a browser's Push
 * subscription (docs/Household Hub Addendum.md §5) — called right after
 * a successful `pushManager.subscribe()` on the client. Runs through the
 * admin client because push_subscriptions RLS is user-scoped
 * (`user_id = auth.uid()`), which already protects the row once written,
 * but the *insert* itself needs household_id set correctly up front —
 * same independent-verification posture as the Plaid routes.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { householdId, endpoint, keys, deviceLabel } = (body ?? {}) as {
    householdId?: unknown;
    endpoint?: unknown;
    keys?: unknown;
    deviceLabel?: unknown;
  };
  if (typeof householdId !== "string" || !householdId) {
    return NextResponse.json({ error: "`householdId` is required." }, { status: 400 });
  }
  if (typeof endpoint !== "string" || !endpoint) {
    return NextResponse.json({ error: "`endpoint` is required." }, { status: 400 });
  }
  const p256dh = (keys as { p256dh?: unknown } | undefined)?.p256dh;
  const auth = (keys as { auth?: unknown } | undefined)?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string" || !p256dh || !auth) {
    return NextResponse.json({ error: "`keys.p256dh` and `keys.auth` are required." }, { status: 400 });
  }

  const authResult = await requireHouseholdMember(householdId);
  if (!authResult.ok) return NextResponse.json({ error: authResult.error }, { status: authResult.status });

  const admin = getSupabaseAdminClient();
  // Upsert on endpoint (unique) — a browser re-subscribing (e.g. after
  // clearing the old subscription) lands on the same row rather than
  // accumulating duplicates that would each get a push. `id` is
  // deliberately omitted from the payload — it defaults on a real INSERT
  // and stays untouched on a conflicting UPDATE, rather than generating a
  // fresh id every re-subscribe for no reason.
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      household_id: householdId,
      user_id: authResult.userId,
      endpoint,
      p256dh_key: p256dh,
      auth_key: auth,
      device_label: typeof deviceLabel === "string" ? deviceLabel : null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint", ignoreDuplicates: false }
  );
  if (error) {
    console.error("push/subscribe: upsert failed:", error);
    return NextResponse.json({ error: "Couldn't save that subscription." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
