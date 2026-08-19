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
- **Household roles:** every household has exactly one **Owner** and any number of **Members** (aligned with Shohaz's role model, §34). **Updated 2026-08-18 — individual privacy is real, not identical access:** an account or recurring bill can be personal (private by default to the member who owns it) or joint (visible to the whole household, the default for anything not explicitly personal). A member shares a specific private account with specific other members explicitly; nothing is visible by default just by being in the same household. The role distinction stays narrowly scoped to household administration regardless — only the Owner can invite or remove members, transfer ownership, or delete the household, and **Owner status does not itself grant visibility into another member's private financial data.** Exactly one Owner exists at all times, enforced as a database invariant, not just an application rule. Full model: Personal Finance Addendum, "Privacy model."

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
| **Account** | id, household_id, name, type, institution_name, current_balance, available_balance, starting_balance, **card_last_four**, **owner_user_id**, status, opened_at, archived_at, trashed_at, permanently_delete_after | type ∈ {checking, savings, credit_card, cash, loan, mortgage, investment}; lifecycle per §33; `card_last_four` added by the Receipt Scanning Addendum §6; `owner_user_id` added 2026-08-18 (Personal Finance Addendum, "Privacy model") — nullable, null = joint/household account (visible to everyone), set = personal account, private by default |
| **FinanceAccountShare** | id, household_id, account_id, shared_with_user_id, shared_by_user_id, created_at | Added 2026-08-18 — explicit per-member grant of visibility onto a private account. No row = not shared with that member. |
| **AccountBalanceSnapshot** | id, account_id, balance, as_of_date, source | Periodic snapshot; feeds net-worth history; visibility inherited from its account via `account_id`, no field of its own |
| **Transaction** | id, household_id, account_id, occurred_at, posted_at, amount, type, category_id, merchant, description, notes, status, excluded_from_reports, linked_transaction_id, source, import_batch_id, trashed_at, permanently_delete_after | type ∈ {expense, income, transfer, payment, refund}; **`source` ∈ {manual, csv_import, receipt_scan}** — previously listed as a field without its values ever being spelled out; a receipt-scan-originated transaction is found via the reverse lookup `scanned_transaction_drafts.resulting_transaction_id`, not a forward column here (avoids a redundant FK the way `import_batch_id` would otherwise imply one per source type). `status` here is the bank posting state (pending/posted) — kept distinct from the trash lifecycle fields; transfers/payments use `linked_transaction_id` to point to their counterpart leg. Visibility inherited from its account via `account_id`, no field of its own. |
| **Category** | id, household_id (nullable = system default), name, parent_category_id, is_default, is_archived, trashed_at, permanently_delete_after | Supports subcategories via self-reference; household-wide, no privacy — a shared taxonomy on purpose |
| **CategoryRule** | id, household_id, match_field, match_type, match_value, category_id, applies_from | Applied going forward only, not retroactively (§32); household-wide, no privacy |
| **RecurringBill** | id, household_id, name, expected_amount, frequency, next_due_date, category_id, account_id, **owner_user_id**, is_active, trashed_at, permanently_delete_after | Manual creation, **plus statement-based auto-detection added 2026-08-19** (upload a PDF statement → `finance/recurring/import` proposes candidates, never auto-creates — see `docs/v2-checklist.md` §29 / `docs/bugs.md` #23); `owner_user_id` added 2026-08-18, same nullable joint-vs-personal shape as `Account` |
| **FinanceBillShare** | id, household_id, bill_id, shared_with_user_id, shared_by_user_id, created_at | Added 2026-08-18 — same shape as `FinanceAccountShare`, for personal recurring bills |
| **CsvImportBatch** | id, household_id, account_id, file_name, column_mapping, imported_at, row_count, duplicate_count, status | One row per import run; visibility inherited from its account via `account_id` |
| **ActivityLog** | id, household_id, actor_user_id, entity_type, entity_id, action, changed_fields (JSONB), created_at | Same shape as Shohaz's `activity_log` (§34); backs the Activity Feed and, later, a unified cross-domain feed at merge time. **Resolved 2026-08-18 (§32.8)**: an entry about a private account/bill is filtered by the same visibility rule as the entity it references — a household member who can't see the account can't see "Sara added a transaction" about it either. Implemented as a join back to the referenced account/bill's `owner_user_id`/share grants at query time, not a denormalized visibility column on `ActivityLog` itself. |

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
- Requirement: joint accounts are visible to the whole household; personal accounts are private by default with explicit per-member sharing (§6, updated 2026-08-18). → User value: households get one shared truth for the money they actually manage together, while individuals keep genuine privacy for what's theirs. → Edge case: simultaneous edits on a *joint* account/transaction (two members editing the same one) — last write wins for MVP, no conflict UI (Shohaz's optimistic-concurrency conflict-surfacing, §34, is a candidate to adopt at merge time, not required now). Simultaneous-edit conflicts don't apply to personal accounts in the same way, since only the owner (and anyone they've shared with) can write to one.
- Requirement: Household-administration actions (invite, remove member, transfer ownership) are Owner-only, enforced at the database level. → User value: matches the exact permission boundary Shohaz already uses, so merging household membership later isn't a migration. → Edge case: an Owner cannot leave the household or be removed while they're the sole Owner — ownership must be transferred first.

