import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-key-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { rowToContainer, type ContainerRow } from "@/lib/supabase/mappers";

export const runtime = "nodejs";

export async function GET(request: Request, ctx: RouteContext<"/api/v1/public/containers/[id]">) {
  const auth = await requireApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await ctx.params;

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("containers").select("*").eq("id", id).eq("household_id", auth.householdId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Container not found." }, { status: 404 });

  return NextResponse.json({ container: rowToContainer(data as ContainerRow) });
}

// Covers both a plain field edit and a "move" (locationId and/or
// parentContainerId) in the same PATCH — the app's own store has a
// separate moveContainer action, but that's a UI/undo-toast convenience,
// not a real distinction the data model needs; a move is just an update
// to two columns.
export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/public/containers/[id]">) {
  const auth = await requireApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { name, description, locationId, parentContainerId } = (body ?? {}) as {
    name?: unknown;
    description?: unknown;
    locationId?: unknown;
    parentContainerId?: unknown;
  };

  const admin = getSupabaseAdminClient();
  const patch: Record<string, unknown> = {};

  if (name !== undefined) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed) return NextResponse.json({ error: "`name` can't be blank." }, { status: 400 });
    patch.name = trimmed;
  }
  if (description !== undefined) patch.description = typeof description === "string" ? description.trim() : null;

  if (locationId !== undefined) {
    if (typeof locationId !== "string" || !locationId) return NextResponse.json({ error: "`locationId` must be a non-empty string." }, { status: 400 });
    const { data: locationRow, error: locationError } = await admin
      .from("locations")
      .select("id")
      .eq("id", locationId)
      .eq("household_id", auth.householdId)
      .eq("status", "active")
      .maybeSingle();
    if (locationError) return NextResponse.json({ error: locationError.message }, { status: 500 });
    if (!locationRow) return NextResponse.json({ error: "`locationId` doesn't match an active location in this household." }, { status: 400 });
    patch.location_id = locationId;
  }

  if (parentContainerId !== undefined) {
    if (parentContainerId !== null) {
      if (typeof parentContainerId !== "string") return NextResponse.json({ error: "`parentContainerId` must be a string or null." }, { status: 400 });
      if (parentContainerId === id) return NextResponse.json({ error: "A container can't be its own parent." }, { status: 400 });
      const { data: parentRow, error: parentError } = await admin
        .from("containers")
        .select("id")
        .eq("id", parentContainerId)
        .eq("household_id", auth.householdId)
        .eq("status", "active")
        .maybeSingle();
      if (parentError) return NextResponse.json({ error: parentError.message }, { status: 500 });
      if (!parentRow) return NextResponse.json({ error: "`parentContainerId` doesn't match an active container in this household." }, { status: 400 });
    }
    patch.parent_container_id = parentContainerId;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const { data, error } = await admin
    .from("containers")
    .update(patch)
    .eq("id", id)
    .eq("household_id", auth.householdId)
    .eq("status", "active")
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Container not found." }, { status: 404 });

  return NextResponse.json({ container: rowToContainer(data as ContainerRow) });
}
