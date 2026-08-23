import { NextResponse } from "next/server";
import { extractReceipts } from "@/lib/vision/extract-receipts";
import type { ReceiptExtraction } from "@/lib/ai";
import { upstreamStatusCode } from "@/lib/upstream-error";

export const runtime = "nodejs";

// Receipt extraction endpoint (docs/Receipt Scanning Addendum.md §4) —
// lib/ai.ts's HttpVisionProvider.extractReceipts() calls this rather than
// the browser touching a model provider directly. Both models route
// through Vercel AI Gateway (lib/vision/extract-receipts.ts), same as
// /api/v1/vision/detect.
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
    const extracted = await extractReceipts(photos);
    const receipts: ReceiptExtraction[] = extracted.map((r) => ({
      store: r.store,
      date: r.date,
      subtotal: r.subtotal,
      tax: r.tax,
      total: r.total,
      card_last_four: r.card_last_four,
      items: r.items,
    }));
    return NextResponse.json({ receipts });
  } catch (error) {
    console.error("Receipt extraction failed:", error);
    const status = upstreamStatusCode(error);
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { error: "The AI service is experiencing high demand right now. Please try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Couldn't analyze your receipt. Please try again.", retryable: true }, { status: 502 });
  }
}
