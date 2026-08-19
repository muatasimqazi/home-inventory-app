# Shohaz — Bank Sync (Plaid) Addendum

Companion to the [Personal Finance PRD](Personal%20Finance%20PRD.md), [Personal Finance Addendum](Personal%20Finance%20Addendum.md), and [Receipt Scanning Addendum](Receipt%20Scanning%20Addendum.md). This document scopes Plaid-based bank account linking and transaction sync.

**This deliberately reopens an explicit non-goal.** Finance PRD §5/§28 lists "Bank sync (Plaid)" as out of MVP, with the stated reason: "it introduces cost, compliance surface, and a hard external dependency that shouldn't gate validating the core ledger model" (§20). That reasoning was sound for getting the ledger model validated first — it's now validated (shipped, in daily use), and the deferred feature is being built deliberately, not snuck in. Same pattern as the Receipt Scanning Addendum reopening its own deferred scope: name it plainly, don't build past it quietly.

## 1. Scope, decided 2026-08-19

- **Balances + transactions**, not balances-only. A linked account's balance stays live via Plaid, and Plaid-sourced transactions land in the ledger automatically.
- **Coexists with manual entry, CSV import, and receipt scanning** — does not replace them for a linked account. A household can still manually log a cash-adjacent transaction or scan a receipt for an account Plaid also syncs; the two paths reconcile via the duplicate-detection mechanism in §5, not by disabling one path once the other is active. This was an explicit choice against "full replace" (disable manual entry once an account is Plaid-linked) — Plaid transaction data can arrive late or be re-categorized poorly by the bank's own feed, and a household member correcting/adding an entry by hand before Plaid catches up shouldn't be blocked.
- **Sandbox-first.** Development starts against Plaid's Sandbox environment (fake institutions, instant, free, no compliance exposure) using the household's own Plaid developer credentials. Production/real-bank linking is a separate, later cutover — swapping `PLAID_ENV`/`PLAID_CLIENT_ID`/`PLAID_SECRET` and going through Plaid's own production-access approval, not a code change.

## 2. What this reuses

- **`findDuplicateTransaction()` / `descriptionSimilarity()`** (`lib/csv-import-resolution.ts`, Finance PRD §32.3) — the exact same "same account + exact amount + occurred_at ±2 days + normalized-description similarity ≥ 80%" rule CSV import already established, reused verbatim for Plaid-vs-existing-ledger reconciliation (§5). One duplicate-detection story across every import path, not three different heuristics.
- **`getSupabaseAdminClient()`** (`lib/supabase/admin.ts`) — every Plaid-touching route (link-token creation, token exchange, sync, webhook) runs on the service-role client, same trust boundary already established for the Resend inbound-email webhook.
- **The webhook route shape** (`api/v1/webhooks/resend-inbound/route.ts`) — signature verification against the raw body, `runtime = "nodejs"`, 200-and-log rather than 500-and-retry-loop for "not retryable" cases, 500 only for our own failures. Plaid's webhook route follows the same shape with Plaid's own JWT-based verification in place of Svix.
- **The Trash lifecycle** — a Plaid `removed` transaction event soft-trashes the matching row (`trashed_at`/`permanently_delete_after`, PRD §14) rather than hard-deleting it, identical to every other transaction removal path in the app.
- **`category_rules`/`resolveCategory()`** — a Plaid transaction's merchant is run through the same rule-resolution the manual form and receipt scanning already use, so a rule taught via "Always categorize 'Figma' as Technology" (the auto-learning feature shipped earlier today) applies to Plaid-sourced transactions too, not just manually-entered ones.

## 3. Data model additions

```sql
-- One row per Plaid Item (= one login at one institution, may cover
-- multiple accounts). access_token lives here, nowhere else, and is never
-- exposed to the client — see §4.
plaid_items (
  id, household_id,
  plaid_item_id,        -- Plaid's own item_id, unique
  access_token,          -- server-only, see §4
  institution_id, institution_name,
  cursor,                 -- /transactions/sync cursor, null until first sync
  status,                 -- 'active' | 'reauth_required' | 'error'
  error_code,             -- Plaid's error code when status = 'error'/'reauth_required'
  created_by_user_id, created_at, last_synced_at
)

-- accounts gains two nullable columns:
accounts.plaid_item_id     uuid references plaid_items(id) on delete set null
accounts.plaid_account_id  text unique  -- Plaid's per-account id within the item

-- transactions gains one nullable column, independent of `source`:
transactions.plaid_transaction_id  text unique
-- Set at insert time for a genuinely new Plaid-sourced transaction
-- (source = 'plaid'), OR "adopted" onto an existing manual/csv_import/
-- receipt_scan row when §5's duplicate check matches one — the original
-- source is preserved (a receipt-scanned transaction stays receipt_scan),
-- the column just gives future Plaid sync events (modified/removed,
-- pending->posted) something to reconcile against without creating a
-- second row.
```

`source` gains a fourth value: `'plaid'`.

## 4. Security model — access_token never reaches the client

