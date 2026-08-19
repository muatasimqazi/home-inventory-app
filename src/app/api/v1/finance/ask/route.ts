import { NextResponse } from "next/server";
import { APICallError, RetryError } from "ai";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { askFinanceQuestion } from "@/lib/finance-ask/ask";

/** Same unwrap as /api/v1/vision/detect — a (possibly retry-wrapped) AI SDK error down to a real HTTP status code from the provider, if there is one. */
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

// AI Q&A over the household's own finance data ("how much did I spend at
// Costco last month?", "when did I last buy milk?"). Auth is the session
// cookie via getSupabaseServerClient() — every tool call the model makes
// (lib/finance-ask/tools.ts) runs through that same session-bound client,
// so RLS scopes every answer to what the asking user can actually see
// (private accounts included) without this route doing any manual
// household/privacy filtering itself.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { question, householdId } = (body ?? {}) as { question?: unknown; householdId?: unknown };
  if (typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ error: "`question` must be a non-empty string." }, { status: 400 });
  }
  if (typeof householdId !== "string" || !householdId) {
    return NextResponse.json({ error: "`householdId` is required." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const answer = await askFinanceQuestion(question.trim(), supabase, householdId);
    return NextResponse.json({ answer });
  } catch (error) {
    console.error("Finance ask failed:", error);
    const status = upstreamStatusCode(error);
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { error: "The AI service is experiencing high demand right now. Please try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Couldn't answer that. Please try again.", retryable: true }, { status: 502 });
  }
}
