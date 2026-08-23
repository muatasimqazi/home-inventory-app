import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashApiKeySecret } from "@/lib/api-keys";

export type ApiKeyAuthResult =
  | { ok: true; householdId: string; keyId: string; createdByUserId: string }
  | { ok: false; error: string; status: number };

/**
 * Authenticates a request to /api/v1/public/* via `Authorization: Bearer
 * shz_...` — the external-automation counterpart to authorize.ts's
 * requireHouseholdMember/requireHouseholdOwner, which authenticate a
 * signed-in browser session instead. Runs on the admin client: there's no
 * Supabase Auth session here for RLS's is_household_owner() to check
 * against, so every public route below this must itself scope every
 * query/write to the returned householdId explicitly (the admin client
 * bypasses RLS entirely, same trust level noted on getSupabaseAdminClient
 * itself) — nothing here does that scoping for them.
 */
export async function requireApiKey(request: Request): Promise<ApiKeyAuthResult> {
  const header = request.headers.get("authorization");
  const secret = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
  if (!secret) return { ok: false, error: "Missing Authorization: Bearer <api key> header.", status: 401 };

  const admin = getSupabaseAdminClient();
  const keyHash = hashApiKeySecret(secret);
  const { data: key } = await admin
    .from("api_keys")
    .select("id, household_id, created_by_user_id, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (!key || key.revoked_at) return { ok: false, error: "Invalid or revoked API key.", status: 401 };

  // Awaited but not fatal — a single indexed update by primary key, cheap
  // enough not to bother deferring, but a failure here (display-only
  // field) shouldn't turn an otherwise-valid, authenticated request into
  // a 500.
  const { error: touchError } = await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id as string);
  if (touchError) console.error("api-key-auth: couldn't update last_used_at:", touchError.message);

  return {
    ok: true,
    householdId: key.household_id as string,
    keyId: key.id as string,
    // Attributed to whichever owner generated this key — every table an
    // API-key request can write to has a NOT NULL created_by_user_id (see
    // 0001_init.sql), and there's no real per-request "user" here for it
    // to be, so the key's own creator stands in.
    createdByUserId: key.created_by_user_id as string,
  };
}

/**
 * The admin-client equivalent of items' can_view_item() RLS gate
 * (supabase/migrations/0031_item_sharing.sql) — every /api/v1/public/items
 * route runs on the admin client (this file's own module comment: RLS
 * isn't in effect, so nothing is filtered by default), so each one has to
 * redo that same visibility check itself, scoped to whichever member
 * generated the key, or a personal, unshared item would leak to anyone
 * holding the API secret. Pass the result to a `.or()` call on an `items`
 * query already `.eq("household_id", ...)`-scoped.
 */
export async function itemVisibilityFilter(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  householdId: string,
  createdByUserId: string
): Promise<string> {
  const { data: ownerPerson } = await admin
    .from("people")
    .select("id")
    .eq("household_id", householdId)
    .eq("linked_user_id", createdByUserId)
    .maybeSingle();
  return ownerPerson
    ? `owner_person_id.is.null,is_shared.eq.true,owner_person_id.eq.${ownerPerson.id}`
    : `owner_person_id.is.null,is_shared.eq.true`;
}
