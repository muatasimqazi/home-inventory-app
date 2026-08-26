import { NextResponse } from "next/server";
import { requireHouseholdMember } from "@/lib/authorize";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { removeItemBackground } from "@/lib/vision/remove-background";
import { newId } from "@/lib/id";

export const runtime = "nodejs";

/**
 * Automatic background-removal step for capture (PRD's earlier per-item
 * cost-driven deferral no longer applies — see remove-background.ts's own
 * comment). Runs entirely under the caller's own session
 * (getSupabaseServerClient(), not the admin/service-role client) — same
 * "real auth, no elevated privilege" posture as every other route in this
 * directory.
 *
 * Unlike generate-studio-photo/route.ts, this doesn't fetch a *stored*
 * original from Storage first — the caller (capture/review/page.tsx)
 * already has the freshly-cropped item photo in memory (from
 * cropToItem, before it's even uploaded as the cover photo), so it's
 * sent directly in the request body instead of a round trip through
 * Storage first.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { householdId, photo } = (body ?? {}) as { householdId?: unknown; photo?: unknown };
  if (typeof householdId !== "string" || !householdId) return NextResponse.json({ error: "`householdId` is required." }, { status: 400 });
  if (typeof photo !== "string" || !photo.startsWith("data:image/")) return NextResponse.json({ error: "`photo` must be an image data URL." }, { status: 400 });

  const auth = await requireHouseholdMember(householdId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let resultPng: Buffer;
  try {
    resultPng = await removeItemBackground(photo);
  } catch (error) {
    console.error("remove-background: generation failed:", error);
    return NextResponse.json({ error: "Couldn't remove the background. Please try again.", retryable: true }, { status: 502 });
  }

  const supabase = await getSupabaseServerClient();
  const path = `${householdId}/${newId()}`;
  const { error: uploadError } = await supabase.storage.from("item-photos").upload(path, resultPng, { contentType: "image/png" });
  if (uploadError) {
    console.error("remove-background: couldn't upload result:", uploadError);
    return NextResponse.json({ error: "Generated, but couldn't save the result. Please try again.", retryable: true }, { status: 502 });
  }

  return NextResponse.json({ path });
}
