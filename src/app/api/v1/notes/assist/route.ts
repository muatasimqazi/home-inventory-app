import { NextResponse } from "next/server";
import { assistWithNote, type NoteAssistTurn } from "@/lib/ask/note-assist";
import { upstreamStatusCode } from "@/lib/upstream-error";

export const runtime = "nodejs";

// The Notes editor's "ask about this note or request a change" bar
// (components/note-assistant-bar.tsx). No household id, no Supabase
// client — the client already has the one note's content (it's typing
// into it), so this is a pure text-in/text-out call, gated only by
// src/proxy.ts's blanket "every /api/v1/* route needs a signed-in
// session" rule (not public-listed there), same as
// /api/v1/finance/categorize needs no route-level auth check of its own.
const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTENT_LENGTH = 50_000; // generous — well beyond any real note, just a sanity bound on the model call
const MAX_HISTORY_TURNS = 20;

function isValidTurn(t: unknown): t is NoteAssistTurn {
  if (!t || typeof t !== "object") return false;
  const r = t as Record<string, unknown>;
  return (r.role === "user" || r.role === "assistant") && typeof r.content === "string";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { title, content, message, history } = (body ?? {}) as {
    title?: unknown;
    content?: unknown;
    message?: unknown;
    history?: unknown;
  };

  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "`message` must be a non-empty string." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `\`message\` is too long (max ${MAX_MESSAGE_LENGTH} characters).` }, { status: 400 });
  }
  if (typeof title !== "string") {
    return NextResponse.json({ error: "`title` must be a string." }, { status: 400 });
  }
  if (typeof content !== "string" || content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: `\`content\` must be a string (max ${MAX_CONTENT_LENGTH} characters).` }, { status: 400 });
  }
  if (history !== undefined && (!Array.isArray(history) || !history.every(isValidTurn) || history.length > MAX_HISTORY_TURNS)) {
    return NextResponse.json({ error: `\`history\` must be an array of at most ${MAX_HISTORY_TURNS} { role, content } turns.` }, { status: 400 });
  }

  try {
    const result = await assistWithNote(title, content, (history as NoteAssistTurn[] | undefined) ?? [], message.trim());
    return NextResponse.json(result);
  } catch (error) {
    console.error("Note assist failed:", error);
    const status = upstreamStatusCode(error);
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { error: "The AI service is experiencing high demand right now. Please try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Couldn't process that. Please try again.", retryable: true }, { status: 502 });
  }
}
