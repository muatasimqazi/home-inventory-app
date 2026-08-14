import { NextResponse } from "next/server";
import { APICallError, RetryError } from "ai";
import { detectItemsWithGemini } from "@/lib/gemini/vision";
import { withReview, type DetectedItem } from "@/lib/ai";

/** Unwraps a (possibly retry-wrapped) AI SDK error down to a real HTTP status code from the provider, if there is one. */
function upstreamStatusCode(error: unknown): number | undefined {
  if (APICallError.isInstance(error)) return error.statusCode;
  if (RetryError.isInstance(error)) {
    for (const inner of error.errors) {
      const code = upstreamStatusCode(inner);
      if (code !== undefined) return code;
    }
  }
  return undefined;
}

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

  // No upfront GEMINI_API_KEY check here anymore: detectItemsWithGemini
  // handles a missing/failing key itself and falls back to a Gateway model,
  // so returning early would skip that fallback entirely in exactly the
  // case it exists for.
  try {
    const detected = await detectItemsWithGemini(photos);
    const items: DetectedItem[] = detected.map(withReview);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Gemini vision detection failed:", error);
    const status = upstreamStatusCode(error);
    // 503/429 from Gemini itself is transient overload/rate-limiting, not a
    // real failure — worth telling the user that plainly (and that retrying
    // is the actual fix) instead of a generic "something broke" message.
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { error: "Google's AI is experiencing high demand right now. Please try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Couldn't analyze your photos. Please try again.", retryable: true }, { status: 502 });
  }
}
