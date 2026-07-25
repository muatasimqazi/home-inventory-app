"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser-safe Supabase client — only the publishable key, never the secret
// key. Not wired into the store yet: the app still runs entirely on the
// in-memory mock store (see lib/store.ts). This exists so the swap to a
// real backend later is a call-site change, not an architecture change.
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.");
  }

  browserClient = createClient(url, publishableKey);
  return browserClient;
}