## 13. Dashboard Requirements

- Leads with **net worth** (current value + trend) and **cash flow** (income vs. spend this month, compared to prior month).
- Below the fold: account balances list, category spending breakdown (current month), recent transactions, upcoming recurring bills.
- Every number is a link into a pre-filtered transaction view (Principle 4).
- Not a single undifferentiated grid — information is prioritized, not exhaustive (per product-philosophy directive to determine hierarchy, not show everything).
- **Two dashboards, added 2026-08-18 (Personal Finance Addendum, "Privacy model")**: **My Dashboard** (default landing view) computes net worth/cash flow/category breakdown from every account the viewer can see — their own personal accounts plus every joint account. **Household Dashboard** computes the same figures from joint accounts only, regardless of who's viewing, and never aggregates private balances into it even anonymized or rolled up — a household total that silently included someone's private balance would defeat the privacy model even without naming the account. Both reuse the same explainable click-through pattern (Principle 4); they differ only in which accounts feed the numbers.

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
- **Roles:** household administration (invite, remove member, transfer ownership, delete household) is Owner-only, enforced by RLS policy in addition to application checks — not just a UI-level gate. Exactly one Owner per household at all times (§6, §31). **Financial-data access is not identical across roles** (updated 2026-08-18, see §6) — joint accounts are visible to everyone, personal accounts are private by default and shared explicitly per-member, and this applies to Owner and Member alike; the Owner role carries no implicit visibility into another member's private data.
- **Activity Feed / audit trail:** every mutation to household financial data writes an `ActivityLog` entry (actor, entity, action, changed fields). Browsable both household-wide and scoped to a single account/transaction — matches Shohaz's activity feed exactly (§34), and gives correctness-sensitive financial data an audit trail from day one rather than deferring it. The "household-wide" view is itself visibility-filtered per member (§10 ActivityLog row, §32.8) — it means "every entry you're allowed to see," not literally every entry in the household.
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

**Longer-term:** natural-language financial queries (**built 2026-08-18 as the shared Ask feature** — see `docs/v2-checklist.md`) · investment holdings/lots + performance tracking · saved/advanced reports · unusual-spending detection · the actual Shohaz merge itself (§34). ~~Automatic recurring-bill detection~~ **built 2026-08-19** (statement upload, see the RecurringBill row above).

## 29. Success Metrics

- A household can fully represent its real accounts and a month of transactions within one onboarding session.
- Zero instances of transfers/credit-card payments inflating the reported spend total (correctness is binary, not a gradient).
- Every dashboard summary number is click-through-verifiable to its transactions.
- Both household members actively add/review transactions (shared usage, not single-user).

