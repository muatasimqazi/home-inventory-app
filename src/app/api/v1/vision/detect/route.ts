import { NextResponse } from "next/server";
import { detectItems } from "@/lib/vision/detect";
import { withReview, type DetectedItem } from "@/lib/ai";
import { upstreamStatusCode } from "@/lib/upstream-error";

export const runtime = "nodejs";

// Real vision detection endpoint (PRD v2 §12), now on the app's active path
// — lib/ai.ts's `visionProvider` points at HttpVisionProvider, which calls
// this route rather than the browser touching either model provider
// directly. Both the primary and fallback models run through Vercel AI
// Gateway (see lib/vision/detect.ts), so there's no provider API key to
// guard server-side here anymore — just the Gateway's own credentials.
export async function POST(request: Request) {
  let photos: unknown;
  let locationName: unknown;
  try {
    ({ photos, locationName } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(photos) || photos.length === 0 || !photos.every((p) => typeof p === "string")) {
    return NextResponse.json({ error: "`photos` must be a non-empty array of data URL strings." }, { status: 400 });
  }
  // Optional hint — the household's own Location name for the capture's
  // current destination. Anything other than a non-empty string (missing,
  // null, wrong type) is treated as "no hint" rather than a 400: this field
  // is purely a soft steer, never required.
  const locationNameHint = typeof locationName === "string" && locationName.trim() ? locationName : null;

  try {
    const detected = await detectItems(photos, locationNameHint);
    const items: DetectedItem[] = detected.map(withReview);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Vision detection failed:", error);
    const status = upstreamStatusCode(error);
    // 503/429 from the model provider itself is transient overload/rate-
    // limiting, not a real failure — worth telling the user that plainly
    // (and that retrying is the actual fix) instead of a generic "something
    // broke" message. Deliberately provider-agnostic: by the time this
    // fires, either the primary or the fallback could be the one that
    // actually 503'd/429'd.
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { error: "The AI service is experiencing high demand right now. Please try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Couldn't analyze your photos. Please try again.", retryable: true }, { status: 502 });
  }
}
