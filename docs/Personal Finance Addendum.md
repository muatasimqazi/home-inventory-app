# Shohaz — Personal Finance Addendum (v2 — supersedes v1)

Companion to the [Product Requirements Document](Product%20Requirements%20Document.md) and [Implementation Handoff Plan](Implementation%20Handoff%20Plan.md). **v1 of this file (same filename, written earlier the same day) is superseded** — it was drafted from scratch, guessing at scope and inventing a privacy model, without knowledge that a fully worked-out, already-aligned finance PRD already existed in a sibling repo. This version replaces that guesswork with the real spec.

**Source of truth for finance product scope:** [Personal Finance PRD](Personal%20Finance%20PRD.md) (v1.1, "MVP scope confirmed via discovery") and its companion [Personal Finance Design Alignment](Personal%20Finance%20Design%20Alignment.md) — both relocated 2026-08-17 into this repo's `docs/` from a separate local-only repo (`personal-finances`), now archived, where they were originally written. That PRD was written independently, *for a separate app intended to merge with Shohaz later* — and, critically, it already deliberately matched Shohaz's household/role/RLS/API/lifecycle conventions exactly (its own §34), specifically so a merge would be additive, not a migration. This addendum records only what changes now that the decision (2026-08-17) is to fold that feature set **directly into Shohaz's own codebase** instead of building a separate app and merging later. Read the source PRD for full behavioral detail (user journeys, per-area requirements, ledger mechanics) — this file doesn't duplicate it, only what's different because it's now one app, not two.

## What changes because this is one app now, not two merging apps

