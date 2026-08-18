# Shohaz — Household Hub Addendum

Companion to the [Product Requirements Document](Product%20Requirements%20Document.md), [Implementation Handoff Plan](Implementation%20Handoff%20Plan.md), and [Personal Finance Addendum](Personal%20Finance%20Addendum.md). This document adds Shohaz's third domain: household tasks, reminders, and care schedules — kids' appointments, plant watering, home maintenance, and similar recurring or one-off things a household needs to not forget. Where this addendum modifies existing behavior (Information Architecture, notifications, the Home screen itself), it says so explicitly; where it's silent, the PRD and Finance Addendum stand.

**Superseded in part by the [Platform Foundation Addendum](Platform%20Foundation%20Addendum.md), written right after this one:** §4's `notification_preferences`/`task_reminder_log` tables below were designed for this domain alone; the Platform addendum generalizes them into `notification_preferences`/`event_notification_log` so every future domain shares one notification pipeline instead of each cloning it. Build against the generalized version, not the task-specific one shown below (kept here for the historical record of how the requirement was first scoped). Also see that document's §4: `household_tasks` is now understood as the platform's shared recurring-obligation primitive for *all* future domains, not just the two cases named in §3 below.

**Why this is a real inflection point, not just another feature area:** with inventory and finance, Shohaz was still recognizably "an inventory app with a finance module." A third, structurally different domain — time-driven rather than record-driven, and dependent on the app reaching *you* rather than you opening it — is the point where Shohaz becomes a genuinely different kind of product: a household hub with peer domains, not a home-inventory app with modules bolted on. Worth naming plainly rather than absorbing quietly, per the standing instruction to flag decisions this size rather than resolve them silently.

## 1. Executive Summary

Shohaz gains a general recurring-task/reminder system, applied first to two concrete cases named directly by the product owner: **item-linked maintenance** (plant watering, HVAC filters, smoke-detector batteries — anything tied to a physical thing Shohaz already knows about) and **person-linked appointments** (a kid's dentist visit, assigned to a household member) — plus freestanding household reminders that aren't tied to either. Unlike inventory or finance, this domain is only useful if it reaches the user proactively — a reminder nobody sees until they happen to open the app isn't a reminder. Proactive notifications are scoped as a real prerequisite for this addendum, not deferred (a deliberate reversal of both existing PRDs' "notifications are in-app-only, push is Phase 2" stance — see §5).

## 2. The pattern that already exists — and the decision not to touch it yet

Finance's `RecurringBill` (`name, expected_amount, frequency, next_due_date, is_active`) plus `bill_payments` (a completion log) is structurally the same shape a general household task needs: something that recurs, needs doing, and gets marked done. That's a real signal to build `household_tasks` as the general form and treat bills as a specialized case of it — **but not today.** The Finance Addendum's schema was just written and hasn't been built against yet; refactoring it to inherit from a new shared primitive the same day it was spec'd would be exactly the kind of same-session churn worth avoiding. §9 (Open Questions) records this as the natural next unification, deliberately deferred until both domains have real screens built and this pattern has proven itself twice independently — the same "prove it, then generalize" discipline the rest of Shohaz's build has followed.

## 3. Core Concept: Household Tasks

A `household_task` is one of:
- **Item-linked maintenance** — "Water the fiddle-leaf fig every 3 days," attached to an existing Item. This is the strongest crossover in the product: Items already carry `attachments` and `item_extra_details` (PRD §22); a care schedule is a natural third thing hanging off an Item, not a new domain competing with it.
- **Person-linked appointments** — "Emma's dentist appointment," assigned to a household member, usually one-time or irregular rather than a fixed recurrence.
- **Freestanding reminders** — anything that isn't naturally tied to an Item or a person ("renew car registration").

All three share one schema and one completion/notification pipeline — the categorization above is a UI/filtering concern (which entity, if any, a task is linked to), not three separate tables.

## 4. Data Model (household-scoped, RLS-enforced, same conventions as PRD §22 / Finance Addendum §14)

