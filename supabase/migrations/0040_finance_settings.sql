-- Budgeting v2 — Zero-Based Budget Builder needs a monthly income figure
-- to allocate against. Nothing like that exists anywhere in the schema
-- (checked: no such field on households/accounts/members) — this is a
-- new, small, single-purpose settings table rather than a column on
-- households, because households' own RLS is owner-update-only
-- (0001_init.sql "household owner update"), which would be wrong here:
-- a shared planning target should be settable by any household member,
-- same as category_budgets already is.
create table finance_settings (
  household_id uuid primary key references households(id) on delete cascade,
  target_monthly_income numeric(12,2),
  updated_at timestamptz not null default now()
);

alter table finance_settings enable row level security;

-- Same single all-purpose policy shape category_budgets (0039) uses.
create policy "household member read/write" on finance_settings
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

-- No explicit grant needed — 0009's `alter default privileges` already
-- covers every new table automatically.

-- Realtime — same guarded pattern every other finance table's migration
-- already uses, safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'finance_settings'
  ) then
    execute 'alter publication supabase_realtime add table public.finance_settings';
  end if;
end $$;
