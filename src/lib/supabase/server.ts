import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

// Server-side client for Server Components and Route Handlers — reads/
// writes the session via next/headers cookies(), so it sees the same
// session the browser client and middleware do. Uses the publishable key
// (RLS still applies), not the secret key — for a client acting *as the
// signed-in user*, not an admin bypass. See lib/supabase/admin.ts for that.
//
// Always create a new client per request (per @supabase/ssr's own
// guidance) rather than caching a singleton like the browser client does —
// cookies() is request-scoped.
export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.");
  }

  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component (not a Route Handler/Server
          // Action) — cookies() is read-only there. Harmless as long as
          // middleware is also refreshing the session (it is, see
          // middleware.ts), which is the documented @supabase/ssr pattern.
        }
      },
    },
  });
}
