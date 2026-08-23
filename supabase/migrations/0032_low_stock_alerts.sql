-- Low-stock alerts: an item can carry a minimum quantity, and a household
-- gets pushed once it drops to or below that threshold. Same generalized
-- push pipeline every other domain event uses (event_notification_log +
-- notification_preferences, docs/Platform Foundation Addendum.md §2) — see
-- src/app/api/v1/push/send-low-stock-alerts/route.ts for the send side.

alter table items add column min_quantity integer check (min_quantity is null or min_quantity >= 0);
comment on column items.min_quantity is
  'null (default) = not tracked, no low-stock alert ever fires. Set = alert once quantity drops to or below this.';

alter table items add column low_stock_since timestamptz;
comment on column items.low_stock_since is
  'Server-computed, not client-writable in practice (sync_item_location() below unconditionally recomputes it) — null when not currently low, set to when the item most recently *became* low otherwise. Doubles as event_notification_log''s occurrence_key (as an ISO string) for the low-stock push: a fresh timestamp here is a fresh "episode" of being low, so restocking above min_quantity and dropping low again re-alerts, the same way a recurring bill''s advancing next_due_date naturally gives each cycle its own occurrence_key.';

-- Extends sync_item_location() again — same "extend rather than edit
-- 0018/0021/0031 in place" reasoning those three already gave (all three
-- are applied to local and remote). Unlike 0031's is_shared normalization,
-- this one genuinely needs OLD (to tell "still low from before" apart
-- from "just became low"), which is why quantity/min_quantity are only
-- watched on UPDATE below, same as every other column already in this
-- trigger's "of" list — INSERT always runs the function regardless of
-- that list, and TG_OP guards the OLD reference for that case.
create or replace function sync_item_location()
returns trigger
language plpgsql
as $$
declare
  container_household uuid;
  container_location uuid;
  was_low boolean;
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

  if new.owner_person_id is null then
    new.is_shared := false;
  end if;

  -- Referencing OLD at all during an INSERT errors ("record \"old\" is not
  -- assigned yet") — it's not just null, it's unassigned — so TG_OP has to
  -- gate whether OLD.* is touched at all, not just live inside the same
  -- boolean expression as one (AND/OR short-circuiting isn't a documented
  -- guarantee to lean on here).
  was_low := false;
  if TG_OP = 'UPDATE' then
    was_low := OLD.min_quantity is not null and OLD.quantity <= OLD.min_quantity;
  end if;
  if new.min_quantity is not null and new.quantity <= new.min_quantity then
    new.low_stock_since := case when was_low then OLD.low_stock_since else now() end;
  else
    new.low_stock_since := null;
  end if;

  return new;
end;
$$;

drop trigger if exists items_sync_location on items;
create trigger items_sync_location
  before insert or update of container_id, location_id, household_id, owner_person_id, is_shared, quantity, min_quantity on items
  for each row execute function sync_item_location();
