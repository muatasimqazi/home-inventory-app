-- Budgeting v1 (user request: "a budgeting feature like [mockup]" — scoped
-- down to core budget-vs-actual per the user's own explicit answer: no
-- AI recommendations, no zero-based allocation, per-category only, no
-- separate overall total). No budgeting concept existed anywhere in this
-- schema before this.
create table category_budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  monthly_amount numeric(12,2) not null check (monthly_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, category_id)
);

create index category_budgets_household_id_idx on category_budgets(household_id);

alter table category_budgets enable row level security;

-- Household-wide, no owner/privacy split, no system-default-row concept
-- (unlike categories itself, every budget row belongs to a real
-- household) — same single all-purpose policy shape category_rules
-- already uses (0010_finance_schema.sql), the closest existing precedent.
create policy "household member read/write" on category_budgets
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

-- No explicit grant needed — 0009's `alter default privileges` already
-- covers every new table automatically, same as every other migration
-- since (e.g. 0035_item_document_links.sql).

-- Realtime — same guarded pattern every other finance table's migration
-- already uses (0010/0024/etc.), safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'category_budgets'
  ) then
    execute 'alter publication supabase_realtime add table public.category_budgets';
  end if;
end $$;