`plaid_items` is RLS-enabled with **zero policies** for `anon`/`authenticated` — not "narrow" policies, none at all, so every row is invisible to a signed-in user's own client regardless of household membership. Only `service_role` (which has `BYPASSRLS`, per `lib/supabase/admin.ts`) can read or write this table, which means every read of Plaid item metadata (institution name, status, last synced) for the UI goes through a dedicated API route (`GET /api/v1/plaid/items`) that independently verifies the caller's household membership from their session before returning an admin-fetched, access-token-stripped projection. There is no code path — direct table access, a view, a broader RLS policy — where `access_token` is reachable from the browser. This is a stricter version of the column-level-privilege approach; deny-all-by-default on the whole table is simpler to audit than "which columns did we remember to revoke."

## 5. Link flow

1. Client calls `POST /api/v1/plaid/link-token` (authenticated) → server creates a Plaid Link token scoped to the household, `products: ["transactions"]`.
2. Client launches Plaid Link (`react-plaid-link`'s `usePlaidLink`) with that token.
3. On success, Link returns a `public_token` + metadata (institution, accounts). Client POSTs it to `POST /api/v1/plaid/exchange-public-token`.
4. Server exchanges `public_token` → `access_token` + `item_id` (Plaid `/item/public_token/exchange`), inserts the `plaid_items` row, fetches the linked accounts (`/accounts/get`), and creates/matches a Shohaz `accounts` row per Plaid account — mapped by type (`depository`/`checking` → `checking`, `depository`/`savings` → `savings`, `credit` → `credit_card`, `loan`/`mortgage` → `mortgage`, `loan`/other → `loan`, `investment` → `investment`; `cash` has no Plaid equivalent and is never Plaid-linked). `card_last_four` is populated from Plaid's account `mask` where present — the same field Receipt Scanning Addendum §6 already uses for receipt→account matching, so a Plaid-linked account also benefits from that matching for free.
5. Server runs an initial `/transactions/sync` pass (§6) synchronously before responding, so the household sees transactions immediately rather than waiting on the first webhook.

## 6. Ongoing sync

`/transactions/sync` (Plaid's cursor-based endpoint) is the single sync function every trigger below calls — never `/transactions/get`, which is the older, non-cursor, re-fetch-everything API.

- **Plaid webhook** (`POST /api/v1/webhooks/plaid`, JWT-verified per Plaid's docs) — `SYNC_UPDATES_AVAILABLE` (and legacy `TRANSACTIONS`/`DEFAULT_UPDATE`) triggers an immediate sync for that item. `ITEM_LOGIN_REQUIRED` flips the item's `status` to `reauth_required` (surfaced in the UI, §7) rather than silently failing sync forever.
- **Manual "Sync now"** — a button in the linked-accounts UI calling `POST /api/v1/plaid/sync` for one item, for a household member who doesn't want to wait.
- **Nightly cron fallback** — a Vercel Cron entry (`vercel.json`, protected by `CRON_SECRET`) hitting `POST /api/v1/plaid/sync-all` once a day, syncing every `active` item. Pure safety net for a missed/failed webhook, same "never solely rely on the push path" instinct as the app's existing pg_cron trash-purge job, just implemented at the app layer since this needs outbound HTTPS calls Postgres alone can't make.

**Per-transaction handling of a sync batch's `added`/`modified`/`removed`:**
- `added`: if `pending_transaction_id` is set, look for an existing row with `plaid_transaction_id = pending_transaction_id` and update it in place (carries over anything the household already set — category, notes, exclude-from-reports — on the pending version rather than losing it to a fresh insert). Otherwise, run the candidate through `findDuplicateTransaction()` against the account's existing transactions: a match gets *adopted* (`plaid_transaction_id` set on the existing row, no new row created, original `source` untouched); no match creates a new `source: 'plaid'` row.
- `modified`: upsert by `plaid_transaction_id` (amount/date/merchant refresh; category/notes are never overwritten once a household member has touched them — see §7).
- `removed`: soft-trash the matching row, same Trash lifecycle as every other removal path.

## 7. What Plaid never overwrites once a human has touched it

Matches Finance PRD's forward-only, user-correctable posture for `category_rules` (§16) and recurring-bill detection: once a household member edits a Plaid-sourced transaction's category, merchant, description, or notes, a `modified` sync event refreshes amount/date/status but leaves those fields alone. A lightweight `user_edited` marker (set on first manual edit) is the switch — not a separate approval queue, since Plaid transactions post directly to the ledger (they're bank-confirmed money movements, not AI guesses needing review like a scanned receipt).

## 8. Item health surfaced in the UI

The Accounts page gains a "Linked banks" section: institution name, status (`active` / needs reauthentication / error), last synced time, "Sync now," and "Disconnect" (calls Plaid `/item/remove`, then deletes the `plaid_items` row — linked `accounts` rows are kept, `plaid_item_id`/`plaid_account_id` cleared, so transaction history isn't lost, they just stop syncing). `reauth_required` surfaces a "Reconnect" action that re-launches Plaid Link in update mode for that item.
