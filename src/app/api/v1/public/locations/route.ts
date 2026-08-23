import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-key-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { newId } from "@/lib/id";
import { rowToLocation, locationToInsertRow, type LocationRow } from "@/lib/supabase/mappers";
import type { Location } from "@/lib/types";

export const runtime = "nodejs";

// The public inventory API (Settings > API Keys) — external automations
// (Home Assistant, Apple Shortcuts) authenticate with `Authorization:
// Bearer shz_...` instead of a Supabase Auth session, so every route
// under api/v1/public/* runs on the admin client (bypasses RLS) behind
// requireApiKey() and is responsible for its own household scoping by
// hand — see requireApiKey's own doc comment. Domain objects are returned
// in the same camelCase shape the app's own store uses (via the same
// rowToX() mappers store.ts calls), not a separate "public API" schema,
// so there's exactly one shape for a Location/Container/Item to learn
// regardless of which side of the app you're looking at it from.
//
// Trash/permanent-delete, photo upload, and Container ID (displayCode)
// reassignment are deliberately not exposed here — see containers/[id]
// and items/[id] for what each resource's own route does and doesn't do.

export async function GET(request: Request) {
  const auth = await requireApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("locations").select("*").eq("household_id", auth.householdId).eq("status", "active").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ locations: (data as LocationRow[]).map(rowToLocation) });
}

export async function POST(request: Request) {
  const auth = await requireApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { name, description } = (body ?? {}) as { name?: unknown; description?: unknown };
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) return NextResponse.json({ error: "`name` is required." }, { status: 400 });

  const location: Location = {
    id: newId(),
    householdId: auth.householdId,
    name: trimmedName,
    description: typeof description === "string" ? description.trim() : undefined,
    coverPhotoPath: null,
    createdByUserId: auth.createdByUserId,
    createdAt: new Date().toISOString(),
    status: "active",
    trashedAt: null,
    permanentlyDeleteAfter: null,
  };

  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("locations").insert(locationToInsertRow(location));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ location }, { status: 201 });
}
