"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

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
      setTimeout(() => setState("idle"), 2000);
    }
  }

  async function startRecording() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
      return;
    }
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
        void transcribeRecording();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setState("recording");
      stopTimerRef.current = setTimeout(() => recorder.stop(), MAX_RECORDING_MS);
    } catch (error) {
      // The common case here is the user declining the permission prompt
      // — not a real error to log loudly about, just reflect it in the UI.
      console.error("VoiceInputButton: couldn't access the microphone:", error);
      setState("error");
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
