> **Relocated 2026-08-17** from a separate repo (`personal-finances`, local-only, never pushed) into this repo's `docs/`, per the decision to fold the finance product directly into Shohaz's codebase instead of building and merging a separate app — see [Personal Finance Addendum](Personal%20Finance%20Addendum.md). Content below is unchanged from the original; only its location moved. Original discovery brief that produced this PRD: [Personal Finance Discovery Brief](Personal%20Finance%20Discovery%20Brief.md). Companion design doc: [Personal Finance Design Alignment](Personal%20Finance%20Design%20Alignment.md).

# Personal Finance Ledger — Product Requirements Document

**Status:** Draft v1.1 — MVP scope confirmed via discovery; household/roles/lifecycle model aligned with the Shohaz (home-inventory) PRD ahead of a planned future merge (§34)
**Date:** 2026-08-17
**Owner:** Muatasim Qazi

---

## 1. Executive Summary

A household-oriented personal-finance ledger — not an expense tracker. It represents the full shape of a household's finances (checking, savings, credit cards, cash, loans, mortgages, investments) as a connected ledger of accounts and transactions, and surfaces that data through a dashboard that leads with net worth and cash flow. MVP is manual-entry and CSV-import driven, single-household, Owner/Member permissioned, with every summary number explainable down to the transactions behind it.

