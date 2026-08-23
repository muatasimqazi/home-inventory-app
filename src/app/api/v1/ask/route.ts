import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { askQuestion } from "@/lib/ask/ask";
import { upstreamStatusCode } from "@/lib/upstream-error";

export const runtime = "nodejs";

// AI Q&A over the household's own data — both finances ("how much did I
// spend at Costco last month?") and physical inventory ("where did I keep
// my measuring tape?"). Shared across both domains on purpose (see the
// Ask floating widget in components/ask-fab.tsx, mounted once in
// AppShell rather than living under /finance) — a household doesn't stop
// being able to ask about its stuff just because it's on a Finance screen.
// Auth is the session cookie via getSupabaseServerClient() — every tool
// call the model makes (lib/ask/tools.ts) runs through that same
// session-bound client, so RLS scopes every answer to what the asking
// user can actually see (private accounts included) without this route
// doing any manual household/privacy filtering itself.
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
    const { text, references } = await askQuestion(question.trim(), supabase, householdId);
    return NextResponse.json({ answer: text, references });
  } catch (error) {
    console.error("Ask failed:", error);
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
