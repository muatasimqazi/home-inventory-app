import { NextResponse } from "next/server";
import { requireHouseholdOwner } from "@/lib/authorize";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateApiKey } from "@/lib/api-keys";
import { rowToApiKey, type ApiKeyRow } from "@/lib/supabase/mappers";

export const runtime = "nodejs";

/**
 * Generates a new API key for a household — the only step in the key's
 * lifecycle that needs a server route rather than a plain RLS-backed
 * client insert (see store.ts's revokeApiKey for that simpler shape):
 * the raw secret has to be minted and hashed here, returned exactly once
 * in this response, and never written anywhere in plaintext. Everything
 * after generation (list, revoke) goes through the household bundle /
 * a direct update the way every other resource in this app does.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { householdId, label } = (body ?? {}) as { householdId?: unknown; label?: unknown };
  if (typeof householdId !== "string" || !householdId) {
    return NextResponse.json({ error: "`householdId` is required." }, { status: 400 });
  }
  const trimmedLabel = typeof label === "string" ? label.trim() : "";
  if (!trimmedLabel) {
    return NextResponse.json({ error: "`label` is required." }, { status: 400 });
  }

  const authResult = await requireHouseholdOwner(householdId);
  if (!authResult.ok) return NextResponse.json({ error: authResult.error }, { status: authResult.status });

  const generated = generateApiKey();
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .insert({
      household_id: householdId,
      created_by_user_id: authResult.userId,
      label: trimmedLabel,
      key_prefix: generated.keyPrefix,
      last_four: generated.lastFour,
      key_hash: generated.keyHash,
    })
    .select("id, household_id, created_by_user_id, label, key_prefix, last_four, created_at, last_used_at, revoked_at")
    .single();
  if (error || !data) {
    console.error("api-keys: couldn't create key:", error?.message);
    return NextResponse.json({ error: "Couldn't create the API key." }, { status: 500 });
  }

  return NextResponse.json({
    apiKey: rowToApiKey(data as ApiKeyRow),
    // The one and only time this ever leaves the server.
    secret: generated.secret,
  });
}
