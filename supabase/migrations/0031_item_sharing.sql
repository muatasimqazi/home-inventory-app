-- Personal-item privacy for the inventory domain: a household member's
-- own items become private-by-default instead of always fully visible to
-- the whole household, with one explicit per-item "share with household"
-- opt-in. Mirrors the Personal Finance Addendum's accounts privacy model
-- (0010_finance_schema.sql: owner_user_id + can_view_account()) as closely
-- as the shapes allow — items are owned by a Person (owner_person_id,
-- which can be a managed profile with no login), not directly by a user,
-- so the equivalent gate is can_view_item() below, and there is no
-- per-recipient grant table (finance_account_shares): sharing here is a
-- single household-wide toggle, not opt-in per named member.
--
-- owner_person_id is null = shared/household item (PRD §9's default) —
-- that case is completely unchanged, still visible to everyone. This
-- migration only changes what happens once owner_person_id is set: today
-- that's purely organizational (who does this belong to); after this
-- migration it also gates visibility, unless is_shared is set true.

alter table items add column is_shared boolean not null default false;

comment on column items.is_shared is
  'Only meaningful when owner_person_id is set. false (default) = private to the owner. true = owner opted to share this personal item with the whole household. Ignored for owner_person_id is null (household items are always visible regardless of this column) — sync_item_location() below normalizes it back to false in that case so the column never carries a misleading true for an item nobody restricted in the first place.';

-- Extends sync_item_location() again (same "extend rather than edit
-- 0018/0021 in place" reasoning those two migrations already gave — both
-- are applied to local and remote): adds the is_shared normalization
-- above, and adds is_shared to the trigger's watched-column list so
-- toggling sharing on an otherwise-unchanged item still re-runs it.
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

  if new.owner_person_id is null then
    new.is_shared := false;
  end if;

  return new;
end;
$$;

drop trigger if exists items_sync_location on items;
create trigger items_sync_location
  before insert or update of container_id, location_id, household_id, owner_person_id, is_shared on items
  for each row execute function sync_item_location();

-- ---------------------------------------------------------------------------
-- Visibility gate, same role as can_view_account() (0010_finance_schema.sql):
-- security definer + stable so it can read items/people regardless of the
-- caller's own row-level policy state, same pattern as is_household_member().
-- ---------------------------------------------------------------------------

create function can_view_item(target_item_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from items i
    where i.id = target_item_id
      and is_household_member(i.household_id)
      and (
        i.owner_person_id is null
        or i.is_shared
        or exists (
          select 1 from people p
          where p.id = i.owner_person_id and p.linked_user_id = auth.uid()
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- items: replace the single "read/write" policy with select/insert/update/
-- delete, matching accounts' split (0010_finance_schema.sql). Insert stays
-- plain household-membership — assigning a new item to any person in the
-- household (including one that isn't you) is an existing, intentional
-- capability (item-ownership picker lets anyone file an item under a
-- child's or roommate's profile), unchanged by this migration. Update and
-- delete are gated by the same visibility a member already has to have to
-- reach the row in the first place, so a personal item nobody has shared
-- with them is invisible *and* untouchable to every non-owner, but nothing
-- about editing an item you can already see gets more restrictive than it
-- was (still fully collaborative, same as locations/containers/tags).
-- ---------------------------------------------------------------------------

drop policy "household member read/write" on items;

create policy "item select" on items
  for select using (can_view_item(id));

create policy "item insert" on items
  for insert with check (is_household_member(household_id));

create policy "item update" on items
  for update using (can_view_item(id)) with check (is_household_member(household_id));

create policy "item delete" on items
  for delete using (can_view_item(id));

-- ---------------------------------------------------------------------------
-- Tables that key off item_id and previously scoped purely through
-- is_household_member(items.household_id) ("item_tags and favorites have
-- no household_id column of their own — scope through items", 0001_init.sql)
-- now scope through the item's actual visibility instead, so a private
-- item's tags/favorites/attachments don't stay reachable to a household
-- member who can no longer see the item itself.
-- ---------------------------------------------------------------------------

drop policy "household member read/write" on item_tags;
create policy "household member read/write, privacy-aware" on item_tags
  for all using (can_view_item(item_tags.item_id)) with check (can_view_item(item_tags.item_id));

drop policy "household member read/write" on favorites;
create policy "household member read/write, privacy-aware" on favorites
  for all using (can_view_item(favorites.item_id)) with check (can_view_item(favorites.item_id));

-- attachments has its own household_id (unlike item_tags/favorites) but is
-- always scoped to one item (item_id not null) — receipts, warranty docs,
-- serial numbers are exactly the kind of thing a private item's owner
-- would expect to stay private along with it.
drop policy "household member read/write" on attachments;
create policy "household member read/write, privacy-aware" on attachments
  for all using (can_view_item(attachments.item_id)) with check (can_view_item(attachments.item_id));
