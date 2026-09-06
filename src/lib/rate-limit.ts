import "server-only";
import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// docs/Rate Limiting Addendum.md — the 17 AI Gateway-backed routes (Ask/
// Voice, Vision/Capture, Finance AI) had no request ceiling at all before
// this: any signed-in user, or a buggy client retry loop, could call them
// as fast as the network allows, and every one of those calls costs real
// money. Everything else (auth, cron, webhooks, ordinary CRUD) is either
// already rate-limited elsewhere (Supabase's own GoTrue limits) or not
// user-request-volume-driven (cron secrets, webhook signatures) — see the
// addendum's own §1 for why those are explicitly out of scope here.
//
// Explicit url/token (not Redis.fromEnv()) because this project's
// provisioned env vars are named KV_REST_API_URL/KV_REST_API_TOKEN
// (Vercel's KV naming convention, which is what `vercel integration add
// upstash/upstash-kv` actually sets), not the UPSTASH_REDIS_REST_* names
// fromEnv() looks for by default.
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// One limiter per real cost/frequency tier (addendum §4), not one per
// route — most routes in the same domain share the same cost profile, so
// a single shared counter per tier is simpler than 17 independent ones
// and still lets each domain be tuned separately later. Each limiter
// created once at module scope (not per-request) so its ephemeralCache
// (an in-memory Map, on by default) actually helps — recreating it per
// request would defeat that entirely.
const askLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "10 m"),
  prefix: "ratelimit:ask",
  timeout: 2000,
});

const visionLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 h"),
  prefix: "ratelimit:vision",
  timeout: 2000,
});

const financeAiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 h"),
  prefix: "ratelimit:finance-ai",
  timeout: 2000,
});

export type RateLimitTier = "ask" | "vision" | "finance-ai";

const LIMITERS: Record<RateLimitTier, Ratelimit> = {
  ask: askLimiter,
  vision: visionLimiter,
  "finance-ai": financeAiLimiter,
};

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Checks (and, on success, consumes) one request against the given
 * tier's shared limiter, keyed by the authenticated user's id — not IP.
 * This is a household app; multiple members legitimately share a home
 * network/IP, so an IP-based limit would penalize a whole household for
 * one person's usage. A per-user limit ties the cap to who's actually
 * generating the cost.
 *
 * Fails open on a Redis timeout/outage (the library's own default
 * behavior, kept rather than overridden) — the point of this is cost
 * control, not making Redis a new single point of failure for the whole
 * app.
 */
export async function checkRateLimit(tier: RateLimitTier, userId: string): Promise<RateLimitResult> {
  const { success, reset } = await LIMITERS[tier].limit(userId);
  if (success) return { ok: true };
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) };
}

/**
 * Combined "who is this, and are they over their limit" gate for routes
 * that don't already derive the caller's user id themselves — several of
 * the vision/finance-AI routes have no auth-derivation code at all today
 * (they're already protected by proxy.ts's global middleware gate, which
 * confirms *a* session exists before the request ever reaches route code,
 * but doesn't forward *who* to the route), so this is the one addition
 * they need for both an identity to key the limiter on and the 429
 * response itself. Routes that already call getSupabaseServerClient()
 * for their own reasons (Ask, voice, the requireHouseholdMember-based
 * vision routes) should call checkRateLimit() directly instead with the
 * user id they already have, rather than deriving it a second time here.
 */
export async function rateLimitGate(tier: RateLimitTier): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  }

  const limit = await checkRateLimit(tier, user.id);
  if (!limit.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You're doing that a lot right now — try again in a moment.", retryable: true },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      ),
    };
  }

  return { ok: true, userId: user.id };
}
