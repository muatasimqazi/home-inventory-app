-- Onboarding: a household chooses which domain(s) it actually wants —
-- Inventory, Finance, or both — instead of both always being on. Both
-- default true so every existing household (created before this
-- migration) keeps working exactly as it does today; only households
-- created after this migration, via household-setup's new domain-choice
-- step, ever set one of these to false.

alter table households add column finance_enabled boolean not null default true;
alter table households add column inventory_enabled boolean not null default true;
alter table households add constraint households_at_least_one_domain check (finance_enabled or inventory_enabled);

comment on column households.finance_enabled is 'Whether this household uses the Finance domain (accounts, transactions, bills). UI-level: does not restrict data access, RLS is unchanged — a household that later re-enables this sees its Finance data exactly as it left it.';
comment on column households.inventory_enabled is 'Whether this household uses the Inventory domain (items, locations, containers). Same UI-level-only note as finance_enabled.';

-- Extends create_household() again (0017_household_ledger_core.sql) —
-- same "extend rather than edit in place" reasoning as sync_item_location's
-- own history: this is already applied to both local and remote. New
-- params default true so any existing caller that doesn't pass them
-- (there shouldn't be one left after this ships, but RPCs are called by
-- name+position from the client, not statically checked) still gets
-- today's behavior.
--
-- Explicit drop of the old 4-arg signature first: unlike every prior
-- "extend rather than edit in place" case in this codebase's history
-- (sync_item_location, create_household's own owner_person_id addition),
-- this one adds *parameters*, not just body logic — `create or replace`
-- only replaces a function whose argument list matches exactly, so
-- without this drop the old 4-arg version stays around as a second
-- overload alongside the new 6-arg one. Confirmed live: a 3-arg call
-- (p_avatar_url omitted, relying on its own default) became ambiguous
-- between "old function, its 1 default filled in" and "new function, its
-- 3 defaults filled in" — Postgres can't pick, every such call started
-- erroring "function create_household(unknown, unknown, unknown) is not
-- unique" instead of running either one.
drop function if exists create_household(text, text, text, text);

create or replace function create_household(
  p_name text,
  p_display_name text,
  p_email text,
  p_avatar_url text default null,
  p_finance_enabled boolean default true,
  p_inventory_enabled boolean default true
)
returns households
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household households;
begin
  if not p_finance_enabled and not p_inventory_enabled then
    raise exception 'A household must have at least one domain enabled.';
  end if;

  insert into households (name, finance_enabled, inventory_enabled)
  values (p_name, p_finance_enabled, p_inventory_enabled)
  returning * into new_household;

  insert into members (household_id, user_id, role, display_name, email, avatar_url)
  values (new_household.id, auth.uid(), 'owner', p_display_name, p_email, p_avatar_url);
  insert into people (household_id, display_name, avatar_path, linked_user_id, created_by_user_id)
  values (new_household.id, p_display_name, p_avatar_url, auth.uid(), auth.uid());
  return new_household;
end;
$$;