```sql
household_tasks (
  id, household_id,
  title, description,
  category,  -- 'maintenance' | 'appointment' | 'chore' | 'other' — deterministic-hash accent per PRD §3's existing mechanism
  linked_entity_type,  -- nullable: 'item' | 'location' | 'container' | 'household_member'
  linked_entity_id,    -- nullable; validated against household_id like every other cross-entity reference (PRD §22)
  assigned_to_user_id, -- nullable — unassigned tasks are visible to the whole household
  schedule_type,       -- 'one_time' | 'recurring'
  due_at,              -- one_time: the due moment; recurring: the next occurrence
  recurrence_rule,     -- nullable jsonb, simple structured recurrence for v1 — {"freq":"days","interval":3} — not full RRULE; see §9
  is_active,
  created_by_user_id, created_at, updated_at,
  trashed_at, permanently_delete_after  -- same Archive/Trash lifecycle as every other entity (PRD §14)
)

task_completions (
  id, household_id, task_id,
  due_at,              -- which occurrence this completes — required even for one_time tasks, for a uniform completion log
  completed_at, completed_by_user_id, notes
)

push_subscriptions (
  id, household_id, user_id,
  endpoint, p256dh_key, auth_key,  -- Web Push subscription, one row per browser/device
  device_label, created_at, last_seen_at
)

-- SUPERSEDED by the Platform Foundation Addendum §2 — build the generalized
-- (domain_key/event_type-keyed) versions instead of these two:
--
-- notification_preferences (
--   id, household_id, user_id,
--   category,  -- matches household_tasks.category, or 'all'
--   channel,   -- 'push' | 'in_app_only'
--   enabled, updated_at
-- )
--
-- task_reminder_log (
--   id, task_id, due_at, sent_at
-- )  -- UNIQUE(task_id, due_at)
```

No new RLS pattern — same household-membership `EXISTS` check as everywhere else. `push_subscriptions`/`notification_preferences` are user-scoped within the household (a subscription is a device, not a household asset) but still carry `household_id` for consistent RLS shape.

Activity Feed: task creation/completion/reassignment writes to the existing `activity_log` table (PRD §22) — no new audit mechanism, matching both prior domains.

## 5. Notifications — the real new engineering surface, scoped in per your call

Both existing PRDs deferred push notifications; this domain doesn't work without them, so this addendum scopes real infrastructure rather than inheriting that deferral.

**Mechanism: Web Push (VAPID), not a native app.** Shohaz is already a PWA with real install investment (icon bundle, standalone-mode fixes, home-screen install — recent git history). iOS 16.4+ supports Web Push for PWAs installed to the home screen; Android/desktop Chrome support it unconditionally. This reuses that investment instead of requiring a native app or a third-party push SDK.

