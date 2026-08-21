-- Drops the items.owner_user_id compatibility shim (0017_household_ledger_core.sql,
-- kept in sync by 0018_owner_sync.sql) now that it's actually safe to.
--
-- Household Ledger Implementation Plan §9's "53 remaining references"
-- re-grepped and classified one by one before this migration was written:
-- the overwhelming majority were never part of this shim at all — they're
-- `accounts.owner_user_id` / `recurring_bills.owner_user_id`, an unrelated,
-- permanent column with the same name (Personal Finance Addendum's
-- joint-vs-personal privacy model) that this migration does not touch.
-- Of the genuinely items-related references, every remaining one was
-- either the shim's own necessary plumbing (the ItemRow mapper, the
-- NewItemInput/Item type fields, this trigger) or a write site that
-- already sets owner_person_id as the source of truth — none were a
-- stale call site still reading owner_user_id for real display/logic.
-- Verified directly against data before writing this: zero items with
-- owner_user_id set and owner_person_id null, and zero items whose
-- owner_person_id disagrees with owner_user_id.
--
-- Extends sync_item_location() again (owner_user_id validation/derivation
-- removed, owner_person_id validation kept) rather than editing
-- 0018_owner_sync.sql in place, same reasoning 0018 itself gave for not
-- editing 0017 in place — both are already applied to local and remote.
create or replace function sync_item_location()
returns trigger
language plpgsql
as $$
declare
  container_household uuid;
  container_location uuid;
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

  if new.owner_person_id is not null and not exists (
    select 1 from people where id = new.owner_person_id and household_id = new.household_id
  ) then
    raise exception 'Item owner must be a person in the item''s household.';
  end if;

  return new;
end;
$$;

drop trigger if exists items_sync_location on items;
create trigger items_sync_location
  before insert or update of container_id, location_id, household_id, owner_person_id on items
  for each row execute function sync_item_location();

-- Cascades to items_owner_user_id_idx automatically — no separate drop index needed.
alter table items drop column if exists owner_user_id;
