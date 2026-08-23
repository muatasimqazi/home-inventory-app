import { NextResponse } from "next/server";
import { suggestApplianceDocumentLinks } from "@/lib/vision/detect";
import { upstreamStatusCode } from "@/lib/upstream-error";

export const runtime = "nodejs";

// Same shape as /api/v1/vision/detect — this route exists so the client
// never touches a model provider directly, only this server-side call,
// which routes through Vercel AI Gateway (see lib/vision/detect.ts).
export async function POST(request: Request) {
  let manufacturer: unknown;
  let modelNumber: unknown;
  try {
    ({ manufacturer, modelNumber } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof manufacturer !== "string" || !manufacturer.trim() || typeof modelNumber !== "string" || !modelNumber.trim()) {
    return NextResponse.json({ error: "`manufacturer` and `modelNumber` are both required, non-empty strings." }, { status: 400 });
  }

  try {
    const suggestion = await suggestApplianceDocumentLinks(manufacturer.trim(), modelNumber.trim());
    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error("Appliance document link suggestion failed:", error);
    const status = upstreamStatusCode(error);
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { error: "The AI service is experiencing high demand right now. Please try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Couldn't look up documents right now. Please try again.", retryable: true }, { status: 502 });
  }
}
