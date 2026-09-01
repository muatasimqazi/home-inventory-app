-- Two additions to Household Tasks (0051_household_tasks.sql):
--
-- 1. task_categories — replaces the fixed 5-value CHECK-constrained
-- category column (which needed a migration every time a household
-- wanted a new one, e.g. 0052's "grocery") with real per-household data,
-- mirroring Finance's categories table (0010_finance_schema.sql) exactly:
-- household_id null = system default (shared, read-only via RLS), set =
-- a household's own custom category. Same 4-policy split for the same
-- reason (a default has no owning household to check membership against
-- for insert/update/delete, only select).
--
-- 2. task_subtasks — a real checklist inside one task ("grocery shopping"
-- -> milk, eggs, bread), the "checklist" half of the original ask that
-- wasn't built the first time (that pass interpreted "checklist" as just
-- "tasks you check off," not a nested list per task). No Archive+Trash
-- lifecycle — same "lightweight, just delete" precedent as favorites/
-- finance_bill_shares, not every table needs the full 30-day recovery
-- window.

create table task_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade, -- null = system default, shared/read-only
  name text not null,
  is_default boolean not null default false,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index task_categories_household_id_idx on task_categories(household_id);

alter table task_categories enable row level security;

create policy "task category read" on task_categories
  for select using (household_id is null or is_household_member(household_id));
create policy "task category insert" on task_categories
  for insert with check (household_id is not null and is_household_member(household_id));
create policy "task category update" on task_categories
  for update using (household_id is not null and is_household_member(household_id))
  with check (household_id is not null and is_household_member(household_id));
create policy "task category delete" on task_categories
  for delete using (household_id is not null and is_household_member(household_id));

-- Seed the same 5 defaults 0051/0052 hardcoded, now as real (shared,
-- undeletable-by-households) rows instead of a CHECK constraint.
insert into task_categories (name, is_default) values
  ('Maintenance', true),
  ('Appointment', true),
  ('Chore', true),
  ('Grocery', true),
  ('Other', true);

-- Migrate household_tasks off the old text+CHECK column onto a real FK.
-- No RESTRICT override on the FK — Postgres's default NO ACTION blocks
-- deleting a category still assigned to a task, which is the right
-- default here (the app surfaces that as a normal persistOrRevert error
-- toast, no special-casing needed).
alter table household_tasks add column category_id uuid references task_categories(id);

update household_tasks t
set category_id = c.id
from task_categories c
where c.is_default and lower(c.name) = t.category;

-- Anything that somehow didn't match (shouldn't happen — category was a
-- CHECK-constrained enum of exactly these 5 values) falls back to Other,
-- so the NOT NULL below can never fail.
update household_tasks t
set category_id = (select id from task_categories where is_default and name = 'Other')
where t.category_id is null;

alter table household_tasks alter column category_id set not null;
alter table household_tasks drop column category;

create table task_subtasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  task_id uuid not null references household_tasks(id) on delete cascade,
  title text not null,
  is_completed boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index task_subtasks_task_id_idx on task_subtasks(task_id);

alter table task_subtasks enable row level security;

create policy "household member read/write" on task_subtasks
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));
