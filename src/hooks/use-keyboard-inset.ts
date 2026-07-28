"use client";

import { useEffect, useState } from "react";

/**
 * iOS Safari doesn't support the `interactive-widget=resizes-content`
 * viewport meta property (a Chromium-only feature), so opening the
 * software keyboard there shrinks the *visual* viewport while leaving
 * `position: fixed` elements anchored to the full (keyboard-covered)
 * layout viewport — they end up hidden behind the keyboard. The
 * VisualViewport API works across both engines, so track the gap it
 * reports and use it to nudge fixed bottom UI back into view.
 */
export function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
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
