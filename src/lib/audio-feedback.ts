"use client";

// Short UI tones (recording start/stop, etc.) generated on the fly via
// Web Audio's OscillatorNode rather than shipped as static asset files —
// no licensing/sourcing concerns, trivially tunable, and works identically
// in a real browser tab and inside the Capacitor WebView (Web Audio isn't
// a native-only API, unlike @capacitor/haptics alongside it in callers of
// this module).
//
// One shared AudioContext, created lazily on first use — browsers refuse
// to run one until a real user gesture has happened at least once, and
// creating a fresh context per tone is wasteful besides.
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/**
 * Plays a short sine-wave beep. Frequency in Hz, duration in ms. A quick
 * linear fade-out (rather than a hard stop) avoids the audible click a
 * sine wave cut off mid-cycle produces.
 */
function playTone(frequencyHz: number, durationMs: number, gain = 0.15): void {
  const audioCtx = getContext();
  if (!audioCtx) return;
  try {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequencyHz;
    const now = audioCtx.currentTime;
    const durationSec = durationMs / 1000;
    gainNode.gain.setValueAtTime(gain, now);
    gainNode.gain.linearRampToValueAtTime(0, now + durationSec);
    oscillator.connect(gainNode).connect(audioCtx.destination);
    oscillator.start(now);
    oscillator.stop(now + durationSec);
  } catch (error) {
    console.error("audio-feedback: playTone failed:", error);
  }
}

/** Recording started — a short rising beep. */
export function playRecordingStartTone(): void {
  playTone(880, 90);
}

/** Recording stopped/closed — a short lower beep, distinct from start. */
export function playRecordingStopTone(): void {
  playTone(440, 110);
}
