import { NextResponse } from "next/server";
import { extractStatement } from "@/lib/vision/extract-statement";
import type { StatementTransactionExtraction } from "@/lib/ai";
import { upstreamStatusCode } from "@/lib/upstream-error";

export const runtime = "nodejs";

// Statement extraction endpoint — lib/ai.ts's HttpVisionProvider.
// extractStatement() calls this rather than the browser touching a model
// provider directly. Both models route through Vercel AI Gateway
// (lib/vision/extract-statement.ts), same as the other /api/v1/vision/*
// routes. Single `file` (one PDF), not an array — a statement upload is
// always exactly one document, unlike receipts' "a stack of photos" case.
export async function POST(request: Request) {
  let file: unknown;
  try {
    ({ file } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof file !== "string" || file.length === 0) {
    return NextResponse.json({ error: "`file` must be a data URL string." }, { status: 400 });
  }

  try {
    const extracted = await extractStatement(file);
    const transactions: StatementTransactionExtraction[] = extracted.map((t) => ({
      date: t.date,
      merchant: t.merchant,
      amount: t.amount,
    }));
    return NextResponse.json({ transactions });
  } catch (error) {
    console.error("Statement extraction failed:", error);
    const status = upstreamStatusCode(error);
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { error: "The AI service is experiencing high demand right now. Please try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Couldn't analyze your statement. Please try again.", retryable: true }, { status: 502 });
  }
}
