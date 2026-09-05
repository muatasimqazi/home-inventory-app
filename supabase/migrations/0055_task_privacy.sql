-- Tasks get the same personal-or-shared toggle Notes already has
-- (0050_notes.sql) — mirrors that migration's owner_user_id/is_shared
-- columns and can_view_note()/RLS shape almost exactly, with one
-- deliberate reversal: a Note defaults personal (is_shared false) since
-- a private note is the common case, but a Task defaults SHARED
-- (is_shared true) — every task created before this migration was
-- visible to the whole household by definition (household_tasks' only
-- policy was a flat "household member read/write"), and most tasks going
-- forward are still going to be ordinary household chores/appointments
-- everyone should see. "Personal" is the new opt-in here, not the
-- default, unlike Notes.

alter table household_tasks add column owner_user_id uuid references auth.users(id) on delete cascade;
update household_tasks set owner_user_id = created_by_user_id where owner_user_id is null;
alter table household_tasks alter column owner_user_id set not null;

alter table household_tasks add column is_shared boolean not null default true;

create index household_tasks_owner_user_id_idx on household_tasks(owner_user_id);

-- Mirrors can_view_note() (0050_notes.sql) exactly, just against
-- household_tasks — security definer so it can read tasks from inside
-- tasks' own RLS policies without recursing.
create function can_view_task(target_task_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from household_tasks t
    where t.id = target_task_id
      and is_household_member(t.household_id)
      and (t.is_shared or t.owner_user_id = auth.uid())
  );
$$;

drop policy "household member read/write" on household_tasks;

-- Same split Notes uses: a shared task is viewable/editable by any
-- household member; a personal task's update/delete are implicitly
-- owner-only since can_view_task() already excludes everyone else.
create policy "select visible tasks" on household_tasks
  for select using (can_view_task(id));

create policy "insert own tasks" on household_tasks
  for insert with check (is_household_member(household_id) and owner_user_id = auth.uid());

create policy "update visible tasks" on household_tasks
  for update using (can_view_task(id)) with check (is_household_member(household_id));

create policy "delete visible tasks" on household_tasks
  for delete using (can_view_task(id));

-- task_subtasks (checklist items) and task_completions (completion log)
-- can each carry content that reveals what a personal task is actually
-- about (a subtask title, a completion note) — both had a flat
-- "household member read/write" policy from 0051/0053 that ignored the
-- parent task's own privacy entirely. Gate both on the same
-- can_view_task() check instead, so a personal task stays personal all
-- the way down.
drop policy "household member read/write" on task_subtasks;

create policy "select visible task subtasks" on task_subtasks
  for select using (can_view_task(task_id));
create policy "insert own task subtasks" on task_subtasks
  for insert with check (can_view_task(task_id));
create policy "update visible task subtasks" on task_subtasks
  for update using (can_view_task(task_id)) with check (can_view_task(task_id));
create policy "delete visible task subtasks" on task_subtasks
  for delete using (can_view_task(task_id));

drop policy "household member read/write" on task_completions;

create policy "select visible task completions" on task_completions
  for select using (can_view_task(task_id));
create policy "insert own task completions" on task_completions
  for insert with check (can_view_task(task_id));
create policy "update visible task completions" on task_completions
  for update using (can_view_task(task_id)) with check (can_view_task(task_id));
create policy "delete visible task completions" on task_completions
  for delete using (can_view_task(task_id));
