import { NextResponse } from "next/server";
import { requireHouseholdMember } from "@/lib/authorize";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { generateLocationPhoto } from "@/lib/vision/generate-location-photo";
import { newId } from "@/lib/id";

export const runtime = "nodejs";

const MAX_ROOM_TYPE_LENGTH = 60;
const MAX_DETAIL_LENGTH = 200;

/**
 * Generates one AI cover photo for a household storage Location (e.g.
 * "Kitchen", "Pantry", "Wardrobe") and uploads it to the shared
 * "item-photos" Storage bucket — deliberately mirrors uploadCoverPhotoFile
 * (lib/store.ts), the manual-upload half of the exact same job, so the
 * two paths converge on identical output (a path in that bucket). It does
 * NOT touch the location row itself: same separation manual upload
 * already has between "get a photo into Storage" and "point the location
 * at it" (the latter — generateLocationCoverPhoto — writes the row, with
 * the same optimistic-set/revert-on-failure/old-photo-cleanup dance
 * setLocationCoverPhoto already does for a manually chosen file).
 *
 * Runs under the caller's own session (getSupabaseServerClient(), not the
 * admin/service-role client) — RLS on the "item-photos" bucket is already
 * exactly the household-membership grant this route needs, same posture
 * as /api/v1/vision/generate-studio-photo.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { householdId, locationId, roomType, detail } = (body ?? {}) as {
    householdId?: unknown;
    locationId?: unknown;
    roomType?: unknown;
    detail?: unknown;
  };
  if (typeof householdId !== "string" || !householdId) return NextResponse.json({ error: "`householdId` is required." }, { status: 400 });
  if (typeof locationId !== "string" || !locationId) return NextResponse.json({ error: "`locationId` is required." }, { status: 400 });
  if (typeof roomType !== "string" || !roomType.trim() || roomType.length > MAX_ROOM_TYPE_LENGTH) {
    return NextResponse.json({ error: `\`roomType\` is required (max ${MAX_ROOM_TYPE_LENGTH} characters).` }, { status: 400 });
  }
  if (detail !== undefined && (typeof detail !== "string" || detail.length > MAX_DETAIL_LENGTH)) {
    return NextResponse.json({ error: `\`detail\` must be a string (max ${MAX_DETAIL_LENGTH} characters).` }, { status: 400 });
  }

  const auth = await requireHouseholdMember(householdId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = await getSupabaseServerClient();

  const { data: locationRow } = await supabase.from("locations").select("id, household_id").eq("id", locationId).maybeSingle();
  if (!locationRow || locationRow.household_id !== householdId) {
    return NextResponse.json({ error: "Location not found." }, { status: 404 });
  }

  let generatedBase64: string;
  try {
    generatedBase64 = await generateLocationPhoto(roomType.trim(), detail?.trim() || null);
  } catch (error) {
    console.error("generate-location-photo: generation failed:", error);
    return NextResponse.json({ error: "Couldn't generate a photo. Please try again.", retryable: true }, { status: 502 });
  }

  const path = `${householdId}/${newId()}`;
  // PNG unconditionally, same reasoning as generate-studio-photo — a fine
  // format for a banner photo, not worth a content-type branch here.
  const { error: uploadError } = await supabase.storage.from("item-photos").upload(path, Buffer.from(generatedBase64, "base64"), { contentType: "image/png" });
  if (uploadError) {
    console.error("generate-location-photo: upload failed:", uploadError.message);
    return NextResponse.json({ error: "Generated, but couldn't save the photo. Please try again.", retryable: true }, { status: 502 });
  }

  return NextResponse.json({ path });
}
