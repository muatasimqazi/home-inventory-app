import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-key-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { rowToItem, type ItemRow } from "@/lib/supabase/mappers";
import { CATEGORIES, TRASH_RETENTION_DAYS } from "@/lib/types";

export const runtime = "nodejs";

type ItemRowWithTags = ItemRow & { item_tags: { tag_id: string }[] | null };

export async function GET(request: Request, ctx: RouteContext<"/api/v1/public/items/[id]">) {
  const auth = await requireApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await ctx.params;

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("items").select("*, item_tags(tag_id)").eq("id", id).eq("household_id", auth.householdId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Item not found." }, { status: 404 });

  const row = data as ItemRowWithTags;
  return NextResponse.json({ item: rowToItem(row, (row.item_tags ?? []).map((jt) => jt.tag_id)) });
}

// Covers update, move (locationId/containerId), and archive/unarchive
// (status: "active" | "archived") in one endpoint — trash is deliberately
// its own verb (DELETE, below): archiving is reversible with no retention
// clock, trashing starts a 30-day countdown to permanent deletion, and
// permanent deletion itself isn't exposed here at all (see the DELETE
// handler's own comment).
export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/public/items/[id]">) {
  const auth = await requireApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { name, category, quantity, notes, locationId, containerId, status } = (body ?? {}) as {
    name?: unknown;
    category?: unknown;
    quantity?: unknown;
    notes?: unknown;
    locationId?: unknown;
    containerId?: unknown;
    status?: unknown;
  };

  const admin = getSupabaseAdminClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (name !== undefined) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed) return NextResponse.json({ error: "`name` can't be blank." }, { status: 400 });
    patch.name = trimmed;
  }
  if (category !== undefined) {
    if (typeof category !== "string" || !(CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: `\`category\` must be one of: ${CATEGORIES.join(", ")}.` }, { status: 400 });
    }
    patch.category = category;
  }
  if (quantity !== undefined) {
    if (typeof quantity !== "number" || !Number.isFinite(quantity)) return NextResponse.json({ error: "`quantity` must be a number." }, { status: 400 });
    patch.quantity = Math.max(0, Math.min(9999, Math.round(quantity)));
  }
  if (notes !== undefined) patch.notes = typeof notes === "string" ? notes.trim() : "";
  if (status !== undefined) {
    if (status !== "active" && status !== "archived") return NextResponse.json({ error: "`status` must be \"active\" or \"archived\"." }, { status: 400 });
    patch.status = status;
  }

  if (locationId !== undefined) {
    if (locationId !== null) {
      if (typeof locationId !== "string") return NextResponse.json({ error: "`locationId` must be a string or null." }, { status: 400 });
      const { data: locationRow, error: locationError } = await admin
        .from("locations")
        .select("id")
        .eq("id", locationId)
        .eq("household_id", auth.householdId)
        .eq("status", "active")
        .maybeSingle();
      if (locationError) return NextResponse.json({ error: locationError.message }, { status: 500 });
      if (!locationRow) return NextResponse.json({ error: "`locationId` doesn't match an active location in this household." }, { status: 400 });
    }
    patch.location_id = locationId;
  }
  if (containerId !== undefined) {
    if (containerId !== null) {
      if (typeof containerId !== "string") return NextResponse.json({ error: "`containerId` must be a string or null." }, { status: 400 });
      const { data: containerRow, error: containerError } = await admin
        .from("containers")
        .select("id")
        .eq("id", containerId)
        .eq("household_id", auth.householdId)
        .eq("status", "active")
        .maybeSingle();
      if (containerError) return NextResponse.json({ error: containerError.message }, { status: 500 });
      if (!containerRow) return NextResponse.json({ error: "`containerId` doesn't match an active container in this household." }, { status: 400 });
    }
    patch.container_id = containerId;
  }

  if (Object.keys(patch).length <= 1) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const { data, error } = await admin
    .from("items")
    .update(patch)
    .eq("id", id)
    .eq("household_id", auth.householdId)
    .neq("status", "trashed")
    .select("*, item_tags(tag_id)")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Item not found." }, { status: 404 });

  const row = data as ItemRowWithTags;
  return NextResponse.json({ item: rowToItem(row, (row.item_tags ?? []).map((jt) => jt.tag_id)) });
}

// Moves to Trash, recoverable for 30 days — the same soft-delete every
// other trash entry point in the app uses (store.ts's trashItem). No
// permanent-delete endpoint exists here at all: that's a real,
// irreversible data-loss action, and per this app's own posture on
// destructive actions it stays a deliberate, in-app-only step (the Trash
// screen's own "Delete Forever," 30 days later than whatever an
// automation did) rather than something one bearer-token request can do
// in one shot.
export async function DELETE(request: Request, ctx: RouteContext<"/api/v1/public/items/[id]">) {
  const auth = await requireApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await ctx.params;

  const trashedAt = new Date();
  const permanentlyDeleteAfter = new Date(trashedAt);
  permanentlyDeleteAfter.setDate(permanentlyDeleteAfter.getDate() + TRASH_RETENTION_DAYS);

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("items")
    .update({
      status: "trashed",
      trashed_at: trashedAt.toISOString(),
      permanently_delete_after: permanentlyDeleteAfter.toISOString(),
      updated_at: trashedAt.toISOString(),
    })
    .eq("id", id)
    .eq("household_id", auth.householdId)
    .neq("status", "trashed")
    .select("*, item_tags(tag_id)")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Item not found." }, { status: 404 });

  const row = data as ItemRowWithTags;
  return NextResponse.json({ item: rowToItem(row, (row.item_tags ?? []).map((jt) => jt.tag_id)) });
}
