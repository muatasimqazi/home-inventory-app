"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { playRecordingStartTone, playRecordingStopTone } from "@/lib/audio-feedback";
import { hapticTap, hapticError } from "@/lib/haptics";

type RecordingState = "idle" | "recording" | "transcribing" | "error";

// Caps a recording both for cost and because this is a search/ask input,
// not a dictation tool — docs/Voice Input Addendum.md §5. Real
// enforcement is server-side (api/v1/voice/transcribe's own
// MAX_AUDIO_BYTES); this just stops the mic before anyone hits it.
const MAX_RECORDING_MS = 60_000;

/**
 * Mic button for voice input (Search, Ask — docs/Voice Input Addendum.md
 * §1/§2). Owns the record → upload → transcribe lifecycle and nothing
 * else; the caller decides what to do with the resulting text via
 * onTranscript (populates the existing input, never auto-submits — see
 * the addendum's own reasoning). Tap once to start recording, tap again
 * to stop — explicit start/stop, matching this app's own capture-flow
 * convention elsewhere (the camera capture pages), rather than guessing
 * when someone's done talking via silence detection.
 */
export function VoiceInputButton({ onTranscript, className }: { onTranscript: (text: string) => void; className?: string }) {
  const [state, setState] = useState<RecordingState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A plain ref, not React state — state updates are batched/async, so
  // `state` in the onClick handler's closure can still read "idle" for
  // a beat after a tap already started startRecording() (setState
  // "recording" doesn't happen until getUserMedia resolves, which isn't
  // instant). A fast double-tap in that window used to call
  // startRecording() twice before either render caught up, firing the
  // start tone/haptic twice — reported as "two tones". A ref is read
  // and set synchronously, so it closes that window immediately instead
  // of racing a render.
  const startingRef = useRef(false);

  async function transcribeRecording() {
    setState("transcribing");
    const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    try {
      const res = await fetch("/api/v1/voice/transcribe", {
        method: "POST",
        headers: { "Content-Type": mimeType },
        body: blob,
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Transcription failed.");
      if (data.text) onTranscript(data.text);
      setState("idle");
    } catch (error) {
      console.error("VoiceInputButton: transcription failed:", error);
      setState("error");
      hapticError();
      setTimeout(() => setState("idle"), 2000);
    }
  }

  async function startRecording() {
    if (startingRef.current) return;
    startingRef.current = true;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      startingRef.current = false;
      setState("error");
      setTimeout(() => setState("idle"), 2000);
      return;
    }
    // Fired here, before getUserMedia — not after, like the original cut
    // of this did. Requesting the mic switches iOS's AVAudioSession into
    // a recording category, and that switch appears to step on/mute
    // audio already mid-flight from a separate output-only AudioContext
    // (matches what was reported: tones "not fully working" — inconsistent
    // rather than fully silent). Firing before the switch happens, right
    // on the tap itself, avoids the race instead of trying to win it.
    playRecordingStartTone();
    hapticTap();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
        // Fires whether stopped by a tap or by MAX_RECORDING_MS's own
        // auto-stop, so "closing makes a noise" holds either way rather
        // than only for the explicit-tap path. Unlike the start tone,
        // this one has no competing session-switch race — the mic
        // track's already stopped on the line above by the time this
        // plays.
        playRecordingStopTone();
        hapticTap();
        void transcribeRecording();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setState("recording");
      startingRef.current = false;
      stopTimerRef.current = setTimeout(() => recorder.stop(), MAX_RECORDING_MS);
    } catch (error) {
      // The common case here is the user declining the permission prompt
      // — not a real error to log loudly about, just reflect it in the UI.
      console.error("VoiceInputButton: couldn't access the microphone:", error);
      startingRef.current = false;
      setState("error");
      hapticError();
      setTimeout(() => setState("idle"), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (state === "recording") mediaRecorderRef.current?.stop();
        else if (state === "idle" || state === "error") void startRecording();
      }}
      disabled={state === "transcribing"}
      aria-label={state === "recording" ? "Stop recording" : "Voice input"}
      className={cn(
        "tap-target flex size-9 shrink-0 items-center justify-center rounded-full",
        state === "recording" ? "bg-danger text-white" : "text-muted-foreground hover:bg-surface-muted",
        className
      )}
    >
      {state === "transcribing" ? (
        <Icon name="spinner" size={16} className="animate-spin" />
      ) : state === "error" ? (
        <Icon name="alertCircle" size={16} className="text-danger" />
      ) : (
        <Icon name="mic" size={16} className={state === "recording" ? "animate-pulse" : undefined} />
      )}
    </button>
  );
}