## 30. Technical Considerations

- **Stack:** Next.js, TypeScript, Supabase (Postgres, Auth, RLS); Storage deferred until attachments land in Phase 2. Identical to Shohaz's stack (§34) by design.
- **API conventions:** REST-shaped Next.js API routes under `/api/v1/...`, cursor-based pagination (default page size 50, max 100), and a `{ error: { code, message } }` JSON error shape — matching Shohaz's conventions exactly, so a merged API surface doesn't end up with two dialects.
- **Mutations** go through server actions/API routes where business logic matters (linked transfer-pair creation, rule application, CSV import processing, activity-log writes) rather than raw client table writes.
- **Balance computation:** resolved (§32) — store `current_balance` denormalized on `Account`, kept consistent via a Postgres trigger on every `transactions` insert/update/delete, source-of-truth being `starting_balance + Σ(transactions)`. Real-time, not scheduled.
- **Net worth history:** driven by `AccountBalanceSnapshot`, populated by a nightly scheduled job (e.g., `pg_cron` or a Supabase Edge Function) rather than snapshotting on every balance change. The same scheduled-job mechanism also runs the Trash auto-purge (§33), mirroring Shohaz's approach.
- **CSV import:** per-bank column-mapping templates saved for reuse; duplicate detection resolved (§32) — same account + exact amount + date ±2 days + normalized-description similarity ≥ 80%.

## 31. Supabase / Data Model Considerations

- RLS policy pattern: every household-scoped table policy checks `EXISTS (SELECT 1 FROM household_members WHERE household_id = <row>.household_id AND user_id = auth.uid())` — identical pattern to Shohaz. **`accounts`, `recurring_bills`, and everything that inherits visibility from them (transactions, balance snapshots, csv_import_batches, activity_log entries, §10) layer an additional privacy predicate on top of this base membership check, not instead of it** — membership is necessary but no longer sufficient. See Personal Finance Addendum, "Privacy model" for the full RLS SQL.
- Owner-only actions (invite, remove member, transfer ownership, delete household) get an additional RLS check on `household_members.role = 'owner'`, not just membership.
- **Single-owner invariant:** a partial unique index on `household_members` — `UNIQUE (household_id) WHERE role = 'owner'` — enforced at the database level, matching Shohaz's exact mechanism (§34).
- `linked_transaction_id` is a self-referencing FK on `Transaction`; both legs point to each other — deleting one must cascade-handle or block deletion of an orphaned counterpart.
- `Category.household_id` nullable pattern distinguishes system default categories (shared, read-only) from household-custom ones.
- `ActivityLog.changed_fields` stores only what changed, not full before/after snapshots — same convention as Shohaz.
- Trash lifecycle fields (`trashed_at`, `permanently_delete_after`) follow Shohaz's naming exactly, so a scheduled purge job can eventually run identically across both domains' tables.
- Single currency assumed for MVP (no currency field on Account/Transaction) — multi-currency is out of scope and would require a schema change, not an additive one, if added later; worth confirming this assumption explicitly (§32).

## 32. Open Questions — all resolved 2026-08-18 (item 8 added and resolved same day)

