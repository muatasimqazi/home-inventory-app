-- AI recurring-bill detection (Workstream 4 of the multi-batch feature
-- set) — /api/v1/finance/detect-recurring scans a household's own
-- transaction history for merchant+account groups that repeat on a
-- regular cadence with a consistent amount (lib/recurring-transaction-
-- detection.ts, a deterministic heuristic reusing lib/recurring-
-- detection.ts's existing statement-import matching logic — see that
-- file's comments for why no model call is involved). Detected patterns
-- are always presented for review, never auto-created as a real
-- recurring_bills row (assisted-with-confirmation, same posture as
-- receipt scanning and item-purchase matching elsewhere in this app).
--
-- This table is the small piece of state that posture needs: once a
-- household member dismisses a detected candidate ("not actually
-- recurring"), it has to stay dismissed on every later detection run
-- instead of reappearing — otherwise "assisted with confirmation" would
-- degrade into "assisted with re-litigation" every time the review screen
-- loads. One row per dismissed (account, merchant-key) pair; re-created
-- automatically if the same merchant starts a genuinely new pattern after
-- a long gap, since candidate_key is derived fresh each detection run,
-- not tied to specific transaction ids.
create table recurring_candidate_dismissals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  -- Same normalized-merchant key lib/recurring-detection.ts's
  -- normalizeMerchant() produces (e.g. "netflix com" -> "netflix com"),
  -- scoped per account so dismissing a Netflix pattern on one card
  -- doesn't silently suppress a different Netflix charge on another.
  candidate_key text not null,
  dismissed_by_user_id uuid not null references auth.users(id),
  dismissed_at timestamptz not null default now(),
  unique (account_id, candidate_key)
);

create index recurring_candidate_dismissals_household_id_idx on recurring_candidate_dismissals(household_id);
create index recurring_candidate_dismissals_account_id_idx on recurring_candidate_dismissals(account_id);

-- Cross-household reference validation, same style as
-- validate_transaction_category_household() (0024_transaction_categories.sql).
create function validate_recurring_dismissal_household()
returns trigger
language plpgsql
as $$
declare
  acct_household uuid;
begin
  select household_id into acct_household from accounts where id = new.account_id;
  if acct_household is null then
    raise exception 'Account not found.';
  end if;
  if acct_household <> new.household_id then
    raise exception 'recurring_candidate_dismissals.account_id must belong to the same household as the link.';
  end if;
  return new;
end;
$$;

create trigger recurring_candidate_dismissals_validate_household
  before insert or update of account_id, household_id on recurring_candidate_dismissals
  for each row execute function validate_recurring_dismissal_household();

-- ---------------------------------------------------------------------------
-- Row Level Security — same privacy model as transactions/account_balance_
-- snapshots (0010_finance_schema.sql): visibility inherited via the
-- account's own can_view_account(), so a dismissal on a private account's
-- detected pattern is only visible to those who can see that account.
-- ---------------------------------------------------------------------------

alter table recurring_candidate_dismissals enable row level security;

create policy "household member read/write, privacy-aware" on recurring_candidate_dismissals
  for all using (can_view_account(account_id))
  with check (can_view_account(account_id));

-- ---------------------------------------------------------------------------
-- Realtime — same opt-in mechanism as 0004_realtime_publication.sql.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recurring_candidate_dismissals'
  ) then
    execute 'alter publication supabase_realtime add table public.recurring_candidate_dismissals';
  end if;
end $$;
