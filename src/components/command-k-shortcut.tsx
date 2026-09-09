"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * Cmd+K (Mac) / Ctrl+K (Windows/Linux) jumps straight to Search — the
 * conventional desktop-web shortcut for exactly this (Linear, Notion,
 * GitHub, Vercel all bind it the same way), and worth having now that
 * Search is a real, permanent nav entry on both mobile (bottom-nav tab)
 * and desktop (desktop-sidebar.tsx's own top item). Fires globally,
 * including while focused inside a text field — same as every other real
 * implementation of this shortcut, not scoped to "only when nothing's
 * focused."
 *
 * Already on /search: refocuses its input instead of a no-op
 * router.push() to the same URL, which wouldn't remount the page (so
 * /search's own useAutoFocusVisible-driven focus-on-mount would never
 * refire) and would otherwise silently do nothing the second time.
 */
export function CommandKShortcut() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      if (pathname === "/search") {
        document.querySelector<HTMLInputElement>('input[placeholder*="Search"]')?.focus();
        return;
      }
      router.push("/search");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, pathname]);

  return null;
}
