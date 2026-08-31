-- Notes domain: freeform household notes, each either personal (visible
-- only to its author) or shared (visible to the whole household). Mirrors
-- items' owner_person_id/is_shared binary toggle (0031_item_sharing.sql),
-- not finance's per-member share-table model — notes don't need to name
-- specific recipients, just a personal/shareable switch. Same Archive+
-- Trash lifecycle (status/trashed_at/permanently_delete_after) and
-- activity_log audit convention as every other domain, per
-- docs/Platform Foundation Addendum.md §1/§6.

create table notes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  is_shared boolean not null default false,
  pinned boolean not null default false,
  status text not null default 'active' check (status in ('active', 'trashed')),
  trashed_at timestamptz,
  permanently_delete_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_household_id_idx on notes(household_id);
create index notes_owner_user_id_idx on notes(owner_user_id);

-- Mirrors can_view_item() (0031_item_sharing.sql) — security definer so it
-- can read notes from inside notes' own RLS policies without recursing.
create function can_view_note(target_note_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from notes n
    where n.id = target_note_id
      and is_household_member(n.household_id)
      and (n.is_shared or n.owner_user_id = auth.uid())
  );
$$;

alter table notes enable row level security;

-- Select/update/delete all gate on the same visibility check: a shared
-- note is viewable *and* editable by any household member (the
-- household-shared-by-default convention every other domain follows); a
-- personal note is only ever visible to its own owner, so update/delete
-- are implicitly owner-only for those without a separate check.
create policy "select visible notes" on notes
  for select using (can_view_note(id));

create policy "insert own notes" on notes
  for insert with check (is_household_member(household_id) and owner_user_id = auth.uid());

create policy "update visible notes" on notes
  for update using (can_view_note(id)) with check (is_household_member(household_id));

create policy "delete visible notes" on notes
  for delete using (can_view_note(id));

-- Extend activity_log's entity_type check constraint. Forgetting this step
-- is a real, previously-hit failure mode (see 0020_activity_log_person.sql)
-- where every insert for the new entity type 400s silently.
alter table activity_log drop constraint if exists activity_log_entity_type_check;
alter table activity_log add constraint activity_log_entity_type_check
  check (entity_type in ('item', 'container', 'location', 'household', 'member', 'person', 'account', 'transaction', 'category', 'recurring_bill', 'note'));

-- Fold notes into the existing scheduled purge job (full body re-stated —
-- create or replace needs it — plus one new clause at the end).
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
end;
$$;