This product is designed to eventually merge with **Shohaz**, a household home-inventory app built on the same household/Supabase/Next.js foundation — see [§34](#34-alignment-with-shohaz-home-inventory-app) for what's shared and why.

## 2. Problem Statement

Existing tools tend toward one of two failure modes: expense trackers that flatten all money movement into "spending" (so a credit-card payment or an account transfer inflates reported spend), or heavyweight finance suites that overwhelm a new user with features before they've trusted the basic numbers. Households need a tool that gets the *ledger mechanics* right — transfers and payments never double-count as spend — while staying simple enough to onboard in a sitting.

## 3. Product Vision

A central, trustworthy financial dashboard for a household: one place to see what you have, what you owe, where money went, and why the numbers say what they say — with every figure traceable to real transactions, not a black box.

## 4. Goals

- Correctly model accounts, transactions, transfers, and payments so aggregate numbers (spend, income, net worth) are never distorted by double-counting.
- Give a household a shared view of their finances from day one, with a light, consistent permission boundary around household administration.
- Make every dashboard number explainable — click through to the transactions behind it.
- Ship a genuinely useful first version without recreating Mint/YNAB/Monarch/Copilot feature-for-feature.
- Build on a household/data foundation that a future merge with Shohaz doesn't have to re-migrate.

## 5. Non-Goals (MVP)

Bank sync (Plaid) · budgets · financial goals · debt payoff strategy tooling · AI features · split transactions · receipt attachments · proactive notifications/alerts (upcoming-bill or unusual-spending pushes — distinct from the in-app Activity Feed, which *is* MVP, §22) · investment holdings/lot-level detail · natural-language search · multi-currency · multi-household membership per user.

## 6. Target Users

- **Primary:** A household (couple/family) managing shared finances together, wanting one accurate shared picture rather than separate spreadsheets or apps per person.
- Comfortable doing light manual data entry and CSV export/import from their bank in exchange for correctness and no third-party bank-credential sharing.
- **Household roles:** every household has exactly one **Owner** and any number of **Members** (aligned with Shohaz's role model, §34). Owner and Member have **identical access to financial data** — both can add, edit, and view every account and transaction equally; the product's spirit of "everyone manages the ledger together" is unchanged. The role distinction is narrowly scoped to household administration: only the Owner can invite or remove members, transfer ownership, or delete the household. Exactly one Owner exists at all times, enforced as a database invariant, not just an application rule.

## 7. User Jobs / Jobs-to-be-Done

- "When the month ends, help me understand where our money went, without me re-deriving it by hand."
- "When I look at a balance or spend number, let me see exactly which transactions produced it."
- "When money moves between our own accounts (transfer, credit-card payment), don't count it as spending."
- "When a bill repeats every month, let me see it's coming without re-entering it."
- "When either of us adds a transaction, the other should see the same shared truth — and be able to see who changed what."

## 8. Product Principles

1. **Financial correctness over visual cleverness** — the ledger model (expense/income/transfer/payment/refund, linked transfer pairs) is the foundation everything else is built on.
2. **Progressive complexity** — a new user understands the product in one sitting; depth (rules, recurring bills, net worth trend) reveals itself as needed.
3. **User control** — categorization rules and recurring-bill detection are user-authored and user-correctable, never silently automated.
4. **Explainable numbers** — every summary figure is a link to its underlying transactions, not a terminal value.
5. **Avoid premature scope** — MVP is deliberately narrower than the full feature set described in discovery.
6. **Shared foundation over convenient divergence** — where a decision has no strong finance-specific reason to diverge from Shohaz's already-built household/data patterns, match Shohaz (§34), because the two products are expected to merge.

## 9. Information Architecture

```
Dashboard (home)
Accounts
  └─ Account detail (balances history, filtered transactions)
Transactions (searchable/filterable list)
Categories (manage categories + rules)
Recurring Bills (upcoming list + management)
Net Worth (trend view)
Activity (household-wide audit feed, §22)
Trash (recoverable deletions, §33)
Household Settings (members, roles, invite)
Account Settings (user profile)
```

Single-household per user in MVP — no household switcher. A user who needs a second household is out of scope until Phase 2+ (also true of Shohaz, §34).

## 10. Core Entities

| Entity | Key fields | Notes |
|---|---|---|
| **User** | id, email, display_name, avatar_url, created_at | id = Supabase auth uid; shared identity table, same shape as Shohaz's `users` (§34) |
| **Household** | id, name, created_at | Owns all financial data |
| **HouseholdMember** | id, household_id, user_id, role, joined_at | role ∈ {owner, member}; DB-enforced invariant: exactly one `owner` per household (partial unique index), matching Shohaz exactly (§34) |
| **Invite** | id, household_id, invited_email, invited_by_user_id, status, created_at, expires_at | Email-bound acceptance — verifies the signed-in email matches the invite, not a forwardable bearer link (matches Shohaz, resolves former open question) |
| **Account** | id, household_id, name, type, institution_name, current_balance, available_balance, starting_balance, status, opened_at, archived_at, trashed_at, permanently_delete_after | type ∈ {checking, savings, credit_card, cash, loan, mortgage, investment}; lifecycle per §33 |
| **AccountBalanceSnapshot** | id, account_id, balance, as_of_date, source | Periodic snapshot; feeds net-worth history |
| **Transaction** | id, household_id, account_id, occurred_at, posted_at, amount, type, category_id, merchant, description, notes, status, excluded_from_reports, linked_transaction_id, source, import_batch_id, trashed_at, permanently_delete_after | type ∈ {expense, income, transfer, payment, refund}; `status` here is the bank posting state (pending/posted) — kept distinct from the trash lifecycle fields; transfers/payments use `linked_transaction_id` to point to their counterpart leg |
| **Category** | id, household_id (nullable = system default), name, parent_category_id, is_default, is_archived, trashed_at, permanently_delete_after | Supports subcategories via self-reference |
| **CategoryRule** | id, household_id, match_field, match_type, match_value, category_id, applies_from | Applied going forward only, not retroactively (§32) |
| **RecurringBill** | id, household_id, name, expected_amount, frequency, next_due_date, category_id, account_id, is_active, trashed_at, permanently_delete_after | Manual only, no detection |
| **CsvImportBatch** | id, household_id, account_id, file_name, column_mapping, imported_at, row_count, duplicate_count, status | One row per import run |
| **ActivityLog** | id, household_id, actor_user_id, entity_type, entity_id, action, changed_fields (JSONB), created_at | Same shape as Shohaz's `activity_log` (§34); backs the Activity Feed and, later, a unified cross-domain feed at merge time |

## 11. Core User Journeys

1. **Onboard** — sign up, create household (becomes Owner), invite members.
2. **Set up accounts** — add accounts across all seven types with starting balances.
3. **Record transactions** — manual entry or CSV import.
4. **Categorize** — assign category; optionally save a rule for future matches.
5. **Read the dashboard** — net worth, cash flow, balances, category breakdown, recent activity, upcoming bills.
6. **Investigate a number** — click any dashboard figure through to its underlying transactions.
7. **Search history** — filter by date/account/category/merchant/amount.
8. **Track recurring bills** — flag an expense as recurring, see it in an upcoming list.
9. **Manage household membership** *(Owner-only)* — invite a member, remove a member, transfer ownership.
10. **Review who changed what** — open the Activity Feed, household-wide or scoped to one account/transaction.
11. **Recover a mistaken deletion** — open Trash, restore an account, transaction, category, or recurring bill within its 30-day window.

## 12. Functional Requirements

Expressed as *Requirement → User value → Behavior/edge cases* where useful; see §13–19 for area-specific detail. Cross-cutting requirements:

- Requirement: Every transaction has an unambiguous `type`. → User value: spend/income totals are never contaminated by transfers or payments. → Edge case: type is set at entry time and is not inferable after the fact from amount sign alone (a payment and an expense can both be negative on a checking account).
- Requirement: Transfers and credit-card payments are represented as linked pairs of transactions across two accounts. → User value: money movement between owned accounts is fully traceable and never appears as spend. → Edge case: if one leg is deleted, its counterpart must be deleted or explicitly unlinked, never left orphaned.
- Requirement: Owner and Member see and edit identical financial data. → User value: no "my view vs. your view" confusion. → Edge case: simultaneous edits (two members editing the same transaction) — last write wins for MVP, no conflict UI (Shohaz's optimistic-concurrency conflict-surfacing, §34, is a candidate to adopt at merge time, not required now).
- Requirement: Household-administration actions (invite, remove member, transfer ownership) are Owner-only, enforced at the database level. → User value: matches the exact permission boundary Shohaz already uses, so merging household membership later isn't a migration. → Edge case: an Owner cannot leave the household or be removed while they're the sole Owner — ownership must be transferred first.

## 13. Dashboard Requirements

- Leads with **net worth** (current value + trend) and **cash flow** (income vs. spend this month, compared to prior month).
- Below the fold: account balances list, category spending breakdown (current month), recent transactions, upcoming recurring bills.
- Every number is a link into a pre-filtered transaction view (Principle 4).
- Not a single undifferentiated grid — information is prioritized, not exhaustive (per product-philosophy directive to determine hierarchy, not show everything).

## 14. Account Requirements

- Requirement: Support checking, savings, credit card, cash, loan, mortgage, investment account types. → User value: represents a household's real balance sheet, not just spending accounts. → Edge case: investment accounts in MVP are balance-only (manually updated), no holdings/lots (§32, §28).
- Requirement: Track current balance, available balance (where applicable — credit cards), starting balance, and lifecycle state (active/archived/trashed, §33). → Edge case: archived accounts remain visible in historical reports covering periods when they were active, but excluded from "current" views; a "closed" account (e.g. a paid-off loan, a canceled card) is represented as archived, not a separate status.
- Requirement: Manual balance updates. → Edge case: a manual balance update should reconcile against transaction-derived balance, not silently override it without record (see §31 balance computation).

## 15. Transaction Requirements

- Requirement: Manual entry and CSV import. → User value: low-friction correctness without bank-credential sharing. → Edge case: CSV import requires column mapping (bank formats vary) and duplicate detection against existing transactions (same account + date + amount + normalized description within a tolerance window).
- Requirement: Pending vs. posted status. → User value: matches how banks actually surface transactions. → Edge case: a pending transaction's amount/date may change once posted — user must be able to reconcile without creating a duplicate.
- Requirement: Notes field, exclude-from-reports flag. → Edge case: an excluded transaction still appears in the account's raw ledger, just not in aggregate reports.
- Non-goals for MVP: split transactions (one transaction, one category only), attachments/receipts (see §28).

## 16. Categories & Rules

- Default category set provided; users can add custom categories and subcategories (one level of nesting).
- User-defined rules: `merchant contains X → category Y`, applied to future transactions only (not retroactive — see §32 for reconsideration criteria).
- Manual correction of any auto-applied category is always available and does not modify the rule itself.
- A category referenced by any non-trashed transaction cannot be trashed outright — it must be archived (hidden from pickers, existing transactions keep referencing it) or have its transactions reassigned first (§33; exact UX is an open question, §32).

## 17. Budgets

**Phase 2.** Deferred — MVP proves the transaction/category/dashboard loop first; budgets are meaningful once categories and month-over-month data are stable.

## 18. Recurring Bills & Subscriptions

- Manual only: user records name, expected amount, frequency, next due date, optional category/account link.
- Surfaces as an "upcoming" list on the dashboard.
- No automatic pattern detection in MVP (see §28).

## 19. Search & Reporting

- Filter transactions by date range, account, category, merchant, amount range, and type.
- Month-over-month comparison view.
- Filters are expressed in the URL (shareable, back-button-safe).
- No saved/named reports, no natural-language queries in MVP (see §28).

## 20. Data Import / Synchronization

- **Manual entry** and **CSV import** only in MVP.
- CSV import is a guided flow: upload → map columns → review flagged duplicates → confirm — the same shape as Shohaz's CSV import (§34), sharing the pattern (and, at merge time, likely the component) even though the field targets differ.
- Bank sync (Plaid or alternatives) is explicitly deferred to Phase 2 — it introduces cost, compliance surface, and a hard external dependency that shouldn't gate validating the core ledger model.

## 21. Notifications & Alerts

**Proactive alerts deferred beyond MVP** (upcoming-bill reminders, unusual-spending detection, over-budget warnings — none of these ship in MVP, matching Shohaz's push-notifications deferral). This is distinct from the **Activity Feed** (§22), which *is* in MVP — the Activity Feed is a pull surface (you open it to see what changed), not a push notification.

## 22. Privacy, Security & Collaboration

- Authentication via Supabase Auth.
- Authorization boundary = household membership. Every household-scoped table carries `household_id`; Row Level Security policies gate access on membership in that household via `HouseholdMember`.
- **Roles:** Owner and Member share full read/write access to financial data. Household administration (invite, remove member, transfer ownership, delete household) is Owner-only, enforced by RLS policy in addition to application checks — not just a UI-level gate. Exactly one Owner per household at all times (§6, §31).
- **Activity Feed / audit trail:** every mutation to household financial data writes an `ActivityLog` entry (actor, entity, action, changed fields). Browsable both household-wide and scoped to a single account/transaction — matches Shohaz's activity feed exactly (§34), and gives correctness-sensitive financial data an audit trail from day one rather than deferring it.
- No bank credentials are collected or stored in MVP (manual/CSV only) — this is a deliberate security posture, not just a scope cut.
- Data export and account/household deletion must be supported (users own their financial data).
- Simultaneous-edit conflicts use last-write-wins for MVP (§12); Shohaz's optimistic-concurrency conflict-surfacing is a documented candidate for adoption at merge time, not required now.

## 23. UX Requirements

- Every destructive or hard-to-reverse action (trash an account, remove a household member, delete a rule) requires explicit confirmation; trashing (§33) is explicitly framed as recoverable-for-30-days, distinct from the rarer, more serious permanent-delete confirmation.
- Category reassignment on a transaction should be possible inline, without opening a full edit form.
- Dashboard numbers must always be clickable through to source transactions (Principle 4, not optional polish).

## 24. Responsive / Mobile Requirements

- Full functionality on both desktop and mobile — this is a household tool used from a phone as often as a laptop.
- Desktop: persistent left navigation, tables with sortable columns, filters as a toolbar.
- Mobile: bottom tab navigation, tables collapse to stacked cards, filters collapse into a sheet/drawer.

## 25. Accessibility

- Keyboard operability for all forms, filters, and the CSV import wizard.
- Visible focus states throughout.
- Color is never the sole carrier of meaning (e.g., income vs. expense, over/under budget in Phase 2) — pair with icon/label/sign.
- Sufficient contrast on all text, including any color used for positive/negative amounts.

## 26. Empty, Loading & Error States

- **Empty:** no accounts yet → "Add your first account" CTA; no transactions → "Add a transaction" / "Import a CSV" CTA; filtered view with no matches → "No transactions match these filters" + clear-filters action; empty Trash and empty Activity Feed each get their own designed empty state, not a blank screen.
- **Loading:** skeleton rows for tables, skeleton tiles for dashboard stat cards.
- **Error:** CSV import failures surface inline, row-level, at the mapping/review step — not a generic failure toast; balance/transaction save failures surface as inline field errors.

## 27. MVP Scope

Auth & household (Owner/Member roles, single-owner invariant, email-bound invite) · accounts (7 types, balance-only investments) · transactions (manual + CSV import, typed, linked transfer/payment pairs, pending/posted) · categories & user-authored rules (forward-applying) · dashboard (net worth + cash flow led) · net worth with historical trend · recurring bills (manual) · search/filtering · explainability (click-through numbers) · Archive/Trash lifecycle (§33) · Activity Feed / audit trail (§22).

## 28. Phase 2 / Future Scope

Bank sync (Plaid) · budgets · financial goals · debt payoff tooling · split transactions · receipt attachments · light AI-assisted categorization (suggest, not auto-apply) · proactive push/in-app notifications (bill reminders, unusual spending) · optimistic-concurrency conflict surfacing (adoptable from Shohaz at merge time, §34).

**Longer-term:** automatic recurring-bill detection · natural-language financial queries · investment holdings/lots + performance tracking · saved/advanced reports · unusual-spending detection · the actual Shohaz merge itself (§34).

## 29. Success Metrics

- A household can fully represent its real accounts and a month of transactions within one onboarding session.
- Zero instances of transfers/credit-card payments inflating the reported spend total (correctness is binary, not a gradient).
- Every dashboard summary number is click-through-verifiable to its transactions.
- Both household members actively add/review transactions (shared usage, not single-user).

## 30. Technical Considerations

- **Stack:** Next.js, TypeScript, Supabase (Postgres, Auth, RLS); Storage deferred until attachments land in Phase 2. Identical to Shohaz's stack (§34) by design.
- **API conventions:** REST-shaped Next.js API routes under `/api/v1/...`, cursor-based pagination (default page size 50, max 100), and a `{ error: { code, message } }` JSON error shape — matching Shohaz's conventions exactly, so a merged API surface doesn't end up with two dialects.
- **Mutations** go through server actions/API routes where business logic matters (linked transfer-pair creation, rule application, CSV import processing, activity-log writes) rather than raw client table writes.
- **Balance computation:** open decision for engineering — store `current_balance` denormalized on `Account` and keep it consistent via a Postgres function/trigger on transaction change, source-of-truth being `starting_balance + Σ(transactions)`. Flagged in §32 as needing an explicit recompute strategy (trigger-on-write vs. scheduled).
- **Net worth history:** driven by `AccountBalanceSnapshot`, populated by a nightly scheduled job (e.g., `pg_cron` or a Supabase Edge Function) rather than snapshotting on every balance change. The same scheduled-job mechanism also runs the Trash auto-purge (§33), mirroring Shohaz's approach.
- **CSV import:** per-bank column-mapping templates saved for reuse; duplicate detection needs a concrete algorithm defined in engineering (proposed heuristic: same account + date ± N days + amount + normalized description similarity).

## 31. Supabase / Data Model Considerations

- RLS policy pattern: every household-scoped table policy checks `EXISTS (SELECT 1 FROM household_members WHERE household_id = <row>.household_id AND user_id = auth.uid())` — identical pattern to Shohaz.
- Owner-only actions (invite, remove member, transfer ownership, delete household) get an additional RLS check on `household_members.role = 'owner'`, not just membership.
- **Single-owner invariant:** a partial unique index on `household_members` — `UNIQUE (household_id) WHERE role = 'owner'` — enforced at the database level, matching Shohaz's exact mechanism (§34).
- `linked_transaction_id` is a self-referencing FK on `Transaction`; both legs point to each other — deleting one must cascade-handle or block deletion of an orphaned counterpart.
- `Category.household_id` nullable pattern distinguishes system default categories (shared, read-only) from household-custom ones.
- `ActivityLog.changed_fields` stores only what changed, not full before/after snapshots — same convention as Shohaz.
- Trash lifecycle fields (`trashed_at`, `permanently_delete_after`) follow Shohaz's naming exactly, so a scheduled purge job can eventually run identically across both domains' tables.
- Single currency assumed for MVP (no currency field on Account/Transaction) — multi-currency is out of scope and would require a schema change, not an additive one, if added later; worth confirming this assumption explicitly (§32).

## 32. Open Questions

1. **Category rule retroactivity** — confirmed forward-only for MVP; revisit if user feedback shows this is a recurring pain point (would require either an async re-categorization job or an explicit "apply to existing transactions" action).
2. **Balance computation strategy** — trigger-based recompute vs. scheduled — needs an engineering decision before schema is finalized (§30).
3. **CSV duplicate-detection heuristic** — needs a concrete, testable definition before the import wizard is built (§30).
4. **Currency** — MVP assumes single currency (implicitly USD). Confirm this is acceptable, since retrofitting multi-currency later is a schema-level change.
5. **Multi-household membership** — MVP assumes one household per user, matching Shohaz. Confirm this is acceptable for the target audience (e.g., blended households, adult children still on a parent's household).
6. **Category trash-with-references rule** — exact UX when a user tries to trash a category still referenced by transactions (block with a reassignment prompt vs. force-archive) needs a concrete design, not just the behavioral principle stated in §16.
7. **Household deletion** — is deleting an entire household Owner-only and immediate, or does it route through the same Trash/30-day lifecycle as other entities? Shohaz's PRD doesn't fully specify this either — worth resolving for both products together, not just this one.

---

## 33. Data Lifecycle: Archive & Trash

Adopted directly from Shohaz's pattern (§34) and applied to Account, Transaction, Category, and RecurringBill.

- **Archive** (Account and Category only): soft, deliberate, indefinite. "I don't use this anymore, but keep the record." Excluded from default/current views, restorable any time, no retention limit. A "closed" account or a retired category is represented as archived, not a separate status.
- **Trash**: the outcome of any delete action, on any of the four entities above. Retained for **30 days**, restorable within that window, then automatically and permanently purged by a scheduled job (§30). Active records cannot be permanently deleted directly — **Delete Forever** is available only from within Trash, uses a dedicated danger treatment, and requires explicit confirmation, distinct from the routine trash-confirmation copy (§23).
- **Deleting an Account with transactions**: its transactions move to Trash *together* with it — never orphaned, never silently cascaded without the same recoverability guarantee.
- **Trashing a Category still referenced by transactions**: blocked or requires reassignment first — see open question §32.6.
- **Linked transfer/payment pairs**: trashing one leg trashes its counterpart together, for the same reason deleting an account cascades its transactions — an orphaned linked leg is a correctness bug, not an edge case to tolerate.

---

## 34. Alignment with Shohaz (Home Inventory App)

The long-term goal is a single merged app spanning both home inventory (Shohaz) and personal finance. This section makes explicit what's shared now, so the merge is a schema *extension*, not a *migration*.

**Already shared by independent design, before this alignment pass:** Next.js + TypeScript + Supabase (Postgres, Auth, RLS) + Vercel; household as the tenant boundary; RLS keyed on `household_id`; single-household-per-user in MVP; CSV-import-as-guided-wizard UX shape; an "explainable, user-controlled, never-silently-automated" product philosophy.

**Adopted in this pass, specifically to enable a clean merge:**

| Area | Shohaz's answer | Finance's answer (now) |
|---|---|---|
| Identity | `users` table, id = Supabase auth uid | Same shape (§10) |
| Membership | `household_members(household_id, user_id, role, joined_at)`, roles `owner`/`member`, DB-enforced single-owner invariant | Same shape and invariant (§10, §31) |
| Invites | Email-bound acceptance, not a bearer link, Owner-only | Same mechanism (§10) |
| Delete lifecycle | Archive (indefinite) + Trash (30-day, auto-purge, Delete Forever only from Trash) | Same pattern, applied to Account/Transaction/Category/RecurringBill (§33) |
| Audit trail | `activity_log` table + household-wide and per-entity browsable feed, MVP | Same table shape and feed, MVP (§10, §22) |
| API shape | REST, `/api/v1/...`, cursor pagination, `{error:{code,message}}` | Same conventions (§30) |

**Intentionally not aligned yet — real product differences, not oversights:**
- Shohaz's mobile-first AI-photo-capture flow has no finance analog; finance's capture path is manual entry + CSV import. These stay genuinely different, domain-specific flows.
- Shohaz's optimistic-concurrency conflict *surfacing* (§13 of its PRD) is not adopted here yet — finance MVP uses last-write-wins (§12, §22). It's recorded as a Phase-2/merge-time candidate, not silently dropped.
- Design tokens/visual system: Shohaz has an established Figma design system (taupe/neutral palette, SF Pro-derived type scale, Tailwind + shadcn/ui, Lucide icons, radius tokens). When this PRD moves into its own Figma/design-from-scratch pass, the plan is to **extend Shohaz's existing system** — reusing its palette, type scale, and component primitives — rather than building a parallel one, adding only what finance specifically needs (a semantic positive/negative-amount color convention that Shohaz's inventory domain has no equivalent for). This is a plan, not yet executed — no finance screens have been designed.
- Multi-currency, multi-household-per-user, and push notifications remain deferred in both products independently — not merge-driven decisions.

**What the eventual merge looks like, conceptually:** one `households` / `household_members` / `users` / `invites` / `activity_log` foundation, with two domain schemas hanging off it — Shohaz's `locations` / `containers` / `items` / ... and finance's `accounts` / `transactions` / `categories` / ... — sharing RLS patterns, trash lifecycle, and API conventions, but each domain's entities and screens remain genuinely separate. The merge is additive to this foundation, not a rewrite of it, *as long as both PRDs keep this foundation in sync* going forward — a divergence introduced later (e.g. one product adding a second role, or changing the invite mechanism) should be evaluated against this section before being adopted unilaterally.

---

## 35. Figma Design Specification

*Written for handoff to a design agent. No colors or visual styling are prescribed here — per §34, the plan is to extend Shohaz's existing Figma design system rather than establish an independent one; the actual token/component reuse happens during the design-from-scratch pass, not in this document.*

### Navigation
- **Desktop:** persistent left sidebar — Dashboard, Accounts, Transactions, Categories, Recurring Bills, Net Worth, Activity, Trash, Household Settings. Top bar: search, user/account menu. No household switcher.
- **Mobile:** bottom tab bar — Dashboard, Transactions, Accounts, More (folds in Categories, Recurring Bills, Net Worth, Activity, Trash, Settings).

### Page hierarchy
```
/dashboard
/accounts            → /accounts/[id]  (balance history + filtered transactions)
/transactions        (list; detail opens as a drawer, not a route)
/categories           (manage categories + rules)
/recurring            (upcoming bills, manage)
/net-worth            (trend view)
/activity              (household-wide audit feed)
/trash                 (recoverable deletions)
/settings/household   (members, roles, invite — Owner-only actions visibly gated)
/settings/account     (user profile)
/login  /signup  /invite/[token]
```

### Required screens
Dashboard · Accounts list · Account detail · Transactions list · Categories & Rules management · Recurring Bills list/management · Net Worth trend · Activity Feed · Trash · Household Settings (members/roles/invite) · Account Settings · Login/Signup · Invite acceptance.

### Dashboard layout
Net worth + cash-flow summary at top (leading, per §13); account balances, category breakdown, recent transactions, and upcoming recurring bills below, ordered by priority rather than an even grid. Every stat is a navigable link into its supporting transaction view.

### Desktop behavior
Sidebar persistent; content max-width constrained for readability; tables with sortable columns; filters as a toolbar above tables, not buried in a modal.

### Mobile behavior
Sidebar replaced by bottom tab bar; tables collapse to stacked cards; filters collapse into a bottom sheet.

### Major components
Stat/summary tile, Account card, Transaction table/row, Category badge, Balance-trend chart (line), Category-breakdown chart, Recurring-bill list item, Filter bar, CSV import wizard (multi-step: upload → map columns → review duplicates → confirm), Transaction form (drawer), Account form (drawer), Rule form (modal), Invite-member form (modal, Owner-only), Activity Feed row, Trash row (Restore / Delete Forever), Role badge (Owner/Member), Confirmation dialog (trash-level and permanent-delete-level, visually distinct).

### Tables
Transactions table: date, account, merchant/description, category (badge, inline-editable), amount, status (pending/posted). Sortable by date and amount. Row click opens the transaction detail drawer.

### Charts
Net worth trend — line, over time. Cash flow — income vs. expense, per month. Category breakdown — ranked by spend (donut or horizontal bar).

### Filters
Date range, account(s), category(ies), merchant search, amount range, transaction type — filter state reflected in the URL.

### Modals / drawers
Right-side drawer for transaction add/edit/detail (keeps table context visible behind it). Centered modal for confirmations, invite-member (Owner-only), and rule creation (short, single-purpose forms).

### Forms
Transaction (date, account, type, amount, category, merchant, notes), Account (name, type, institution, starting balance), Recurring bill (name, amount, frequency, next date, category/account), CSV column-mapping (source column → date/amount/description/type).

### Empty / loading / error / confirmation states
Empty and loading per §26. Error states for CSV import surface inline at the row/field level during the mapping and review steps, not as a generic toast. Two distinct confirmation tiers per §33: trashing (recoverable-for-30-days framing) and permanent delete (reachable only from Trash, meaningfully more serious copy/treatment).

### Responsive behavior
Single-column stacking below ~768px; sidebar → bottom tab bar; tables → card list.

### Interaction patterns
Dashboard numbers navigate into a pre-filtered transaction view. Category can be reassigned inline from a transaction row via dropdown, without opening the full edit form. CSV import is a guided multi-step wizard, never a single silent bulk action. Owner-only actions (invite, remove member, transfer ownership) are visibly gated in the UI for Members, not just blocked server-side after the fact.
