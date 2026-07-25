import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client, authenticated with the secret key. The
// `server-only` import makes any accidental client-component import of this
// module a build error instead of a runtime key leak — SUPABASE_SECRET_KEY
// must never reach the browser bundle.
//
// Not wired into the store yet: the app still runs entirely on the
// in-memory mock store (see lib/store.ts). This is boundary scaffolding for
// when that swap happens, not an active data path.
let serverClient: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  if (serverClient) return serverClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set.");
  }

  serverClient = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serverClient;
}
