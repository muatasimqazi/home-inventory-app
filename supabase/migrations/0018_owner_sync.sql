-- Keeps items.owner_user_id and items.owner_person_id in lockstep during
-- the compatibility-shim period (0017_household_ledger_core.sql's note on
-- why owner_user_id isn't dropped yet).
--
-- The real risk this closes: 56 call sites across src/ still only write
-- owner_user_id (Implementation Plan §9 — Workstream 2 hasn't migrated
-- them yet). Without this, every item created through an unmigrated code
-- path would get owner_person_id = null forever, so anything already
-- reading owner_person_id (Workstream 2's own UI, once it lands) would
-- silently show wrong/missing ownership for items created anywhere else.
-- Same shape as sync_item_location() already deriving location_id from
-- container_id — one column is the source of truth per write, the other
-- is kept consistent automatically, extended here rather than edited in
-- place since 0017 is already applied to both local and remote.
create or replace function sync_item_location()
returns trigger
language plpgsql
as $$
declare
  container_household uuid;
  container_location uuid;
  resolved_person_id uuid;
  resolved_linked_user_id uuid;
begin
  if new.container_id is not null then
    select household_id, location_id into container_household, container_location
    from containers where id = new.container_id;
    if container_household is null then
      raise exception 'Container not found.';
    end if;
    if container_household <> new.household_id then
      raise exception 'Item''s container must belong to the same household as the item.';
    end if;
    new.location_id := container_location;
  elsif new.location_id is not null then
    if not exists (select 1 from locations where id = new.location_id and household_id = new.household_id) then
      raise exception 'Item''s location must belong to the same household as the item.';
    end if;
  end if;

  if new.owner_user_id is not null and not exists (
    select 1 from members where household_id = new.household_id and user_id = new.owner_user_id
  ) then
    raise exception 'Item owner must be a member of the item''s household.';
  end if;

  if new.owner_person_id is not null and not exists (
    select 1 from people where id = new.owner_person_id and household_id = new.household_id
  ) then
    raise exception 'Item owner must be a person in the item''s household.';
  end if;

  -- Owner sync: whichever column the caller set, derive the other.
  -- Explicitly clearing ownership (both null — a shared/household item)
  -- is left alone; there's nothing to derive from.
  if new.owner_user_id is not null and new.owner_person_id is null then
    select id into resolved_person_id from people
    where household_id = new.household_id and linked_user_id = new.owner_user_id;
    new.owner_person_id := resolved_person_id;
  elsif new.owner_person_id is not null and new.owner_user_id is null then
    select linked_user_id into resolved_linked_user_id from people
    where id = new.owner_person_id and household_id = new.household_id;
    new.owner_user_id := resolved_linked_user_id;
  elsif new.owner_user_id is not null and new.owner_person_id is not null then
    -- Both set explicitly (e.g. a future call site passing both at once) —
    -- require they actually name the same person rather than silently
    -- preferring one; a caller bug here should surface immediately, not
    -- drift the two columns apart.
    if not exists (
      select 1 from people
      where id = new.owner_person_id and household_id = new.household_id and linked_user_id = new.owner_user_id
    ) then
      raise exception 'owner_user_id and owner_person_id must refer to the same person.';
    end if;
  end if;

  return new;
end;
$$;

-- Trigger definition (column list, timing) is unchanged from
-- 0017_household_ledger_core.sql — only the function body changed —
-- so no drop/recreate of the trigger itself is needed here.
