import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-key-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { rowToLocation, type LocationRow } from "@/lib/supabase/mappers";

export const runtime = "nodejs";

export async function GET(request: Request, ctx: RouteContext<"/api/v1/public/locations/[id]">) {
  const auth = await requireApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await ctx.params;

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("locations").select("*").eq("id", id).eq("household_id", auth.householdId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  return NextResponse.json({ location: rowToLocation(data as LocationRow) });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/public/locations/[id]">) {
  const auth = await requireApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { name, description } = (body ?? {}) as { name?: unknown; description?: unknown };

  const patch: Record<string, unknown> = {};
  if (name !== undefined) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed) return NextResponse.json({ error: "`name` can't be blank." }, { status: 400 });
    patch.name = trimmed;
  }
  if (description !== undefined) {
    patch.description = typeof description === "string" ? description.trim() : null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("locations")
    .update(patch)
    .eq("id", id)
    .eq("household_id", auth.householdId)
    .eq("status", "active")
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  return NextResponse.json({ location: rowToLocation(data as LocationRow) });
}
