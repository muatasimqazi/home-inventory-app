import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const CONFIRMATION_PHRASE = "DELETE";
// Both buckets store everything under `${householdId}/...` (0003/0005's
// documented convention, reused by every RLS policy that reads
// `(storage.foldername(name))[1]` as the household id) — the two buckets
// that can hold anything for a household getting fully cascade-deleted.
const HOUSEHOLD_SCOPED_BUCKETS = ["attachments", "item-photos"] as const;

interface HouseholdRow {
  household_id: string;
  role: "owner" | "member";
  household_name: string;
  member_count: number;
}

async function classifyMemberships(supabase: SupabaseClient, userId: string) {
  // RLS-respecting client (the caller's own session) is enough for this
  // read — a member can already see every household they belong to and
  // every other member's row in it.
  const { data: myMemberships, error: myError } = await supabase.from("members").select("household_id, role").eq("user_id", userId);
  if (myError) throw myError;

  const households: HouseholdRow[] = [];
  for (const m of myMemberships ?? []) {
    const [{ data: household }, { count, error: countError }] = await Promise.all([
      supabase.from("households").select("name").eq("id", m.household_id).single(),
      supabase.from("members").select("user_id", { count: "exact", head: true }).eq("household_id", m.household_id),
    ]);
    // A failed count query must not silently read as "1" — for a
    // household where the caller is actually Owner with other members,
    // that would misclassify it as soleOwner instead of blocked, showing
    // "safe to delete" in the preview when it isn't. The authoritative
    // SQL RPC would still correctly reject the deletion itself, but this
    // preview exists specifically so the user never reaches that
    // rejection having been told it was safe.
    if (countError) throw countError;
    households.push({
      household_id: m.household_id,
      role: m.role,
      household_name: household?.name ?? "Household",
      member_count: count ?? 1,
    });
  }

  const blocked = households.filter((h) => h.role === "owner" && h.member_count > 1);
  const soleOwner = households.filter((h) => h.member_count <= 1);
  const sharedMember = households.filter((h) => h.role === "member" && h.member_count > 1);

  return { households, blocked, soleOwner, sharedMember };
}

/**
 * Preview — what would happen, with nothing touched. The settings page
 * calls this on mount so the confirmation flow can show a real, specific
 * summary ("Household X will be permanently deleted", "you'll leave
 * Household Y — only items you personally own are removed") instead of a
 * generic warning, and so a case-2 block (owner of a shared household) can
 * be shown and explained *before* the user ever reaches the "type DELETE"
 * step.
 */
export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const { blocked, soleOwner, sharedMember } = await classifyMemberships(supabase, user.id);
    return NextResponse.json({
      blocked: blocked.map((h) => ({ id: h.household_id, name: h.household_name })),
      willBeDeleted: soleOwner.map((h) => ({ id: h.household_id, name: h.household_name })),
      willBeLeft: sharedMember.map((h) => ({ id: h.household_id, name: h.household_name })),
    });
  } catch (error) {
    console.error("account/delete preview: couldn't classify memberships:", error);
    return NextResponse.json({ error: "Couldn't load account deletion preview." }, { status: 500 });
  }
}

/** Lists every object under `prefix` in `bucket`, recursing into folder
 * entries (Storage's `list()` only returns one level; a folder entry has
 * `id: null`, an object entry doesn't — the standard supabase-js
 * distinction). Best-effort: a listing failure partway through returns
 * whatever was already found rather than throwing, since storage cleanup
 * is a courtesy after the real (DB) deletion has already committed, never
 * something that should look like it undid that deletion. */
async function listAllObjectPaths(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) {
    if (error) console.error(`account/delete: couldn't list ${bucket}/${prefix}:`, error);
    return [];
  }
  const paths: string[] = [];
  for (const entry of data) {
    const fullPath = `${prefix}/${entry.name}`;
    if (entry.id === null) {
      paths.push(...(await listAllObjectPaths(admin, bucket, fullPath)));
    } else {
      paths.push(fullPath);
    }
  }
  return paths;
}

