# Schuaz — Free Tier Limits Addendum

Free households could previously create unlimited locations and items, and trigger unlimited AI studio-photo generations (`generate-studio-photo`, `generate-location-photo`, `remove-background` — each a real, billed model call per [Rate Limiting Addendum](Rate%20Limiting%20Addendum.md)). Rate limiting caps *abuse speed*; nothing capped the actual number of paid-for resources a Free household could accumulate over time. This addendum adds real per-household caps for Free, tied to `households.subscription_tier`.

## 1. The three limits

| Resource | Free limit | Paid tiers |
|---|---|---|
| Locations | 3 | Unlimited |
| Items | 100 | Unlimited |
| AI studio-image generations | 10 / calendar month | Unlimited |

Single source of truth for the numbers: `FREE_TIER_LOCATION_LIMIT` / `FREE_TIER_ITEM_LIMIT` / `FREE_TIER_STUDIO_GENERATIONS_PER_MONTH` in `src/lib/billing.ts`. The database can't import that module, so the same numbers are duplicated as literals in `supabase/migrations/0057_free_tier_resource_limits.sql` — keep both in sync by hand if these ever change.

Locations/items count `status <> 'trashed'` (items) / `status = 'active'` (locations) — trashed resources are pending permanent deletion and don't hold a spot; archived items still count.

## 2. Enforcement — two layers, for two different reasons

**Locations and items**: real enforcement is a Postgres `BEFORE INSERT` trigger (`enforce_household_resource_limit()`), not an API route check — `createLocation()`/`createItem()`/`createItemsBatch()` (`lib/store.ts`) write straight from the browser to Supabase, the same pattern every other domain in this app already uses, where RLS/DB constraints are the real gate and anything client-side is just nicer UX (see `lib/authorize.ts`'s `requireHouseholdPlan()` doc comment for the same reasoning applied to feature gates).

A client-side pre-check (`freeTierLimitMessage()` in `lib/store.ts`) runs first and is **not just UX** here — it's what stops a doomed create from ever reaching the network, which matters specifically for items: several capture flows (`capture/appliance`, `capture/wardrobe`, `capture/document`, `capture/review`) call a real, billed studio-photo generation immediately after `createItem()` succeeds. Without the pre-check, an item that's about to be rejected by the DB trigger would still trigger (and pay for) a generation before the rejection came back. `createItem`/`createItemsBatch`/`createLocation` now return `null`/`[]` when blocked, and every call site (11 of them) was updated to bail out cleanly on that — see git history for the full list.

**AI studio-image generations**: no client-direct-write path exists here (all three generation routes are server API routes), so the check lives entirely server-side in `checkAndConsumeStudioGenerationQuota()` (`lib/studio-generation-quota.ts`), called from `generate-studio-photo`, `generate-location-photo`, and `remove-background`. Orthogonal to and in addition to the existing per-user `vision` rate-limit tier — that caps request *speed* regardless of plan; this caps total *count* for Free specifically. `generate-studio-photo` can request up to 3 styles per call, so the quota is checked and consumed **per style inside its loop**, not once per HTTP request — a household with 2 generations left gets exactly 2, with the 3rd style recorded as a normal "failed" row (existing "every attempt gets a row" contract), not an all-or-nothing reject.

Usage is tracked as a running counter directly on `households` (`studio_generation_count`, `studio_generation_period_start`), reset lazily on the first call of a new calendar month rather than a cron job — same "no scheduled job needed" posture as the rest of this app's usage counters. Incremented atomically via `try_increment_studio_generation_usage()`, a `security definer` RPC (any household member can trigger a generation, but only the owner can `UPDATE households` directly under RLS — same reasoning as `create_household()`/`transfer_ownership()`).

## 3. UX

- Blocked location/item creates toast `"Free plan includes up to N {locations|items} per household. Upgrade to Plus to add more."` with an **Upgrade** action button that routes straight to `/settings/billing` (`toastFreeTierLimit()`).
- Blocked studio generations surface through each route's existing error-toast plumbing (`data.error` from a non-2xx response) — no new UI needed, since `remove-background`/`generate-location-photo`/`generate-studio-photo`'s callers already parse and toast `error` on failure.
- CSV import (`settings/import`) stops the whole import (not just the one row) on the first blocked location or item, since the household-wide cap won't free up mid-import — every later row would fail the same way.

## 4. What's out of scope for this pass

- **Containers, tags, notes, tasks, attachments** — not cost-driving resources, no cap.
- **Per-tier differentiation between Plus and Pro** — both are unconditionally unlimited on all three limits for now; Pro's "larger storage and automation usage" (`BILLING_PLAN_FEATURES`) stays aspirational copy until there's a reason to actually split them.
- **A visible usage meter** ("7 of 10 generations used this month") — real product surface, deliberately deferred; the cap enforces today, a dashboard for it is a follow-up.
