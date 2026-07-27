import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Admin client authenticated with the secret key — bypasses RLS entirely,
// same trust level as the security-definer Postgres functions in the
// migration. The `server-only` import makes any accidental client-component
// import of this module a build error instead of a runtime key leak —
// SUPABASE_SECRET_KEY must never reach the browser bundle.
//
// For backend/admin operations acting on behalf of the system, not a
// signed-in user — see lib/supabase/server.ts for the RLS-respecting
// client that acts as whoever is actually signed in.
let adminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set.");
  }

  adminClient = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}
