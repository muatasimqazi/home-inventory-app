-- Household Tasks domain (docs/Household Hub Addendum.md §3-4, refined by
-- docs/Platform Foundation Addendum.md §2-4) — Shohaz's third domain:
-- recurring/one-off things a household needs to not forget, optionally
-- linked to an Item or a Person, optionally assigned to a Person.
--
-- One deliberate correction from the addendum's draft schema: assignment
-- targets people(id), not auth.users(id) — Items already established
-- owner_person_id specifically so ownership/assignment can point at a
-- managed profile with no login (a kid — the addendum's own example,
-- "Emma's dentist appointment"). assigned_to_user_id would have made that
-- impossible.
--
-- No household-level enable/disable toggle (households.*_enabled) — same
-- call as Notes (0050_notes.sql): an always-on utility, not an opt-in
-- vertical like Inventory/Finance.
--
-- linked_entity_type/linked_entity_id: the polymorphic-link convention
-- named in the Platform Foundation Addendum §3 — no DB FK (Postgres
-- doesn't do those cleanly across tables), validated at the app layer
-- (the picker UI only ever offers the household's own items/people) and
-- via RLS's own household_id check, same accepted tradeoff already
-- precedented by every other cross-entity reference in this app. Scoped
-- to 'item' | 'household_member' for v1 (the addendum's two named use
-- cases) — a plain text column, so a future value needs no migration.

create table household_tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null default 'other' check (category in ('maintenance', 'appointment', 'chore', 'other')),
  linked_entity_type text check (linked_entity_type in ('item', 'household_member')),
  linked_entity_id uuid,
  assigned_to_person_id uuid references people(id) on delete set null,
  schedule_type text not null check (schedule_type in ('one_time', 'recurring')),
  due_at timestamptz not null,
  -- Only meaningful when schedule_type = 'recurring'. {"freq":"days","interval":N}
  -- — deliberately not full RRULE, matching the addendum's explicit v1 scope.
  recurrence_rule jsonb,
  -- one_time: false once completed. recurring: stays true until trashed —
  -- a recurring task is never "done," only its current occurrence is.
  is_active boolean not null default true,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trashed_at timestamptz,
  permanently_delete_after timestamptz
);

create index household_tasks_household_id_idx on household_tasks(household_id);
create index household_tasks_assigned_to_person_id_idx on household_tasks(assigned_to_person_id) where assigned_to_person_id is not null;
-- The due/overdue list's own query shape (active, not trashed, ordered by due_at).
create index household_tasks_due_idx on household_tasks(household_id, due_at) where is_active and trashed_at is null;

alter table household_tasks enable row level security;

create policy "household member read/write" on household_tasks
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

-- A real completion log (unlike recurring_bills' "mark as paid," which is
-- pure in-place mutation with no history — bill_payments was aspirational
-- in the original Finance Addendum draft and was never built). Every
-- completion, one-time or recurring, gets a row here.
create table task_completions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  task_id uuid not null references household_tasks(id) on delete cascade,
  due_at timestamptz not null,
  completed_at timestamptz not null default now(),
  completed_by_user_id uuid not null references auth.users(id),
  notes text
);

create index task_completions_task_id_idx on task_completions(task_id);
create index task_completions_household_id_idx on task_completions(household_id);

alter table task_completions enable row level security;

create policy "household member read/write" on task_completions
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

-- Extend activity_log's entity_type check (see 0020_activity_log_person.sql /
-- 0050_notes.sql precedent — forgetting this migration silently 400s every
-- insert for the new entity type).
alter table activity_log drop constraint if exists activity_log_entity_type_check;
alter table activity_log add constraint activity_log_entity_type_check
  check (entity_type in ('item', 'container', 'location', 'household', 'member', 'person', 'account', 'transaction', 'category', 'recurring_bill', 'note', 'household_task'));

-- 'completed' is a real, distinct, useful signal in the Activity feed —
-- unlike recurring_bills' unfinished "mark as paid" (which just logs a
-- generic 'edited'), task completion gets its own action.
alter table activity_log drop constraint if exists activity_log_action_check;
alter table activity_log add constraint activity_log_action_check
  check (action in (
    'created', 'edited', 'moved', 'archived', 'trashed', 'restored',
    'deleted_forever', 'invited', 'joined', 'removed', 'left', 'ownership_transferred',
    'completed'
  ));

-- Fold household_tasks into the existing purge job (full body re-stated —
-- create or replace needs it — plus one new clause at the end, same
-- pattern 0050_notes.sql already used to add its own clause).
create or replace function purge_expired_trash()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i integer;
begin
  delete from items
  where status = 'trashed'
    and permanently_delete_after is not null
    and permanently_delete_after <= now();

  for i in 1..10 loop
    delete from containers c
    where c.status = 'trashed'
      and c.permanently_delete_after is not null
      and c.permanently_delete_after <= now()
      and not exists (select 1 from containers child where child.parent_container_id = c.id);
    exit when not found;
  end loop;

  delete from locations l
  where l.status = 'trashed'
    and l.permanently_delete_after is not null
    and l.permanently_delete_after <= now()
    and not exists (select 1 from containers c where c.location_id = l.id);

  delete from notes
  where status = 'trashed'
    and permanently_delete_after is not null
    and permanently_delete_after <= now();

  delete from household_tasks
  where trashed_at is not null
    and permanently_delete_after is not null
    and permanently_delete_after <= now();
end;
$$;
