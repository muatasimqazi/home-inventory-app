import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Removes a device's push subscription — called from the client right
 * after `pushSubscription.unsubscribe()`. No admin client needed here:
 * push_subscriptions RLS already lets a signed-in user delete their own
 * row directly (`user_id = auth.uid()`), so this route just does it as
 * the caller rather than re-deriving the same permission via the admin
 * client.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { endpoint } = (body ?? {}) as { endpoint?: unknown };
  if (typeof endpoint !== "string" || !endpoint) {
    return NextResponse.json({ error: "`endpoint` is required." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  if (error) {
    console.error("push/unsubscribe: delete failed:", error);
    return NextResponse.json({ error: "Couldn't remove that subscription." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
