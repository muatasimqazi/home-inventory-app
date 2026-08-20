"use client";

import { useEffect, useState } from "react";

/**
 * iOS Safari doesn't support the `interactive-widget=resizes-content`
 * viewport meta property (a Chromium-only feature — see layout.tsx), so
 * opening the software keyboard there shrinks the *visual* viewport while
 * leaving `position: fixed` elements anchored to the full (keyboard-
 * covered) layout viewport — they end up hidden behind the keyboard. The
 * VisualViewport API works across both engines, so track the gap it
 * reports and use it to nudge fixed bottom UI back into view.
 *
 * Deliberately a no-op on Chromium: `interactive-widget=resizes-content`
 * already makes Chromium shrink the *layout* viewport itself when the
 * keyboard opens (window.innerHeight really changes, not just the visual
 * viewport), which already repositions every `fixed`/`bottom-0` element
 * correctly with zero JS. Running this hook's own visualViewport-driven
 * compensation *on top of* that native resize was the actual bug behind
 * "whole page jumps/resizes oddly on Android Chrome" — during the
 * keyboard-open transition, `innerHeight` and `visualViewport.height`
 * don't shrink in perfect lockstep, so this hook would compute a
 * transient nonzero inset and apply an *additional* JS-driven shift on
 * top of the browser's own already-correct, natively-animated resize —
 * two competing resize mechanisms fighting mid-animation, not one
 * cohesive one. Guarding on `'chrome' in window` (true for every
 * Chromium-based browser: Chrome, Edge, Brave, Android WebView; false for
 * Safari/WebKit and Firefox) restores this hook to only doing real work
 * on the one engine that actually needs it.
 */
export function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    // Chromium already resizes the layout viewport natively — nothing
    // for this hook to compensate for, and trying to anyway is the bug.
    if ("chrome" in window) return;

    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const gap = window.innerHeight - vv.height - vv.offsetTop;
      setInset(Math.max(0, Math.round(gap)));
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
