# Shohaz — Platform Foundation Addendum

Companion to the [Product Requirements Document](Product%20Requirements%20Document.md), [Personal Finance Addendum](Personal%20Finance%20Addendum.md), and [Household Hub Addendum](Household%20Hub%20Addendum.md). This document is not a new domain — it's the answer to a different question: with three domains built or spec'd (Inventory, Finance, Household Tasks) and a real backlog of plausible future ones (pet care, chores, vehicle maintenance, family calendar, home automation, and whatever else "household hub" turns out to mean), **what has to be true of the foundation so that domain 5 and domain 8 are cheap, instead of each one re-deriving nav, notifications, and cross-entity linking from scratch?**

This is an investment call, not scope creep — nothing here adds a household-facing feature. It exists because the pattern across the last three addenda was already trending toward reinvention (each one designing its own notification shape, its own nav assumption, its own polymorphic-link convention) without anyone naming that as a pattern. Naming it now, while only one consumer (`household_tasks`) actually needs the generalized version, is cheap. Retrofitting it after domain 5 has its own bespoke copy is not.

## 1. What's already genuinely generalized — the good news first

These aren't proposals; they're already proven across two-to-three independent domains and just need to keep being followed, not re-decided:

- **Tenancy & identity**: `households` / `household_members` (role `owner`|`member`, DB-enforced single-owner invariant) / `invites` / `users`. Every domain so far reused this verbatim, no domain-specific identity model. Keep doing that — a future domain proposing its own membership/role concept should be treated as a flagged exception (per §6 below), not a default.
- **RLS pattern**: `EXISTS (household_members WHERE household_id = row.household_id AND user_id = auth.uid())` on every household-scoped table. Same check, zero domain-specific variants so far.
- **Archive + Trash lifecycle**: `trashed_at` / `permanently_delete_after`, 30-day auto-purge via scheduled job, Delete-Forever-only-from-Trash. Applied identically to Items/Containers/Locations, Accounts/Transactions/Categories/RecurringBills, and now Tasks. A fourth domain should default to this without re-litigating it.
- **`activity_log`**: one shared audit table (`entity_type`, `entity_id`, `action`, `changed_fields`) already domain-agnostic by design — every domain writes to it, none has its own audit table.
- **API conventions**: `/api/v1/...`, cursor pagination, `{error:{code,message}}` — stated once in the Finance PRD (§30), inherited since without re-derivation.
- **Design system**: tokens, type scale, radius/shadow, Lucide icon family, and the `Card`/`EmptyState`/`ConfirmDialog`/`IconChip` component set — proven to extend cleanly across two domains (Finance's Design Alignment doc), with the deterministic-hash category-coloring mechanism reused a third time for tasks. No structural change needed here; just keep running new domains through `design-from-scratch`'s audit-first discipline rather than inventing fresh tokens per domain.
- **Scheduled-job mechanism** (`pg_cron`/Supabase Edge Functions): one mechanism, three unrelated jobs riding it already (Trash purge, balance snapshots, task reminders). Correct pattern — a future domain needing a background job should add a job to this mechanism, not stand up a separate scheduler.

## 2. The real gap: notifications were built domain-specific, and shouldn't stay that way

The Household Hub Addendum's `notification_preferences` (keyed by task `category`) and `task_reminder_log` (keyed by `task_id`) were designed for exactly one consumer. The moment a second domain wants to notify someone — finance ("this bill is due"), home automation ("a sensor triggered"), a future family calendar ("an event starts in 30 minutes") — those tables force a choice between duplicating them per domain or awkwardly overloading a `category` field that was never meant to span domains.

**Fix, before `household_tasks` gets built (cheap now, not later):**

```sql
-- Replaces task_reminder_log's task-specific shape:
event_notification_log (
  id,
  domain_key,       -- 'tasks' | 'finance' | 'automation' | ... — one short string per domain
  entity_type, entity_id,   -- what the notification is about, generically
  occurrence_key,   -- disambiguates recurring occurrences of the same entity (a due_at, a billing period, etc.)
  sent_at
)
  -- UNIQUE(domain_key, entity_type, entity_id, occurrence_key) — same idempotency
  -- guarantee task_reminder_log gave one domain; now every domain gets it for free.

-- Replaces notification_preferences' task-category-specific shape:
notification_preferences (
  id, household_id, user_id,
  domain_key,       -- 'tasks' | 'finance' | 'automation' | 'all'
  event_type,       -- domain-defined, e.g. 'task.due' | 'bill.due' | 'automation.alert'
  channel,          -- 'push' | 'in_app_only'
  enabled, updated_at
)
```

`push_subscriptions` (the actual device/browser registration) was already domain-agnostic — no change needed there; it's the delivery target, not the trigger logic. This means the Web Push infrastructure being built for Household Tasks (service worker, VAPID keys, the scheduled-send job) is *already* the platform's notification pipeline, not a tasks-specific one — every future domain that wants to notify plugs into `event_notification_log`/`notification_preferences` rather than standing up its own push plumbing. That's the actual point of doing this now: the expensive part (real Web Push infrastructure) only gets built once.

## 3. Formalize the polymorphic link, since it's about to be reused

`household_tasks.linked_entity_type` / `linked_entity_id` (nullable pair, pointing at an Item/Location/Container/HouseholdMember) is the first place Shohaz needed "this record can optionally point at any other domain's entity." It won't be the last — a future family-calendar event linking to a person, a home-automation alert linking to a location, a document-vault entry linking to an item, all want the same shape.

**Convention, not new code:** any future domain needing this reaches for the same `linked_entity_type` (text) + `linked_entity_id` (uuid) pair, validated at the application/RLS layer against `household_id` — the same way Shohaz already validates every other cross-entity reference (PRD §22's "cross-household reference validation... a blanket rule, stated once"). No DB-level polymorphic FK (Postgres doesn't do those cleanly); that's an accepted, already-precedented tradeoff, not a new risk. Don't let a future domain invent a differently-named or differently-shaped version of this same idea.

## 4. `household_tasks` is the platform's recurring-obligation primitive, not just this addendum's three use cases

The Household Hub Addendum (§2) deliberately deferred unifying `RecurringBill` into a general primitive, to avoid churning finance's just-written schema. That deferral still holds — **don't touch `RecurringBill` today.** But `household_tasks` itself, being new, should be *understood from the start* as the shared "something recurs or is due once, gets assigned, gets completed" primitive every future domain reaches for (pet care, chores, vehicle maintenance, family calendar) rather than each of those cloning their own tasks table. Concretely: a future domain adds rows to `household_tasks` with its own `category` and a `linked_entity_type`/`linked_entity_id` pointing at its own entities, rather than proposing `pet_care_tasks` or `vehicle_maintenance_tasks`. `RecurringBill`→`household_tasks` unification remains a real, separate, deliberately-deferred question (§9 of the Household Hub Addendum) — this is a narrower, cheaper claim: *new* domains shouldn't clone the pattern a second time now that it exists.

## 5. Navigation must be a registry, not a hardcoded list

The Household Hub Addendum's Home/Search/FAB/More recommendation (§6) is right in shape but was described in domain-specific prose ("Inventory / Finance / Tasks"). For it to actually survive a domain 5 and 6 without a rewrite, whoever builds the nav shell should implement it against a small internal contract each domain provides, rather than hardcoding a fixed enum:

```ts
interface DomainDescriptor {
  domainKey: string;            // 'inventory' | 'finance' | 'tasks' | ...
  label: string; icon: IconName;
  entryHref: string;            // where "More" navigates into
  getAttentionCards(): Promise<{ count: number; label: string; severity: 'info'|'warning'; href: string }[]>;
  // e.g. inventory → needs-review count, finance → nothing yet, tasks → overdue count
}
```

Home renders whatever `getAttentionCards()` returns across all registered domains, generically — it never special-cases "needs-review" vs. "overdue" by name. Adding domain 5 means implementing this interface, not editing Home's or the nav shell's code. This is an implementation instruction for whoever builds the nav shell (still gated on the Household Hub Addendum §6 decision itself getting real sign-off) — but worth stating now so that decision, whenever it's made, is made in this shape rather than a shape that has to be redone at domain 5.

## 6. Default assumption for any new domain: match the foundation, don't diverge without saying so

Finance's privacy model briefly diverged (a per-record visibility layer) before being corrected back to match Shohaz's household-wide-shared default — worth stating as the standing rule, not just a one-off correction: **a new domain inherits the existing conventions (household-shared RLS, Owner/Member equal access, Archive+Trash lifecycle, activity-log audit) by default.** A domain that genuinely needs to diverge (a hypothetical future domain with real per-user privacy needs, a different role model) should name that divergence explicitly and get it confirmed, the same way this document is naming platform conventions explicitly rather than letting them drift implicitly.

## 7. Event-naming convention extends across domains, not just inventory

PRD §16 already commits to a `entity.verb` event-naming convention (`item.created`, `item.moved`) for future webhook delivery, matching the activity log. Extend the same convention to every domain now that more than one exists: `transaction.created`, `task.completed`, `account.balance_updated`. This costs nothing today (webhooks aren't built yet) but means the eventual webhook layer — and any Home Assistant-style outward integration (§16.1) — gets one consistent event vocabulary spanning every domain instead of inventory's own dialect plus per-domain retrofits later.

## 8. What this addendum deliberately does not do

It doesn't stand up any new domain, doesn't decide the Home-screen redefinition (still open per Household Hub Addendum §9), and doesn't force `RecurringBill`'s migration. It's scoped narrowly to: generalize notifications before they're built once already, name the polymorphic-link and recurring-task conventions before they're reinvented, and state the nav/event-naming shape future implementers should build against. Everything else about "what other domains to add" stays exactly where the prioritization conversation left it — not decided here, and not the point of this document.