1. **Category rule retroactivity** — confirmed forward-only for MVP; revisit if user feedback shows this is a recurring pain point (would require either an async re-categorization job or an explicit "apply to existing transactions" action).
2. **Balance computation strategy — resolved: Postgres trigger, real-time.** `accounts.current_balance` recomputes on every `transactions` insert/update/delete (including linked transfer/payment pairs, which update both legs' accounts). Chosen over scheduled recompute specifically because Principle 4 ("explainable numbers") requires the number to always be accurate, not eventually-accurate — a household glancing at a balance right after logging a transaction shouldn't see a stale figure. Matches existing Shohaz precedent of using triggers for correctness-critical invariants (single-owner enforcement, container-cycle prevention, PRD §22).
3. **CSV duplicate-detection heuristic — resolved, concrete rule:** same `account_id` + exact amount + `occurred_at` within ±2 days + normalized-description similarity ≥ 80%. The ±2-day window covers the common pending→posted date drift banks introduce; description normalization means lowercase + stripped punctuation/whitespace before a similarity check (e.g. trigram or simple token-overlap — exact algorithm is an implementation detail, the threshold and inputs are the spec).
4. **Currency — resolved: no new decision needed.** Already an explicit MVP Non-Goal (§5) — multi-currency was never in scope, this "open question" was a sanity check on an already-made call, not a live fork. Confirmed acceptable; closing without change.
5. **Multi-household membership — resolved: no new decision needed.** Also already an explicit MVP Non-Goal (§5), matching Shohaz's own single-household-per-user model. Confirmed acceptable; closing without change.
6. **Category trash-with-references rule — resolved: block, require explicit reassignment.** Trashing a category still referenced by any non-trashed transaction is blocked with a reassignment prompt (pick a replacement category, or archive instead of trash) rather than silently force-archiving around the problem. Matches Principle 3 ("user control... never silently automated") — auto-archiving would defer the reassignment question instead of resolving it.
7. **Household deletion — resolved: same 30-day Trash mechanism as everything else, Owner-only, gated by typed confirmation.** Deliberately *not* inventing a special-case lifecycle for the sake of consistency with every other entity's delete behavior (PRD §33) — the difference in blast radius is handled by requiring the Owner to type the household's name to confirm, not by a different retention window. Worth resolving identically in Shohaz's own PRD, which has the same gap (Personal Finance Addendum, cross-referenced).
8. **Activity Feed visibility on private accounts — resolved: filtered the same as the account.** Raised while propagating the 2026-08-18 privacy-model reversal (§6, §10, §22): an `ActivityLog` entry referencing a private account/bill is only visible to whoever could already see that account (owner + explicit shares), computed via join at query time rather than a duplicated visibility column. Without this, the Activity Feed would leak the existence and activity of private accounts to the whole household through a side channel, defeating the point of the privacy model.

---

## 33. Data Lifecycle: Archive & Trash

Adopted directly from Shohaz's pattern (§34) and applied to Account, Transaction, Category, and RecurringBill.

- **Archive** (Account and Category only): soft, deliberate, indefinite. "I don't use this anymore, but keep the record." Excluded from default/current views, restorable any time, no retention limit. A "closed" account or a retired category is represented as archived, not a separate status.
- **Trash**: the outcome of any delete action, on any of the four entities above. Retained for **30 days**, restorable within that window, then automatically and permanently purged by a scheduled job (§30). Active records cannot be permanently deleted directly — **Delete Forever** is available only from within Trash, uses a dedicated danger treatment, and requires explicit confirmation, distinct from the routine trash-confirmation copy (§23).
- **Deleting an Account with transactions**: its transactions move to Trash *together* with it — never orphaned, never silently cascaded without the same recoverability guarantee.
- **Trashing a Category still referenced by transactions**: **resolved (§32.6)** — blocked, with a required reassignment prompt. Not force-archived, not silently allowed.
- **Linked transfer/payment pairs**: trashing one leg trashes its counterpart together, for the same reason deleting an account cascades its transactions — an orphaned linked leg is a correctness bug, not an edge case to tolerate.
- **`transaction_attachments`** (Receipt Scanning Addendum §6): not a fifth entity with its own Archive/Trash state — a retained receipt image cascades with its parent transaction exactly the way Shohaz's own item photos do ("a trashed record's photo is retained... only actually removed from storage at the moment of permanent purge," base PRD §14). Trashing a transaction doesn't touch its attachment's row; permanently purging the transaction purges the attachment's storage object in the same pass. `receipt_scan_batches`/`scanned_transaction_drafts` are review-stage, not user-facing records with their own lifecycle — confirmed or dismissed drafts are simply retained as an audit trail (matching the "audit trail from day one" convention already used for `activity_log`), not given Trash/Restore UI of their own.

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

**Updated 2026-08-17, post-repurposing (§34's "if this merges" framing is no longer hypothetical — see the Personal Finance Addendum and Household Hub Addendum):** two corrections made during the actual design pass, both verified against the built screens, not just reasoned about:
1. **Finance's mobile "More" is renamed "Manage"** below — Shohaz's own global nav (Home/Search/Scan/**More**) now sits one level above Finance as the domain switcher (Household Hub Addendum §6), so Finance's own catch-all tab needed a distinct name to avoid two nested "More"s.
2. **"Household Settings" is removed from the desktop sidebar list** — the Personal Finance Addendum resolved that Finance shares Shohaz's existing Settings screen entirely (household administration — invite/remove/roles — stays Owner-only there exactly as it already is in Shohaz; no Finance-specific settings surface exists or is needed. Note this is about the *administration* screen only, not financial-data access — see 2026-08-18's privacy-model reversal in §6/§10/§22 for the latter, which is not identical across roles); this line was written before that resolution and was never corrected until this pass.
3. **The mobile nav gets a camera FAB**, reversing `Personal Finance Design Alignment.md` §7's original "no FAB" call — that call was made before the Receipt Scanning Addendum existed, and was explicitly reasoned on "this app has no dominant, instant, photo-based capture flow." It now does (scan a receipt). See that document's §7 for the full reversal note.
4. **Dashboard is now two views, not one**, per the 2026-08-18 privacy-model reversal (§13): "My Dashboard" (default) and "Household Dashboard" (joint accounts only), reachable via a segmented toggle at the top of `/finance/dashboard`, not two separate routes — switching views is a client-side filter change, not a navigation. **Not yet designed in Figma** — flagged here rather than assumed; the already-built Dashboard, Account List, Account Detail, and Account Form screens on `v3` predate this reversal and still show the single fully-shared model. A follow-up design pass is needed before implementation reaches those screens (see Required screens note below).

### Navigation
- **Desktop:** persistent left sidebar — Dashboard, Accounts, Transactions, Categories, Recurring Bills, Net Worth, Activity, Trash. Top bar: search, user/account menu. No household switcher.
- **Mobile:** bottom tab bar — Dashboard, Transactions, Accounts, Manage (folds in Categories, Recurring Bills, Net Worth, Activity, Trash) — plus a raised camera FAB (receipt scan), centered, matching Shohaz's own capture-FAB pattern.

### Page hierarchy

**Updated 2026-08-18 — corrected against what was actually built, not left as the pre-repurposing draft:**

```
/finance/dashboard
/finance/accounts           → /finance/accounts/[id]  (balance history + filtered transactions)
/finance/transactions        (list; detail opens as a drawer, not a route)
/finance/categories          (manage categories + rules)
/finance/recurring           (upcoming bills, manage)
/finance/net-worth           (trend view)
/finance/activity            (household-wide audit feed)
/finance/trash                (recoverable deletions)

-- Receipt scanning (Receipt Scanning Addendum) — added here, was missing --
/finance/scan                 (camera capture)
/finance/scan/review          (single-receipt review)
/finance/scan/review-batch    (multi-receipt/statement bulk review)

-- NOT Finance-specific routes — shared with Shohaz's existing screens,
-- listed here only to make explicit they are not duplicated under /finance --
/settings/household   (members, roles, invite — Shohaz's existing screen, Finance Addendum §resolved)
/settings/account     (user profile — Shohaz's existing screen)
/login  /signup  /invite/[token]  (Shohaz's existing screens)
```

### Required screens
Dashboard · Accounts list · Account detail · Transactions list (+ add/edit form) · Categories & Rules management · Recurring Bills list/management · Net Worth trend · Activity Feed · Trash (+ Delete Forever) · Receipt Capture · Receipt Review (single + bulk) · CSV Import wizard (all 4 steps). Household Settings, Account Settings, Login/Signup, and Invite acceptance are explicitly **not** separate Finance screens — see the routing note above.

**Not yet designed, needed before implementation (flagged 2026-08-18, not yet raised with the user for prioritization):** Dashboard needs its My/Household toggle; Accounts list needs a Personal/Joint badge per row plus visual grouping; Account detail and Account form need an owner + "Share with…" control (multi-select of household members); Recurring Bills list needs the same Personal/Joint badge as Accounts. These are additive to already-built screens (add a control, don't restructure the layout), scoped smaller than the original 9-screen or 8-screen design passes.

### Dashboard layout
Net worth + cash-flow summary at top (leading, per §13); account balances, category breakdown, recent transactions, and upcoming recurring bills below, ordered by priority rather than an even grid. Every stat is a navigable link into its supporting transaction view.

### Desktop behavior
Sidebar persistent; content max-width constrained for readability; tables with sortable columns; filters as a toolbar above tables, not buried in a modal.

### Mobile behavior
Sidebar replaced by bottom tab bar; tables collapse to stacked cards; filters collapse into a bottom sheet.

### Major components
Stat/summary tile, Account card, Transaction table/row, Category badge, Balance-trend chart (line), Category-breakdown chart, Recurring-bill list item, Filter bar, CSV import wizard (multi-step: upload → map columns → review duplicates → confirm), Transaction form (drawer), Account form (drawer), Rule form (modal), Invite-member form (modal, Owner-only), Activity Feed row, Trash row (Restore / Delete Forever), Role badge (Owner/Member), Confirmation dialog (trash-level and permanent-delete-level, visually distinct), **Personal/Joint badge** (added 2026-08-18 — small inline indicator on Account/Recurring Bill rows and cards), **Share-with control** (added 2026-08-18 — multi-select of household members on the Account/Recurring Bill form, only shown when the item is marked Personal), **Dashboard view toggle** (added 2026-08-18 — segmented control, My Dashboard / Household Dashboard).

### Tables
Transactions table: date, account, merchant/description, category (badge, inline-editable), amount, status (pending/posted). Sortable by date and amount. Row click opens the transaction detail drawer.

### Charts
Net worth trend — line, over time. Cash flow — income vs. expense, per month. Category breakdown — ranked by spend (donut or horizontal bar). **Built 2026-08-19** (a Figma-audit pass found all three still missing — net worth trend had shipped as a bar-list, cash flow as a single-period number tile, category breakdown didn't exist at all): hand-rolled SVG/div components, no charting library added — see `docs/v2-checklist.md` §29 / `docs/bugs.md` #24. Category breakdown implemented as the horizontal-bar option, not a donut.

### Filters
Date range, account(s), category(ies), merchant search, amount range, transaction type — filter state reflected in the URL.

### Modals / drawers
Right-side drawer for transaction add/edit/detail (keeps table context visible behind it). Centered modal for confirmations, invite-member (Owner-only), and rule creation (short, single-purpose forms).

### Forms
Transaction (date, account, type, amount, category, merchant, notes), Account (name, type, institution, starting balance, **personal/joint toggle + share-with control when personal, added 2026-08-18**), Recurring bill (name, amount, frequency, next date, category/account, **same personal/joint toggle + share-with control**), CSV column-mapping (source column → date/amount/description/type).

### Empty / loading / error / confirmation states
Empty and loading per §26. Error states for CSV import surface inline at the row/field level during the mapping and review steps, not as a generic toast. Two distinct confirmation tiers per §33: trashing (recoverable-for-30-days framing) and permanent delete (reachable only from Trash, meaningfully more serious copy/treatment).

### Responsive behavior
Single-column stacking below ~768px; sidebar → bottom tab bar; tables → card list.

### Interaction patterns
Dashboard numbers navigate into a pre-filtered transaction view. Category can be reassigned inline from a transaction row via dropdown, without opening the full edit form. CSV import is a guided multi-step wizard, never a single silent bulk action. Owner-only actions (invite, remove member, transfer ownership) are visibly gated in the UI for Members, not just blocked server-side after the fact.
