import { NextResponse } from "next/server";
import { detectWardrobeItem } from "@/lib/vision/detect";
import { upstreamStatusCode } from "@/lib/upstream-error";

export const runtime = "nodejs";

// Wardrobe item cataloging endpoint (docs/Wardrobe Inventory.md). Mirrors
// /api/v1/vision/detect-appliance/route.ts's shape exactly — same
// Gateway-routed primary+fallback model pair, same transient-overload
// handling — just a different underlying detection task (one clothing
// item, not a label reading).
export async function POST(request: Request) {
  let photos: unknown;
  try {
    ({ photos } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(photos) || photos.length === 0 || !photos.every((p) => typeof p === "string")) {
    return NextResponse.json({ error: "`photos` must be a non-empty array of data URL strings." }, { status: 400 });
  }

  try {
    const detection = await detectWardrobeItem(photos);
    return NextResponse.json(detection);
  } catch (error) {
    console.error("Wardrobe item detection failed:", error);
    const status = upstreamStatusCode(error);
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { error: "The AI service is experiencing high demand right now. Please try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Couldn't catalog this item. Please try again.", retryable: true }, { status: 502 });
  }
}
