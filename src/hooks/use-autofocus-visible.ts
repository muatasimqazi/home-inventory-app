"use client";

import { useEffect, type DependencyList, type RefObject } from "react";

/**
 * Replaces the plain `autoFocus` prop wherever a field needs to grab the
 * keyboard the instant a page/sheet appears. Two distinct iOS Safari bugs
 * `autoFocus` alone doesn't cover:
 *
 * 1. A focus() fired at the exact instant of mount, before the browser
 *    has actually painted, quietly loses iOS's "recently interacted"
 *    window — the caret shows but the keyboard never opens. Deferring one
 *    frame (search/page.tsx's own inputRef effect established this fix
 *    first, for its own decoy-search-bar case) is what actually works.
 * 2. Once the keyboard *does* open, nothing scrolls the newly-focused
 *    field back into view against it — a field positioned even a little
 *    way down a form, or near the top of a bottom sheet that's now
 *    fighting the keyboard for the remaining viewport height, can end up
 *    hidden behind the keyboard with no native re-scroll to fix it. This
 *    is the "keyboard opens, but the input is nowhere in view" report.
 *    A short delay before scrolling (rather than reacting to
 *    visualViewport's resize, which doesn't fire reliably at focus time
 *    either) gives the keyboard's own open animation time to actually
 *    finish first — scrolling mid-animation just races it. Deliberately
 *    a no-op on Chromium and `block: "nearest"` (not "center") for the
 *    same reason useKeyboardInset is a Chromium no-op (see that file):
 *    `interactive-widget=resizes-content` already shrinks the layout
 *    viewport and natively scrolls the focused field into view there —
 *    running this hook's own scrollIntoView *on top of* that native one
 *    was the actual bug behind "keyboard opens, pushes the rest of the
 *    UI up and out of view, then looks wrong once focus is lost": two
 *    competing scrolls (one native+minimal, one JS-driven+recentering)
 *    fighting mid-animation, and the JS one's extra offset outliving the
 *    keyboard closing since nothing reverses it. Safari/WebKit still
 *    needs the manual assist (no native viewport resize there at all),
 *    but even there `"nearest"` — scroll only the minimum distance
 *    needed, not recenter the whole page — is what a well-behaved native
 *    scroll-into-view would have done anyway.
 *
 * `deps` defaults to mount-only (`[]`) — the common case, an input
 * that's there from the moment its owning component renders. Pass e.g.
 * `[mode === "email"]` for a field that only conditionally appears
 * *within* an already-mounted component (a tab/step switch, not a
 * fresh page) — plain `autoFocus` re-fires automatically whenever its
 * own DOM node is freshly created, mount-only or not, since React
 * applies it at the point the node is inserted; this hook's effect only
 * re-runs when something in `deps` actually changes, so a caller whose
 * field comes and goes within one already-mounted component has to name
 * what "comes and goes" here explicitly. Firing on every dep change
 * (not just the transition into view) is harmless — `ref.current` is
 * simply null on every render where the field isn't there.
 */
export function useAutoFocusVisible<T extends HTMLElement>(ref: RefObject<T | null>, deps: DependencyList = []) {
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const raf = requestAnimationFrame(() => {
      ref.current?.focus();
      // Chromium already resizes the layout viewport natively and scrolls
      // the focused field into view itself — nothing for this hook to add,
      // and adding it anyway is the bug (see file-level comment above).
      if ("chrome" in window) return;
      timeout = setTimeout(() => {
        ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 350);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timeout !== undefined) clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
