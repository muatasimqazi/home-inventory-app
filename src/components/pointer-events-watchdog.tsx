"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const CHECK_INTERVAL_MS = 3000;

function clearIfStuck() {
  if (typeof document === "undefined") return;
  if (document.body.style.pointerEvents !== "none") return;
  // Radix (Dialog/Sheet) marks its overlay with data-slot="dialog-overlay"
  // / "sheet-overlay" — present in the DOM only while one is genuinely
  // mounted and open. No match means nothing legitimately needs the
  // scroll/interaction lock right now.
  const hasOpenOverlay = document.querySelector('[data-slot$="-overlay"]');
  if (!hasOpenOverlay) document.body.style.pointerEvents = "";
}

/**
 * Defensive mitigation for a known class of bug in Radix (Dialog/Sheet)-
 * based apps: while an overlay is open, Radix sets
 * `document.body.style.pointerEvents = "none"` (the scroll/interaction
 * lock) and is supposed to restore it once the overlay closes — but if a
 * dialog/sheet unmounts abruptly instead of going through its own close
 * animation (a route change fired from inside its own onConfirm/onSubmit
 * handler — see confirm-dialog.tsx's callers that navigate away in the
 * same handler — or the PWA getting backgrounded/suspended mid-transition
 * on iOS), that cleanup can get skipped, leaving the *entire app*
 * permanently unclickable until a hard reload. Reported as "sometimes,
 * the app doesn't let you click stuff," app-wide, no consistent trigger —
 * exactly this bug's usual shape.
 *
 * Three triggers, since a user stuck by this can't click anything
 * (including a Link, so a route-change-only check would never fire
 * again once actually stuck): route changes, the tab/PWA regaining
 * visibility or focus (the two real-world moments most likely to
 * interrupt a close mid-flight), and a cheap periodic safety-net poll so
 * recovery doesn't strictly depend on any of those happening at all.
 * Always exact and non-destructive: only ever touches pointerEvents when
 * it's actually "none" *and* nothing in the DOM justifies that, so a
 * genuinely open dialog's real scroll-lock is never touched.
 */
export function PointerEventsWatchdog() {
  const pathname = usePathname();

  useEffect(() => {
    clearIfStuck();
  }, [pathname]);

  useEffect(() => {
    document.addEventListener("visibilitychange", clearIfStuck);
    window.addEventListener("focus", clearIfStuck);
    const interval = setInterval(clearIfStuck, CHECK_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", clearIfStuck);
      window.removeEventListener("focus", clearIfStuck);
      clearInterval(interval);
    };
  }, []);

  return null;
}
