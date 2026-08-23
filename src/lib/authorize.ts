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

/**
 * Same shape as requireHouseholdMember, but additionally requires
 * role = 'owner' — for routes backing an owner-only action where the RLS
 * policy on the table itself (is_household_owner(household_id), see
 * 0001_init.sql) is the real enforcement, and this check exists to fail
 * fast with a clear 403 rather than a raw Postgres RLS-denial error. First
 * used by api-keys/route.ts (generating a standing external credential is
 * exactly the kind of household-admin action is_household_owner already
 * gates everywhere else — member removal, invites).
 */
export async function requireHouseholdOwner(householdId: string): Promise<AuthorizeResult> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in.", status: 401 };

  const { data: membership } = await supabase.from("members").select("role").eq("household_id", householdId).eq("user_id", user.id).maybeSingle();
  if (!membership) return { ok: false, error: "Not a member of this household.", status: 403 };
  if (membership.role !== "owner") return { ok: false, error: "Only the household owner can do this.", status: 403 };

  return { ok: true, userId: user.id };
}
