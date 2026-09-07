"use client";

import posthog from "posthog-js";
import { PostHogProvider } from "@posthog/react";
import type { ReactNode } from "react";

// Initialized at module load, not inside a useEffect — so every other
// client component's own effects (lib/store.ts's hydrate(), which calls
// posthog.identify() as soon as a signed-in user is known, runs as a child
// of this provider and would otherwise race a parent's useEffect) can
// safely assume posthog is already configured by the time they run.
// __loaded guards against a dev-mode hot reload re-running this module and
// double-initializing an already-live client.
//
// No token in this environment (local dev without .env.local's real
// project token, or a preview build without it set) means this silently
// no-ops — PostHogProvider still renders with the client, every posthog.*
// call the app makes is just inert, same "don't crash on missing
// third-party config" posture already used for Firebase push (see
// lib/push/send.ts's own comment).
if (typeof window !== "undefined" && !posthog.__loaded) {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (token) {
    posthog.init(token, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      defaults: "2026-08-30",
      // Real household data is on-screen constantly — bank balances,
      // transaction amounts, receipt/statement contents, item names and
      // notes. Default to maximum privacy rather than the SDK's normal
      // partial masking: session replay still captures layout, clicks,
      // rage-clicks, and navigation for real UX debugging, just never
      // what any of the actual text on screen says.
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "*",
      },
    });
  }
}

export function PHProvider({ children }: { children: ReactNode }) {
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
