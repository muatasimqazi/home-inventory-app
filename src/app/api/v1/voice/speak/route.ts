import { NextResponse } from "next/server";
import { generateSpeech } from "ai";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { upstreamStatusCode } from "@/lib/upstream-error";

export const runtime = "nodejs";

// Ask answers are already kept short by lib/ask/ask.ts's own system
// prompt ("short and direct... at most one sentence of relevant
// context") for reasons unrelated to this route — this cap is just a
// backstop against something unexpectedly long reaching TTS (cost scales
// with text length), not the real limit in practice.
const MAX_TEXT_LENGTH = 2000;

/**
 * Text-to-speech for Ask's answer, spoken back only when the question
 * itself came in by voice (docs/Voice Input Addendum.md §3) — a real
 * hands-free loop, not an unprompted-talking chat. Same Gateway as
 * transcribe/vision/Ask; no new external service. Returns raw audio
 * bytes (not JSON) so the client can hand the response body straight to
 * an <audio> element without an extra base64 round trip.
 */
export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { text } = (body ?? {}) as { text?: unknown };
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "`text` must be a non-empty string." }, { status: 400 });
  }

  try {
    const { audio } = await generateSpeech({
      model: "openai/tts-1",
      text: text.slice(0, MAX_TEXT_LENGTH),
      voice: "alloy",
    });
    // TS's DOM lib is overly strict about Uint8Array<ArrayBufferLike> vs
    // the ArrayBuffer-backed BodyInit it wants here — same known quirk
    // hooks/use-push-notifications.ts already works around — the runtime
    // value is a perfectly valid response body either way.
    return new NextResponse(audio.uint8Array as BodyInit, { headers: { "Content-Type": audio.mediaType } });
  } catch (error) {
    console.error("voice/speak failed:", error);
    const status = upstreamStatusCode(error);
    if (status === 503 || status === 429) {
      return NextResponse.json({ error: "The voice service is busy right now.", retryable: true }, { status: 503 });
    }
    return NextResponse.json({ error: "Couldn't generate speech for that.", retryable: true }, { status: 502 });
  }
}
