-- Bank sync via Plaid (docs/Bank Sync Addendum.md) — reopens Finance PRD
-- §5/§28's explicitly-deferred "Bank sync (Plaid)" non-goal.

-- ---------------------------------------------------------------------------
-- plaid_items — one row per Plaid Item (one login at one institution).
-- access_token lives here, nowhere else. Security model (Addendum §4):
-- RLS enabled with ZERO policies for anon/authenticated — every row is
-- invisible to a signed-in user's own client regardless of household
-- membership. Only service_role (BYPASSRLS, see lib/supabase/admin.ts)
-- can read or write this table; the UI reads item metadata through
-- GET /api/v1/plaid/items, which independently checks household
-- membership before returning an access-token-stripped projection. This
-- is deliberately stricter than a narrow RLS policy + column-level
-- REVOKE — deny-all-by-default on the whole table is simpler to audit.
-- ---------------------------------------------------------------------------

create table plaid_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  plaid_item_id text not null unique,
  access_token text not null,
  institution_id text,
  institution_name text,
  cursor text, -- /transactions/sync cursor; null until the first sync
  status text not null default 'active' check (status in ('active', 'reauth_required', 'error')),
  error_code text,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  last_synced_at timestamptz
);

create index plaid_items_household_id_idx on plaid_items(household_id);

alter table plaid_items enable row level security;
-- No policies created — see the comment above. This is intentional, not
-- an oversight; do not add an "authenticated can read" policy here
-- without re-reading Addendum §4 first.

-- ---------------------------------------------------------------------------
-- accounts / transactions — nullable columns linking Shohaz's ledger to
-- Plaid. Both stay null for every non-Plaid account/transaction, so this
-- is purely additive to the existing finance schema (0010).
-- ---------------------------------------------------------------------------

alter table accounts
  add column plaid_item_id uuid references plaid_items(id) on delete set null,
  add column plaid_account_id text unique;

create index accounts_plaid_item_id_idx on accounts(plaid_item_id) where plaid_item_id is not null;

-- transactions.source gains 'plaid'; plaid_transaction_id is independent
-- of source (Addendum §3) — it's also set on an *adopted* manual/
-- csv_import/receipt_scan row when sync's duplicate check matches one,
-- so a plaid-sourced sync event has something to reconcile against
-- without ever creating a second row for the same real-world charge.
alter table transactions
  drop constraint if exists transactions_source_check;
alter table transactions
  add constraint transactions_source_check check (source in ('manual', 'csv_import', 'receipt_scan', 'plaid'));
alter table transactions
  add column plaid_transaction_id text unique,
  add column user_edited boolean not null default false; -- Addendum §7: once true, a Plaid `modified` sync refreshes amount/date/status only — category/merchant/description/notes are left alone

create index transactions_plaid_transaction_id_idx on transactions(plaid_transaction_id) where plaid_transaction_id is not null;

-- Cross-household reference validation for the new accounts.plaid_item_id
-- column, same style as validate_transaction_references() in 0010.
create function validate_account_plaid_item_household()
returns trigger
language plpgsql
as $$
declare
  item_household uuid;
begin
  if new.plaid_item_id is not null then
    select household_id into item_household from plaid_items where id = new.plaid_item_id;
    if item_household is null then
      raise exception 'Plaid item not found.';
    end if;
    if item_household <> new.household_id then
      raise exception 'Account''s Plaid item must belong to the same household as the account.';
    end if;
  end if;
  return new;
end;
$$;

create trigger accounts_validate_plaid_item
  before insert or update of plaid_item_id, household_id on accounts
  for each row execute function validate_account_plaid_item_household();

-- ---------------------------------------------------------------------------
-- Grants — same explicit pattern 0009 established. plaid_items gets the
-- standard table-level grant (required for the RLS-deny-all-policies
-- setup above to even be reachable at all by service_role, and harmless
-- for anon/authenticated since they have no policies to act on it with),
-- picked up automatically by 0009's `alter default privileges`. Nothing
-- else to grant here.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Realtime — deliberately NOT adding plaid_items to the supabase_realtime
-- publication. Supabase Realtime's postgres_changes still enforces RLS
-- before delivering a row to a subscribing client, and this table has
-- zero policies for authenticated/anon (§4 above) — publishing it would
-- be a no-op at best (every event silently dropped by RLS) and a
-- confusing one to debug. The linked-banks UI (GET /api/v1/plaid/items)
-- fetches on mount and refetches after Connect/Sync now/Disconnect
-- instead — accounts/transactions themselves are already realtime (0004),
-- so a synced account's balance and new transactions still update live;
-- only the plaid_items metadata list (institution name, status, last
-- synced) needs an explicit refetch.
-- ---------------------------------------------------------------------------
