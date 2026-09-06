import { NextResponse } from "next/server";
import { transcribe } from "ai";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { upstreamStatusCode } from "@/lib/upstream-error";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// A max clip length keeps this a "dictate a search/question" input, not a
// dictation tool, and bounds cost — docs/Voice Input Addendum.md §5. The
// client-side recorder (components/voice-input-button.tsx) auto-stops at
// the same limit; this is the real enforcement, not just a courtesy.
const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // ~60s at typical webm/opus bitrates, generous headroom

/**
 * Speech-to-text for the voice input mic (Search, Ask — docs/Voice Input
 * Addendum.md §1/§2). Takes the raw recorded clip as the request body
 * (whatever MIME type MediaRecorder produced — webm/opus on Chrome/
 * Android, mp4/aac on Safari; Whisper accepts either) and returns the
 * transcript, routed through the same Vercel AI Gateway vision detection
 * (lib/vision/detect.ts) and Ask (lib/ask/ask.ts) already use — no new
 * external service, just one more model type on the same Gateway.
 */
export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // docs/Rate Limiting Addendum.md — shares Ask's own limiter tier;
  // voice is just a different way in to the same feature.
  const limit = await checkRateLimit("ask", user.id);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're doing that a lot right now — try again in a moment.", retryable: true },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const arrayBuffer = await request.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    return NextResponse.json({ error: "No audio received." }, { status: 400 });
  }
  if (arrayBuffer.byteLength > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "That recording is too long." }, { status: 400 });
  }

  try {
    const { text } = await transcribe({
      model: "openai/whisper-1",
      audio: new Uint8Array(arrayBuffer),
    });
    return NextResponse.json({ text: text.trim() });
  } catch (error) {
    console.error("voice/transcribe failed:", error);
    const status = upstreamStatusCode(error);
    if (status === 503 || status === 429) {
      return NextResponse.json({ error: "The transcription service is busy right now. Please try again.", retryable: true }, { status: 503 });
    }
    return NextResponse.json({ error: "Couldn't transcribe that. Please try again.", retryable: true }, { status: 502 });
  }
}
