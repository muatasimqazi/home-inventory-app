-- Credit card APR/interest-rate details via Plaid's Liabilities product
-- (user question: "for each credit card, is it possible to get its
-- interest rate from plaid" — yes, via /liabilities/get, which this app
-- never requested before now). Scoped to credit cards only — loans/
-- mortgages return a differently-shaped Liabilities response and are a
-- natural later extension, not this pass.
create table credit_card_liabilities (
  account_id uuid primary key references accounts(id) on delete cascade,
  -- [{apr_percentage, apr_type, balance_subject_to_apr, interest_charge_amount}]
  -- — Plaid returns multiple APR entries per card (purchase/cash/
  -- balance-transfer/promotional); always fetched and displayed together
  -- as one small unit, never independently queried/joined, so a JSON
  -- array here is simpler than a second child table.
  aprs jsonb not null default '[]',
  is_overdue boolean,
  last_payment_amount numeric(12,2),
  last_payment_date date,
  last_statement_issue_date date,
  last_statement_balance numeric(12,2),
  minimum_payment_amount numeric(12,2),
  next_payment_due_date date,
  last_synced_at timestamptz not null default now()
);

alter table credit_card_liabilities enable row level security;

-- No household_id column — visibility inherited via account_id, same
-- shape as transactions/account_balance_snapshots (0010_finance_schema.sql),
-- reusing that same can_view_account() security-definer function
-- verbatim rather than adding a new one. Writes only ever come from the
-- server's service-role admin client (Plaid sync), never the household
-- member directly, but "for all" costs nothing extra and matches the
-- precedent exactly.
create policy "household member read/write, privacy-aware" on credit_card_liabilities
  for all using (can_view_account(account_id)) with check (can_view_account(account_id));

-- No explicit grant needed — 0009's `alter default privileges` already
-- covers every new table automatically.

-- Realtime — deliberately included (unlike account_balance_snapshots,
-- which skips it): the "Connect for interest rate info" reconnect flow
-- needs this row to appear live right after a reconnect+sync, not wait
-- for the next full page hydration. Same guarded pattern every other
-- migration uses, safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'credit_card_liabilities'
  ) then
    execute 'alter publication supabase_realtime add table public.credit_card_liabilities';
  end if;
end $$;
