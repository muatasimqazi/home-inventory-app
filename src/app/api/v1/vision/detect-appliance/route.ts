import { NextResponse } from "next/server";
import { APICallError, RetryError } from "ai";
import { detectApplianceLabel } from "@/lib/vision/detect";

/** Unwraps a (possibly retry-wrapped) AI SDK error down to a real HTTP status code from the provider, if there is one. Duplicated from /api/v1/vision/detect/route.ts rather than shared — small enough, and keeps this route independently deletable/movable if appliance detection ever needs different handling. */
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

// Appliance label reading endpoint (Household Ledger PRD §27, Implementation
// Plan Workstream 7). Mirrors /api/v1/vision/detect/route.ts's shape exactly
// — same Gateway-routed primary+fallback model pair, same transient-overload
// handling — just a different underlying detection task (one label reading,
// not a list of scene items).
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
    const detection = await detectApplianceLabel(photos);
    return NextResponse.json(detection);
  } catch (error) {
    console.error("Appliance label detection failed:", error);
    const status = upstreamStatusCode(error);
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { error: "The AI service is experiencing high demand right now. Please try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Couldn't read the label. Please try again.", retryable: true }, { status: 502 });
  }
}
