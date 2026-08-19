import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AuthorizeResult = { ok: true; userId: string } | { ok: false; error: string; status: number };

/**
 * Every authenticated Plaid route (link-token, exchange-public-token,
 * items, sync, disconnect) needs to independently verify the caller
 * actually belongs to the household they're asking about before touching
 * `plaid_items` via the admin client — that table has zero RLS policies
 * (docs/Bank Sync Addendum.md §4), so there's no database-level backstop
 * the way there is for every other table in the app. This is that
 * backstop, done once here instead of once per route.
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
