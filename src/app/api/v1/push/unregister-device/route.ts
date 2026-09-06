import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Removes a Capacitor native app's FCM device token — mirrors
 * push/unsubscribe/route.ts exactly (device_push_tokens RLS already lets
 * a signed-in user delete their own row directly, same as
 * push_subscriptions').
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { fcmToken } = (body ?? {}) as { fcmToken?: unknown };
  if (typeof fcmToken !== "string" || !fcmToken) {
    return NextResponse.json({ error: "`fcmToken` is required." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { error } = await supabase.from("device_push_tokens").delete().eq("fcm_token", fcmToken).eq("user_id", user.id);
  if (error) {
    console.error("push/unregister-device: delete failed:", error);
    return NextResponse.json({ error: "Couldn't remove that device." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
