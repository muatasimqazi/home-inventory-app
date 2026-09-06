# Schuaz — Rate Limiting Addendum

Scopes adding real request rate limits to the routes that actually cost money per call — AI Gateway-backed vision detection, Ask, and voice — currently unbounded. Any signed-in user (or a buggy client retry loop, or a compromised session) can call these as fast as the network allows, with no ceiling.

## 1. What actually needs limiting — and what doesn't

Checked every route in `src/app/api/v1/` against what it costs to run:

- **AI Gateway-backed (real per-call $ cost, the actual problem)**: 16 routes across three domains —
  - **Ask/Voice**: `ask`, `voice/transcribe`, `voice/speak`
  - **Vision/Capture**: `vision/detect`, `detect-appliance`, `detect-document`, `detect-wardrobe-item`, `extract-receipts`, `extract-statement`, `suggest-appliance-documents`, `generate-location-photo`, `generate-studio-photo`, `remove-background`
  - **Finance AI**: `finance/categorize`, `finance/match-transaction`, `finance/budget-recommendations`
- **Auth (sign-in, password reset)**: not this app's own routes — the client calls Supabase Auth directly (`supabase.auth.signInWithPassword()`, etc.), and GoTrue already enforces its own per-IP/per-email rate limits server-side. Nothing to add here.
- **Cron/webhooks** (`push/send-*`, `webhooks/*`, `plaid/sync-all`): not user-request-volume-driven — already gated by `CRON_SECRET` or provider signature verification, not something a user can hammer by clicking fast. Out of scope.
- **Ordinary CRUD routes** (households, items, notes, tasks, ...): Supabase/Postgres already has its own connection and query limits; the marginal cost of an extra row read/write is negligible compared to an AI Gateway call. Lower priority — worth a broad, generic default later (see §5), not the focus of this pass.
- **Caught during implementation, dropped from scope**: `ask/confirm` (performs the actual Notes/Tasks write Ask proposed — real, but no model call of its own; downstream of `ask`, which already counted against the limit) and `finance/detect-recurring` (its own comment is explicit: "deliberately NOT a model call" — pure date/amount arithmetic). Both are ordinary CRUD/compute routes wearing an AI-adjacent name, not actual Gateway calls — same "not the focus of this pass" bucket as the rest of §1's CRUD routes.

## 2. The approach: Upstash Redis + `@upstash/ratelimit`

Checked the Vercel Marketplace first, per usual practice. No dedicated "rate limiting" product exists in the `security` category (just a code-review tool and Auth0). Under `storage`, **Upstash for Redis** (`upstash/upstash-kv`) is the purpose-built match — Upstash publishes `@upstash/ratelimit` specifically for exactly this (sliding-window/token-bucket counters over HTTP, no connection pooling needed, works cleanly from Vercel's serverless functions where a plain in-memory counter can't survive between invocations). This is the standard, well-trodden pairing for rate limiting on Vercel — not a niche or unusual choice.

✅ **Provisioned** — `vercel integration add upstash/upstash-kv` (needed a one-time browser step to accept Upstash's marketplace terms, then a retry — the CLI can't drive that handshake itself). Real credentials (`KV_REST_API_URL`/`KV_REST_API_TOKEN`, Vercel's KV naming, not the `UPSTASH_REDIS_REST_*` names `Redis.fromEnv()` expects by default — the client is constructed explicitly with these instead) landed in `.env.local` via `vercel env pull`.

## 3. Design — ✅ implemented

- **`lib/rate-limit.ts`** — wraps `@upstash/ratelimit` + `@upstash/redis`, three module-scoped `Ratelimit` instances (one per cost tier — see §4, not one per route, since most routes in a domain share the same real cost profile), and two exports:
  - `checkRateLimit(tier, userId)` — for routes that already derive the caller's user id for their own reasons (Ask, voice, the three `requireHouseholdMember`-based vision routes).
  - `rateLimitGate(tier)` — a combined "who is this, and are they over their limit" helper for routes that had **no auth-derivation code of their own at all** — a real thing found while wiring this in: 7 of the 10 vision/finance-AI routes only relied on `proxy.ts`'s global middleware gate (which confirms *a* session exists before the request arrives, but never tells the route *who*), so they needed a real identity, not just a rate-limit line. `rateLimitGate` returns either `{ ok: true, userId }` or `{ ok: false, response }` so the call site stays one line either way.
- **Key**: the authenticated user's id, not IP — this is a household app, and an IP-based limit would penalize a whole household sharing one home network for one person's usage.
- **Response shape**: same as every other route in this app already uses (`retryable: true`, a plain-language message, a `Retry-After` header) — nothing new for the client's existing error-toast handling to learn.

Applied to all 16 routes from §1 — 3 `ask`-tier (via `checkRateLimit`, sharing the existing auth check), 10 `vision`-tier (7 via `rateLimitGate`, 3 via `checkRateLimit` alongside their existing `requireHouseholdMember` call), 3 `finance-ai`-tier (via `rateLimitGate`).

## 4. Starting limits (illustrative — real numbers are the open question in §6)

Grouped by real cost/frequency profile, not per-route:

| Tier | Routes | Starting limit |
|---|---|---|
| Conversational (Ask/Voice) | `ask`, `voice/transcribe`, `voice/speak` | 20 requests / 10 min per user |
| Deliberate capture (Vision) | all 10 vision routes, combined under one limiter | 30 requests / hour per user |
| Finance AI | all 3 finance-AI routes, combined | 30 requests / hour per user |

These are starting points sized to "a real person using the app normally never notices it," not tuned against real usage data (there isn't any yet). Expect to revisit after real traffic.

## 5. Defense in depth (not blocking, worth knowing about)

Vercel's own dashboard-configurable Firewall rate limiting (per-IP, blocks before the request even reaches the function) is a good complementary layer against a real DDoS/scraping attempt — but it's coarse (can't tell two household members apart, can't tell a legitimate power user from abuse) and doesn't replace the per-user, per-domain limiting above. Worth turning on as a blunt backstop, independent of this addendum's own work.

## 6. Open questions — resolved

- ~~Provision Upstash now, or hold?~~ Provisioned.
- ~~Are the §4 starting numbers reasonable?~~ Confirmed as-is; shipped unchanged.
- ~~Should `ask/confirm` share `ask`'s limiter?~~ Moot — found during implementation that `ask/confirm` makes no model call at all (it's the write step, downstream of the propose step `ask` already rate-limits), so it was dropped from scope entirely rather than given its own tier. See §1.
