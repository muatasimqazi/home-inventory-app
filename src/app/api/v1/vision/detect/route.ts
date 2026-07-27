import { NextResponse } from "next/server";
import { detectItemsWithGemini } from "@/lib/gemini/vision";
import { withReview, type DetectedItem } from "@/lib/ai";

export const runtime = "nodejs";

// Real Gemini vision endpoint (PRD v2 §12), now on the app's active path —
// lib/ai.ts's `visionProvider` points at GeminiVisionProvider, which calls
// this route rather than the browser touching Gemini directly, so
// GEMINI_API_KEY only ever lives here, server-side.
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

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured." }, { status: 503 });
  }

  try {
    const detected = await detectItemsWithGemini(photos);
    const items: DetectedItem[] = detected.map(withReview);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Gemini vision detection failed:", error);
    return NextResponse.json({ error: "Vision detection failed." }, { status: 502 });
  }
}
