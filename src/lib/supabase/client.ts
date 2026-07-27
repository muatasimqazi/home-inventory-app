"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Browser client — only the publishable key, never the secret key.
// createBrowserClient (not the plain supabase-js createClient) stores the
// session in cookies rather than localStorage, so the same session is
// readable server-side (middleware, Server Components, Route Handlers) —
// required for real auth-gated routing, not just client-side "am I signed
// in" checks.
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.");
  }

  browserClient = createBrowserClient(url, publishableKey);
  return browserClient;
}
