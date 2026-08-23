import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-key-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { newId, tagToken } from "@/lib/id";
import { nextDisplayCode } from "@/lib/display-code";
import { rowToContainer, containerToInsertRow, rowToLocation, type ContainerRow, type LocationRow } from "@/lib/supabase/mappers";
import type { Container } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");

  const admin = getSupabaseAdminClient();
  let query = admin.from("containers").select("*").eq("household_id", auth.householdId).eq("status", "active").order("name");
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ containers: (data as ContainerRow[]).map(rowToContainer) });
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
  const { name, description, locationId, parentContainerId } = (body ?? {}) as {
    name?: unknown;
    description?: unknown;
    locationId?: unknown;
    parentContainerId?: unknown;
  };
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) return NextResponse.json({ error: "`name` is required." }, { status: 400 });
  if (typeof locationId !== "string" || !locationId) return NextResponse.json({ error: "`locationId` is required." }, { status: 400 });

  const admin = getSupabaseAdminClient();

  // Independently verify locationId (and parentContainerId, if given)
  // actually belong to this key's household before writing anything — the
  // admin client bypasses RLS entirely, so nothing else stops a request
  // from referencing another household's row by id otherwise.
  const { data: locationRow, error: locationError } = await admin
    .from("locations")
    .select("*")
    .eq("id", locationId)
    .eq("household_id", auth.householdId)
    .eq("status", "active")
    .maybeSingle();
  if (locationError) return NextResponse.json({ error: locationError.message }, { status: 500 });
  if (!locationRow) return NextResponse.json({ error: "`locationId` doesn't match an active location in this household." }, { status: 400 });

  if (parentContainerId !== undefined && parentContainerId !== null) {
    if (typeof parentContainerId !== "string") return NextResponse.json({ error: "`parentContainerId` must be a string." }, { status: 400 });
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

  // Auto-assigned Container ID, same as the app's own createContainer —
  // an API-created container that never gets one is otherwise invisible
  // to the label-printing flow and any "find it by its code" search.
  const { data: existingRows, error: existingError } = await admin.from("containers").select("*").eq("household_id", auth.householdId);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  const existingContainers = (existingRows as ContainerRow[]).map(rowToContainer);
  const location = rowToLocation(locationRow as LocationRow);
  const displayCode = nextDisplayCode(existingContainers, location.name);

  const container: Container = {
    id: newId(),
    householdId: auth.householdId,
    locationId,
    parentContainerId: typeof parentContainerId === "string" ? parentContainerId : null,
    name: trimmedName,
    description: typeof description === "string" ? description.trim() : undefined,
    tagToken: tagToken(),
    displayCode,
    coverPhotoPath: null,
    createdByUserId: auth.createdByUserId,
    createdAt: new Date().toISOString(),
    status: "active",
    trashedAt: null,
    permanentlyDeleteAfter: null,
    nfcLinkedAt: null,
  };

  const { error } = await admin.from("containers").insert(containerToInsertRow(container));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ container }, { status: 201 });
}
