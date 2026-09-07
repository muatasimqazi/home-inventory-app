-- Free-tier resource caps (docs/Free Tier Limits Addendum.md). Real,
-- database-level enforcement rather than just a client-side check —
-- location/item creation is written directly from the browser to
-- Supabase (lib/store.ts's createLocation()/createItem()/
-- createItemsBatch()), same as every other domain in this app, so RLS
-- and triggers are the actual gate here, same as everywhere else; the
-- client-side pre-check in lib/store.ts is just so a Free household
-- finds out before wasting a paid studio-photo generation on an item
-- that's about to be rejected, not what actually stops it.
--
-- Limits themselves (3 locations / 100 items / 10 AI photo generations a
-- month) live in src/lib/billing.ts as the single source of truth for
-- app-facing copy; the literals below are duplicated here because SQL
-- can't import that module — keep the two in sync by hand if they ever
-- change.

create function enforce_household_resource_limit()
returns trigger
language plpgsql
as $$
declare
  v_tier text;
  v_count int;
  v_limit int;
  v_kind text;
begin
  select subscription_tier into v_tier from households where id = new.household_id;

  -- Paid tiers: unlimited. A missing household row (shouldn't happen,
  -- foreign key already requires it) fails open to "unlimited" rather
  -- than blocking the insert on an unrelated data problem.
  if v_tier is not null and v_tier <> 'free' then
    return new;
  end if;

  if tg_table_name = 'locations' then
    v_kind := 'location';
    v_limit := 3;
    select count(*) into v_count from locations where household_id = new.household_id and status = 'active';
  elsif tg_table_name = 'items' then
    v_kind := 'item';
    v_limit := 100;
    -- Trashed items are pending permanent deletion and don't count
    -- against the cap (matches the count client-side pre-check in
    -- lib/store.ts uses); archived items still exist, so they do count.
    select count(*) into v_count from items where household_id = new.household_id and status <> 'trashed';
  else
    return new;
  end if;

  if v_count >= v_limit then
    raise exception 'Free plan includes up to % %s per household. Upgrade to Plus to add more.', v_limit, v_kind
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger locations_free_tier_limit
  before insert on locations
  for each row execute function enforce_household_resource_limit();

create trigger items_free_tier_limit
  before insert on items
  for each row execute function enforce_household_resource_limit();

-- AI studio-image generation quota (generate-studio-photo,
-- generate-location-photo, remove-background all make a real, billed
-- model call per docs/Rate Limiting Addendum.md) — separate from that
-- addendum's per-user abuse throttle, this is a per-household, per-plan
-- billing cap. Tracked as a running counter + period start directly on
-- households, reset lazily (on the first call of a new calendar month)
-- rather than a cron job, same "no scheduled job needed" reasoning as
-- the rest of this app's usage counters.
alter table households add column studio_generation_count int not null default 0;
alter table households add column studio_generation_period_start timestamptz not null default now();

comment on column households.studio_generation_count is 'AI studio-image generations used so far in the current calendar month (Free plan only — paid tiers are unlimited and never increment this).';
comment on column households.studio_generation_period_start is 'Start of the calendar month studio_generation_count is counting; try_increment_studio_generation_usage() resets both once this falls behind the current month.';

-- security definer: any household member can trigger a generation (not
-- just the owner), but households' own RLS only grants UPDATE to the
-- owner (see 0001_init.sql's "household owner update" policy) — this
-- needs to bump the shared counter regardless of who's calling, same
-- "elevated privileges, explicit invariant check instead" reasoning as
-- create_household()/transfer_ownership() above. Atomic: the whole
-- read-reset-or-check-then-increment sequence runs as one statement
-- (one rpc() round trip), so two concurrent calls can't both read the
-- same pre-increment count and both pass.
create function try_increment_studio_generation_usage(p_household_id uuid, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_start timestamptz;
  v_count int;
begin
  if not is_household_member(p_household_id) then
    raise exception 'Not a member of this household.';
  end if;

  select studio_generation_period_start, studio_generation_count
    into v_period_start, v_count
    from households
    where id = p_household_id
    for update;

  if v_period_start < date_trunc('month', now()) then
    update households
      set studio_generation_count = 1,
          studio_generation_period_start = date_trunc('month', now())
      where id = p_household_id;
    return true;
  end if;

  if v_count >= p_limit then
    return false;
  end if;

  update households set studio_generation_count = studio_generation_count + 1 where id = p_household_id;
  return true;
end;
$$;