1. **No table reconciliation needed at all.** The source PRD's `users`/`households`/`household_members`/`invites`/`activity_log` shapes are already identical to Shohaz's real ones (verified table-by-table in that PRD's §34) — this was done on purpose, before this decision was made. The finance domain tables (`accounts`, `transactions`, `categories`, `category_rules`, `recurring_bills`, `csv_import_batches`, `account_balance_snapshots`) are simply new tables added to Shohaz's existing schema, FK'd to the same `household_id` Locations/Containers/Items already use.
2. **There is no "merge time" anymore.** No second deploy, no second auth system, no data migration to plan for later — it's one additive build.
3. **Navigation has to be decided now, as a real product call, not deferred to a hypothetical future merge** — see below; this was already flagged as the single largest open item when the plan was still "build separately, merge later."

## Privacy model — re-reversed 2026-08-18, for real this time, with an actual design

This has now flip-flopped twice, which is worth being honest about rather than smoothing over: v1 of this addendum proposed real per-record privacy (invented without the source PRD in hand). v2 reversed to the source PRD's fully-shared model ("Owner and Member share full, identical access") since that PRD was independently "confirmed via discovery." **Now reversed again, deliberately, after direct confirmation that real privacy is the actual intent** — individuals genuinely need some finance details hidden from other household members by default, with explicit sharing as the opt-in, not the reverse.

This is *not* a return to v1's design verbatim — it's designed properly this time, informed by everything decided since (including checking whether Shohaz's existing `Item.ownerUserId` pattern would cover it — it doesn't: that field is informational/attributional only, every item stays fully visible to the household regardless of owner, which is the wrong shape for genuine privacy).

**Concrete model:**
- `accounts` and `recurring_bills` (the two entities a person actually thinks of as "mine") gain `owner_user_id` (nullable). `NULL` = joint/household account or bill — visible to everyone, exactly like today's default, zero change to the common case (a shared checking account, the household internet bill). **Set** = personal, private by default to that one member.
- A new table, `finance_account_shares` (and the equivalent for bills), records explicit grants — a member sharing a specific private account with specific other members, not an all-or-nothing household toggle:
  ```sql
  finance_account_shares (
    id, household_id, account_id,
    shared_with_user_id, shared_by_user_id, created_at
  )
  -- same shape for recurring_bills: finance_bill_shares
  ```
- `transactions`, `account_balance_snapshots`, and `csv_import_batches` get **no visibility field of their own** — they inherit their parent account's visibility transitively via `account_id`. Seeing "a transaction" without the account it belongs to doesn't mean anything; privacy lives at the account level, not scattered across every table that references one.
- `categories`/`category_rules` stay household-wide, unchanged — a shared categorization taxonomy isn't the kind of thing that needs privacy, and keeping it shared means "Groceries" means the same thing on everyone's private and joint accounts alike.
- **The household Owner role still does not imply visibility into private data** — restating this explicitly since it's the one part of v1's original reasoning that was correct all along and shouldn't get lost in the back-and-forth: Owner governs household administration (invite/remove/transfer ownership), not an automatic window into every member's private accounts.
- **"My Dashboard" vs. "Household Dashboard"**, now a real distinction, not just a filter: My Dashboard shows everything I have access to (my private accounts + joint accounts + anything shared with me). Household Dashboard shows **only joint/shared accounts** — it does not attempt to show an aggregate net-worth figure that quietly sums in anyone's private balances, even anonymized. This resolves the addendum's own previously-open question ("can a household aggregate ever show a summed total derived from private accounts") with a firm no — private means private, including in aggregate, not just in the line-item view.

RLS changes accordingly — see the updated data model below.

## Scope (MVP), per source PRD §5 / §27 / §28 — adopted verbatim

**In:** accounts (7 types — checking, savings, credit_card, cash, loan, mortgage, investment; investment is balance-only, no holdings/lots); transactions (5 types — expense, income, transfer, payment, refund — with linked transfer/payment pairs so money moving between owned accounts never double-counts as spend); manual entry + CSV import (guided wizard: upload → map columns → review flagged duplicates → confirm, the same shape as Shohaz's existing CSV import, §15/§20 of the source PRD); categories with one level of subcategories + user-authored forward-only rules; recurring bills (manual only, no pattern detection at the time this was written — **statement-based auto-detection added 2026-08-19**, see Personal Finance PRD §35's RecurringBill row); dashboard led by net worth + cash flow, every number click-through to its underlying transactions; net worth trend via periodic `AccountBalanceSnapshot`, populated by a nightly scheduled job (the same job mechanism Shohaz already uses for Trash auto-purge); search/filtering with URL-reflected filter state; Archive + Trash lifecycle applied to Account/Transaction/Category/RecurringBill, the identical 30-day/restorable/Delete-Forever-only-from-Trash pattern Shohaz already has (PRD §14); Activity Feed — **reuses Shohaz's existing `activity_log` table directly, no new table needed.**

**Out of MVP** (source PRD §28, Phase 2+): bank sync/Plaid, budgets, financial goals, debt payoff tooling, split transactions, receipt attachments *on transactions* (does not affect Shohaz's existing item-level receipt attachments — unrelated, already-shipped feature, no conflict), AI-assisted categorization, proactive push/in-app alerts (distinct from the Activity Feed, which *is* in scope), optimistic-concurrency conflict surfacing (source PRD uses last-write-wins for MVP; Shohaz's own conflict-surfacing pattern, PRD §13, is a real candidate to extend to finance post-MVP, not required now), multi-currency, multi-household-per-user.

## Data model additions (household-scoped, RLS-enforced, same conventions as Shohaz PRD §22)

Condensed from source PRD §10/§31 — read there for full field lists and rationale:

```sql
accounts (
  id, household_id, name, type,  -- checking|savings|credit_card|cash|loan|mortgage|investment
  institution_name, current_balance, available_balance, starting_balance,
  card_last_four,                -- added by the Receipt Scanning Addendum §6
  owner_user_id,                 -- nullable; null = joint/household, set = personal (private by default)
  status, opened_at, archived_at, trashed_at, permanently_delete_after
)

finance_account_shares (id, household_id, account_id, shared_with_user_id, shared_by_user_id, created_at)

account_balance_snapshots (id, account_id, balance, as_of_date, source)  -- visibility inherited via account_id

transactions (
  id, household_id, account_id, occurred_at, posted_at, amount, type,  -- expense|income|transfer|payment|refund
  category_id, merchant, description, notes,
  status,  -- pending|posted (bank posting state, distinct from trash lifecycle)
  excluded_from_reports, linked_transaction_id,  -- self-FK, both legs of a transfer/payment point to each other
  source,  -- manual|csv_import|receipt_scan
  import_batch_id, trashed_at, permanently_delete_after
  -- no visibility field — inherited from accounts via account_id
)

categories (id, household_id, name, parent_category_id, is_default, is_archived, trashed_at, permanently_delete_after)  -- household-wide, no privacy
category_rules (id, household_id, match_field, match_type, match_value, category_id, applies_from)  -- forward-only, household-wide
recurring_bills (id, household_id, name, expected_amount, frequency, next_due_date, category_id, account_id, owner_user_id, is_active, trashed_at, permanently_delete_after)
finance_bill_shares (id, household_id, bill_id, shared_with_user_id, shared_by_user_id, created_at)
csv_import_batches (id, household_id, account_id, file_name, column_mapping, imported_at, row_count, duplicate_count, status)  -- visibility inherited via account_id
```

**RLS updated from the plain household-membership check** (still the base layer, PRD §27) to add a visibility predicate on `accounts` and `recurring_bills`, with everything else inheriting via `account_id`/`bill_id`:

```sql
-- accounts (and recurring_bills, same shape):
EXISTS (household_members WHERE household_id = accounts.household_id AND user_id = auth.uid())
AND (
  accounts.owner_user_id IS NULL                                                    -- joint/household
  OR accounts.owner_user_id = auth.uid()                                            -- mine
  OR EXISTS (finance_account_shares WHERE account_id = accounts.id AND shared_with_user_id = auth.uid())  -- shared with me
)

-- transactions (and account_balance_snapshots, csv_import_batches — same pattern, joined through account_id):
EXISTS (household_members WHERE household_id = transactions.household_id AND user_id = auth.uid())
AND EXISTS (
  SELECT 1 FROM accounts a WHERE a.id = transactions.account_id AND (
    a.owner_user_id IS NULL OR a.owner_user_id = auth.uid()
    OR EXISTS (finance_account_shares WHERE account_id = a.id AND shared_with_user_id = auth.uid())
  )
)
```

**Open engineering decision** (source PRD §30/§32, unresolved there too): balance-computation strategy — denormalized `current_balance` on `accounts`, kept consistent via a Postgres trigger on transaction change vs. scheduled recompute, source of truth being `starting_balance + Σ(transactions)`.

## Navigation — the one thing that must be decided now, not deferred

Shohaz today: 4-tab bottom nav (Home, Search, Locations, Settings) + a raised circular camera FAB. The finance domain's own spec (source PRD §35) is a different 4 — Dashboard, Transactions, Accounts, More — and no FAB, because finance has no single dominant, instant capture action the way pointing a camera at an object is for Shohaz.

The source `DESIGN-ALIGNMENT.md` (§7) already named this the single largest open item, back when the plan was still two apps merging later: *"a mode-switcher above the bottom nav (Home/Finance toggle) or a genuinely unified nav."* Now that it's one app being built once, this is a real decision to make before screens get built, not a someday problem.

**Recommendation:** a mode-switcher (Home / Finance toggle above or as part of the bottom nav, each mode keeping its own already-fit-for-purpose nav underneath). This preserves Shohaz's camera-first home experience without dilution, and preserves finance's dashboard-first shape without forcing it into a search-and-FAB pattern it was never designed around. Flagging as a recommendation, not a unilateral decision — this affects IA more than visual styling and deserves the same scrutiny the rest of Shohaz's nav got.

## Design tokens the finance domain needs (already worked out in source `DESIGN-ALIGNMENT.md` §1–5, against Shohaz's *real* shipped tokens)

- A positive/negative amount color pair (muted olive/forest for positive, muted brick/rust for negative) — deliberately not reusing `danger`, which stays reserved for irreversible actions only, per Shohaz's own existing rule.
- An extended category-accent hue set (5–6 hues vs. inventory's trio) — same deterministic-hash mechanism, larger palette, since finance's category list runs longer than item categories.
- `font-variant-numeric: tabular-nums` on every currency figure — a modifier on Shohaz's existing type roles, not a new role.
- Icon set grouped by function (`Landmark` for checking/savings/loan/mortgage, `CreditCard`, `Wallet`, `TrendingUp` for investment) rather than one icon per account type — matches Shohaz's own "resist one-off symbols" rule.
- Component reuse table: `ItemCard` → `AccountCard` (swap the photo for a tinted account-type icon panel, keep the same hover/selected/dual-purpose-as-button behavior), `EmptyState`/`ConfirmDialog`/`IconChip` reused directly with zero changes. Full detail in the source design-alignment doc — worth reading directly rather than re-derived here.
- One unresolved detail in the source doc: Button corner-radius wasn't confirmed against Shohaz's real `Button` component source (proposed `lg`/16px, unconfirmed) — cheap to verify now that this is literally the same codebase, not a separate app guessing from a reference file.

## Open questions carried over from the source PRD (§32) — still unresolved, now shared with Shohaz's own open items

- Balance computation strategy (trigger vs. scheduled recompute).
- CSV duplicate-detection heuristic — needs a concrete, testable definition before the import wizard is built.
- Category-trash-with-references UX (block with reassignment prompt vs. force-archive).
- Household deletion lifecycle — the source PRD notes Shohaz's own PRD doesn't fully specify this either; worth resolving once, for both domains, not per-table.
- Currency (source PRD assumes single/implicit USD) and multi-household-per-user (assumes one, matching Shohaz) — confirm both are still acceptable now that it's genuinely one user base, not two products' separate assumptions happening to agree.

## What happened to the `personal-finances` repo

Resolved 2026-08-17: its three docs (`PRD.md`, `DESIGN-ALIGNMENT.md`, and the original discovery-brief `scratch.md`) were relocated into this repo as [Personal Finance PRD](Personal%20Finance%20PRD.md), [Personal Finance Design Alignment](Personal%20Finance%20Design%20Alignment.md), and [Personal Finance Discovery Brief](Personal%20Finance%20Discovery%20Brief.md) respectively. The source repo held no application code (confirmed in its own `DESIGN-ALIGNMENT.md`) and is being archived — everything now lives in this repo.
