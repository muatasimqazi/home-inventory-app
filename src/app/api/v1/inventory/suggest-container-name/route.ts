import { NextResponse } from "next/server";
import { suggestContainerLabel } from "@/lib/inventory/suggest-container-name";
import { normalizeCodePrefix } from "@/lib/display-code";
import { upstreamStatusCode } from "@/lib/upstream-error";

export const runtime = "nodejs";

// A generous but real cap — no route this app exposes should be able to
// kick off an unbounded model call regardless of what a client sends.
const MAX_ITEMS = 60;

// AI container-label suggestion — a container's own current item names in,
// a short suggested name AND a content-derived Container-ID prefix out.
// Pure text task via lib/inventory/suggest-container-name.ts, same
// Gateway-routed primary+fallback reliability shape as every other AI
// route in this app.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { itemNames } = (body ?? {}) as { itemNames?: unknown };
  if (!Array.isArray(itemNames) || itemNames.length === 0 || !itemNames.every((n) => typeof n === "string" && n.trim())) {
    return NextResponse.json({ error: "`itemNames` must be a non-empty array of non-empty strings." }, { status: 400 });
  }

  try {
    const { name, rawCodePrefix } = await suggestContainerLabel(itemNames.slice(0, MAX_ITEMS));
    // normalizeCodePrefix can legitimately return null (the model's raw
    // string had fewer than 2 letters in it once cleaned) — "BIN" is the
    // same generic fallback prefix nextDisplayCode() already uses when a
    // location name itself yields nothing usable, so an unusable
    // suggestion degrades to the same safe default rather than failing
    // the whole request over a cosmetic field.
    const codePrefix = normalizeCodePrefix(rawCodePrefix) ?? "BIN";
    return NextResponse.json({ name, codePrefix });
  } catch (error) {
    console.error("Container-label suggestion failed:", error);
    const status = upstreamStatusCode(error);
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { error: "The AI service is experiencing high demand right now. Please try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Couldn't suggest a label. Please try again.", retryable: true }, { status: 502 });
  }
}