**What this actually requires, concretely:**
- A service worker — Shohaz doesn't have one today (it's installable but not offline-first); one needs to be added, scoped initially to push handling only, not a full offline/caching strategy (that's a separate, larger decision, out of scope here).
- A VAPID key pair, generated once, private key held server-side only.
- An explicit, user-initiated permission request (a real "Enable reminders" action, never requested on page load) — consistent with Shohaz's existing "never do intrusive things unprompted" ethos, and also the only pattern iOS Safari's push permission model tolerates well.
- A scheduled job (reusing the existing `pg_cron`/Supabase Edge Function mechanism already used for Trash auto-purge and finance's balance snapshots) that finds tasks due within a lookahead window, sends a push via a server-side Web Push library, and writes to `event_notification_log` (Platform Foundation Addendum §2) for idempotency — this job *is* the platform's push-sending job, not a tasks-specific one, so future domains extend its due-item query rather than standing up a second one.

**A real limitation to state up front, not discover later:** push only reaches users who installed to the home screen and granted permission. Everyone else gets the in-app surface only (§6). This should be surfaced honestly in onboarding/empty states ("Install Shohaz to get reminders on your phone") rather than silently under-delivering on a promise the product implies.

**In-app fallback, always present regardless of push status:** a "Due Today / Overdue" surface is not a nice-to-have here — it's the only delivery channel for anyone without push, so it needs to be genuinely prominent, not a buried list.

## 6. Information Architecture — Home stops being an inventory screen

This is the decision the third domain forces. A binary mode-switcher (recommended for two domains in the Finance Addendum/Design Alignment §7) doesn't scale to three, and won't scale to whatever comes after this either, given the household-hub framing implies more domains are plausible later, not that this is the last one.

**Recommendation:** redefine **Home** itself. Today it's Shohaz's inventory dashboard (search + capture entry point) — the one screen that got real Figma coverage early in the build (per project memory). Going forward, Home becomes a **cross-domain "what needs attention" view**: due/overdue tasks, needs-review inventory items, anything finance flags as needing a look — each domain surfaces its own "today" signal into one place, the way a real household actually scans one spot each morning rather than three apps. Bottom nav becomes **Home, Search, [capture FAB], More** — where More is a domain switcher (Inventory / Finance / Tasks), each retaining its own already-designed sub-navigation once entered. This scales by domain count instead of being hard-capped at 4 tabs, and mirrors the "More" pattern finance's own PRD already specified for its secondary destinations (§35 of the Finance PRD).

This is a recommendation, not a decision made here — redefining Shohaz's single most-used, most-designed screen deserves the same scrutiny (real mockups, a visual QA sweep) the rest of the product's IA got, not a paragraph in an addendum. Flagged in §9.

## 7. Product Principles — one addition, one real tension

Existing principles (calm, restrained, one obvious action per screen, no gamification) extend directly — a task list should read like Things 3, not like a chore chart with streaks. **One genuine tension worth naming:** "calm" and "proactively interrupts you with a push notification" are in some real friction with each other. Resolve it the way the reference products do it well (Apple Home's calm-but-real alerts, not a productivity app's guilt-driven nagging) — a reminder should feel like a considerate nudge, arrive once per due occurrence (not escalating/repeating), and never use urgency-manufacturing copy.

## 8. What's explicitly out of scope for this pass

Full RRULE-grade recurrence (complex patterns like "second Tuesday of the month") — v1's `{"freq":"days","interval":N}` covers the two named use cases (watering, simple weekly/monthly maintenance) without the complexity of a general recurrence engine. Calendar sync (Google/Apple Calendar import/export). Shared family calendar visualization (a real feature, but a different one — this addendum is about tasks/reminders, not a calendar UI). Location-based reminders. Any AI-assisted scheduling (e.g., inferring a warranty-driven maintenance date from an attached receipt — a genuinely good future crossover with finance/inventory, explicitly deferred, not forgotten).

## 9. Open Questions

- **`RecurringBill` ↔ `household_tasks` unification** (§2) — deliberately deferred; revisit once both domains have shipped real screens, not before.
- **Home screen redefinition** (§6) — a recommendation, not a decision; needs real mockups and a product sign-off given it touches Shohaz's most-used screen.
- **Recurrence complexity ceiling** — is `{"freq","interval"}` enough, or does month-boundary/weekday-based recurrence ("first Monday of the month") show up in real use fast enough to warrant building it now instead of retrofitting?
- **Notification frequency/quiet hours** — v1 assumes one push per due occurrence, no quiet-hours logic; worth confirming that's acceptable before a household gets a 6am plant-watering push.
- **Who can assign a task to whom** — is task assignment open to any member, or does it need any gating at all? **Note (2026-08-18): the "matching finance's precedent" framing this question used to lean on is stale** — Finance's sharing model reversed to real per-account privacy with opt-in sharing (Personal Finance Addendum, "Privacy model"; Platform Foundation Addendum §6), so it's no longer a clean precedent for "everyone manages together" by default. Household tasks may still reasonably default to fully-open assignment (a chore isn't a financial account — the privacy rationale doesn't obviously transfer), but that now needs its own reasoning rather than borrowing finance's old answer. Leaning fully open on tasks' own merits; still stating it explicitly rather than assuming.