async function removeInBatches(admin: SupabaseClient, bucket: string, paths: string[]) {
  const BATCH_SIZE = 100;
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + BATCH_SIZE));
    if (error) console.error(`account/delete: couldn't remove ${paths.length} object(s) from ${bucket}:`, error);
  }
}

/**
 * Deletes the caller's account. Three cases per household they belong to
 * — see supabase/migrations/0025_account_deletion.sql's own header for
 * the full design and the one flagged gap (case 3's final
 * `auth.admin.deleteUser()` can still fail for a member with shared
 * activity history — handled below, not silently ignored).
 *
 * The DB-side cascade (household delete for a sole-member household, or
 * membership + personally-owned items for a shared one) happens inside a
 * single transactional Postgres function so it's all-or-nothing. Storage
 * cleanup and the final auth-user deletion happen after that transaction
 * commits — they can't be part of the same transaction (Storage isn't
 * transactional with Postgres, and `auth.admin.deleteUser()` is a
 * separate GoTrue call, not a SQL statement) — so once the DB function
 * commits, the user's household data and access are already gone even if
 * something below fails; this route reports that honestly rather than
 * implying the whole operation rolled back.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { confirmation } = (body ?? {}) as { confirmation?: unknown };
  if (confirmation !== CONFIRMATION_PHRASE) {
    return NextResponse.json({ error: `Type "${CONFIRMATION_PHRASE}" to confirm.` }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = getSupabaseAdminClient();

  const { data: rpcData, error: rpcError } = await admin.rpc("delete_account_data", { p_user_id: user.id });
  if (rpcError) {
    if (rpcError.message?.startsWith("OWNER_OF_SHARED_HOUSEHOLD:")) {
      return NextResponse.json(
        { error: rpcError.message.replace("OWNER_OF_SHARED_HOUSEHOLD: ", ""), code: "OWNER_OF_SHARED_HOUSEHOLD" },
        { status: 409 }
      );
    }
    console.error("account/delete: delete_account_data RPC failed:", rpcError);
    return NextResponse.json({ error: "Couldn't delete your account data. Nothing was changed." }, { status: 500 });
  }

  // The DB transaction above has committed — everything from here is
  // best-effort cleanup layered on top of an already-real deletion.
  const result = (rpcData ?? {}) as {
    deletedHouseholdIds?: string[];
    personalItemPhotoPaths?: string[];
    personalItemAttachmentPaths?: string[];
    personAvatarPaths?: string[];
  };

  for (const householdId of result.deletedHouseholdIds ?? []) {
    for (const bucket of HOUSEHOLD_SCOPED_BUCKETS) {
      const paths = await listAllObjectPaths(admin, bucket, householdId);
      if (paths.length > 0) await removeInBatches(admin, bucket, paths);
    }
  }
  if (result.personalItemPhotoPaths?.length) await removeInBatches(admin, "item-photos", result.personalItemPhotoPaths);
  if (result.personAvatarPaths?.length) await removeInBatches(admin, "item-photos", result.personAvatarPaths);
  if (result.personalItemAttachmentPaths?.length) await removeInBatches(admin, "attachments", result.personalItemAttachmentPaths);

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    // Expected, not a bug: most `created_by_user_id`/`actor_user_id`
    // columns on shared household content (activity_log in particular)
    // are `not null references auth.users(id)` with no ON DELETE clause
    // — Postgres blocks deleting the auth user while any surviving shared
    // row still references them, which is exactly what "leave the shared
    // household's real history alone" (case 3) requires. Household access
    // and personally-owned data are already gone at this point; only the
    // sign-in account itself survives. Surfaced clearly, not swallowed.
    console.error("account/delete: household/account data removed, but auth.admin.deleteUser failed:", deleteUserError);
    return NextResponse.json(
      {
        ok: true,
        signInRemoved: false,
        message:
          "Your household access and personal data were removed, but your sign-in account couldn't be fully deleted because you have shared activity history in a household that's still active. Contact support to finish removing your account.",
      },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true, signInRemoved: true });
}
