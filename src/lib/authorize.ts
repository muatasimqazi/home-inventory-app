import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AuthorizeResult = { ok: true; userId: string } | { ok: false; error: string; status: number };

/**
 * Shared by every server route that needs to independently verify a
 * caller's household membership before touching a table an RLS policy
 * alone can't gate for them — first written for the Plaid routes (whose
 * plaid_items table has zero RLS policies by design, see
 * docs/Bank Sync Addendum.md §4), reused as-is for push notifications
 * (push_subscriptions/notification_preferences are user-scoped, but the
 * subscribe/unsubscribe routes still need to confirm the caller actually
 * belongs to the household they're registering a device for).
 */
export async function requireHouseholdMember(householdId: string): Promise<AuthorizeResult> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in.", status: 401 };

  const { data: membership } = await supabase.from("members").select("user_id").eq("household_id", householdId).eq("user_id", user.id).maybeSingle();
  if (!membership) return { ok: false, error: "Not a member of this household.", status: 403 };

  return { ok: true, userId: user.id };
}
