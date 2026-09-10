"use client";

import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

// Shared wrapper so every call site gets the same safe-everywhere
// behavior voice-input-button.tsx already established (native-only in
// practice — @capacitor/haptics no-ops or falls back to
// navigator.vibrate on web, but .catch() here means a call site never
// needs its own Capacitor.isNativePlatform() check or try/catch just to
// add a haptic). Named by *meaning*, not by Capacitor's own
// ImpactStyle/NotificationType enum values, so a call site reads as
// "what happened" rather than "how hard to buzz" — e.g. hapticSuccess()
// at a save, not hapticImpact("light").

/** A light tick — toggles, selecting a row, minor state changes. */
export function hapticTap(): void {
  void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

/** A save, a completed task, anything that just succeeded. */
export function hapticSuccess(): void {
  void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
}

/** A destructive action actually going through — delete, remove, discard. */
export function hapticWarning(): void {
  void Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
}

/** Something failed — a rejected save, a failed request. */
export function hapticError(): void {
  void Haptics.notification({ type: NotificationType.Error }).catch(() => {});
}
