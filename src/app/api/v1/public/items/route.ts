import { NextResponse } from "next/server";
import { requireApiKey, itemVisibilityFilter } from "@/lib/api-key-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { newId } from "@/lib/id";
import { categoryEmoji } from "@/lib/category";
import { rowToItem, itemToInsertRow, type ItemRow } from "@/lib/supabase/mappers";
import { CATEGORIES } from "@/lib/types";
import type { Item } from "@/lib/types";

export const runtime = "nodejs";

type ItemRowWithTags = ItemRow & { item_tags: { tag_id: string }[] | null };

export async function GET(request: Request) {
  const auth = await requireApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");
  const containerId = searchParams.get("containerId");
  const category = searchParams.get("category");

  const admin = getSupabaseAdminClient();
  const visibilityFilter = await itemVisibilityFilter(admin, auth.householdId, auth.createdByUserId);

  let query = admin
    .from("items")
    .select("*, item_tags(tag_id)")
    .eq("household_id", auth.householdId)
    .eq("status", "active")
    .or(visibilityFilter)
    .order("name");
  if (locationId) query = query.eq("location_id", locationId);
  if (containerId) query = query.eq("container_id", containerId);
  if (category) query = query.eq("category", category);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data as ItemRowWithTags[]).map((row) => rowToItem(row, (row.item_tags ?? []).map((jt) => jt.tag_id)));
  return NextResponse.json({ items });
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
  const { name, category, quantity, notes, locationId, containerId } = (body ?? {}) as {
    name?: unknown;
    category?: unknown;
    quantity?: unknown;
    notes?: unknown;
    locationId?: unknown;
    containerId?: unknown;
  };
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) return NextResponse.json({ error: "`name` is required." }, { status: 400 });
  const resolvedCategory = typeof category === "string" && (CATEGORIES as readonly string[]).includes(category) ? category : "Miscellaneous";

  const admin = getSupabaseAdminClient();

  // Same independent household-scoping check as containers/route.ts —
  // locationId/containerId are optional here (an item can be "Unfiled"),
  // but if given at all they must actually belong to this key's household.
  if (typeof locationId === "string" && locationId) {
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
  if (typeof containerId === "string" && containerId) {
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

  const parsedQuantity = typeof quantity === "number" && Number.isFinite(quantity) ? Math.max(0, Math.min(9999, Math.round(quantity))) : 1;

  const item: Item = {
    id: newId(),
    householdId: auth.householdId,
    locationId: typeof locationId === "string" && locationId ? locationId : null,
    containerId: typeof containerId === "string" && containerId ? containerId : null,
    name: trimmedName,
    originalDetectedName: null,
    category: resolvedCategory,
    quantity: parsedQuantity,
    notes: typeof notes === "string" ? notes.trim() : "",
    description: "",
    estimatedValue: null,
    photoEmoji: categoryEmoji(resolvedCategory),
    coverPhotoPath: null,
    backgroundRemovedPhotoPath: null,
    status: "active",
    needsReview: false,
    tagIds: [],
    extraDetails: {},
    ownerPersonId: null,
    isShared: false,
    minQuantity: null,
    lowStockSince: null,
    createdByUserId: auth.createdByUserId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    trashedAt: null,
    permanentlyDeleteAfter: null,
  };

  const { error } = await admin.from("items").insert(itemToInsertRow(item));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ item }, { status: 201 });
}
