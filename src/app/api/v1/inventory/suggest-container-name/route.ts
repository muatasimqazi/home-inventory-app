import { NextResponse } from "next/server";
import { suggestContainerName } from "@/lib/inventory/suggest-container-name";
import { upstreamStatusCode } from "@/lib/upstream-error";

export const runtime = "nodejs";

// A generous but real cap — no route this app exposes should be able to
// kick off an unbounded model call regardless of what a client sends.
const MAX_ITEMS = 60;

// AI container-name suggestion — a container's own current item names in,
// a short suggested label out. Pure text task via lib/inventory/
// suggest-container-name.ts, same Gateway-routed primary+fallback
// reliability shape as every other AI route in this app.
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
    const suggestedName = await suggestContainerName(itemNames.slice(0, MAX_ITEMS));
    return NextResponse.json({ suggestedName });
  } catch (error) {
    console.error("Container-name suggestion failed:", error);
    const status = upstreamStatusCode(error);
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { error: "The AI service is experiencing high demand right now. Please try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Couldn't suggest a name. Please try again.", retryable: true }, { status: 502 });
  }
}
