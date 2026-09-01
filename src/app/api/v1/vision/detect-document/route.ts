import { NextResponse } from "next/server";
import { detectDocument } from "@/lib/vision/detect";
import { upstreamStatusCode } from "@/lib/upstream-error";

export const runtime = "nodejs";

// Document-scan reading endpoint — mirrors
// /api/v1/vision/detect-appliance/route.ts's shape exactly (same
// Gateway-routed primary+fallback model pair, same transient-overload
// handling), just a different underlying detection task (one document
// reading — title/issuer/document number/expiration — not a label).
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
    const detection = await detectDocument(photos);
    return NextResponse.json(detection);
  } catch (error) {
    console.error("Document scan detection failed:", error);
    const status = upstreamStatusCode(error);
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { error: "The AI service is experiencing high demand right now. Please try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Couldn't read the document. Please try again.", retryable: true }, { status: 502 });
  }
}
