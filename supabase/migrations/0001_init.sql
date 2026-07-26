-- Shohaz v2 schema — mirrors src/lib/types.ts and the updated PRD (§22-24).
--
-- SCAFFOLDING ONLY: this migration has not been applied to any Supabase
-- project. The app still runs entirely on the in-memory mock store
-- (src/lib/store.ts). Review and apply with `supabase db push` (or the
-- Supabase dashboard SQL editor) when the real backend work begins.
--
-- This is the first migration for Shohaz — there is no prior schema to
-- diff against — so it defines the whole v2 data model in one file rather
-- than a v1 baseline plus deltas.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Households & membership
-- ---------------------------------------------------------------------------

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  display_name text not null,
  email text not null,
  avatar_url text,
  primary key (household_id, user_id)
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  invited_email text not null,
  invited_by_user_id uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Exactly one Owner per household, enforced as a database-level invariant
-- (PRD §13/§22) — not just an application convention. transfer_ownership()
-- below is the only sanctioned way to move ownership: it flips both roles
-- in a single UPDATE, so this index is never transiently violated by two
-- separate statements racing or being applied out of order.
create unique index members_one_owner_per_household_idx on members(household_id) where role = 'owner';

-- Membership check used by every RLS policy below. security definer so it
-- can read `members` even under a caller whose own row-level policy hasn't
-- matched yet.
create function is_household_member(target_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from members
    where household_id = target_household_id
      and user_id = auth.uid()
  );
$$;

-- Same pattern, but requires the caller's own membership row to have
-- role = 'owner'. Gates owner-only writes (member removal, invites,
-- household admin) at the database layer — the Household Members screen
-- already hides these actions behind an isOwner check client-side, but
-- that alone doesn't stop a direct API/RLS call from a regular member.
create function is_household_owner(target_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from members
    where household_id = target_household_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Privileged RPCs (security definer) — the only sanctioned way to create a
-- household/membership row or move ownership. households and members have
-- no client-facing INSERT policy below (see RLS section): every row is
-- created through one of these, which run with elevated privileges and
-- enforce their own invariants explicitly, rather than trying to make RLS
-- solve "how do you prove membership before your first membership row
-- exists."
-- ---------------------------------------------------------------------------

create function create_household(p_name text, p_display_name text, p_email text, p_avatar_url text default null)
returns households
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household households;
begin
  insert into households (name) values (p_name) returning * into new_household;
  insert into members (household_id, user_id, role, display_name, email, avatar_url)
  values (new_household.id, auth.uid(), 'owner', p_display_name, p_email, p_avatar_url);
  return new_household;
end;
$$;

-- PRD §13: "an Owner-only action; enforced as a database-level invariant."
-- Flips both roles in one UPDATE (via CASE) so members_one_owner_per_household_idx
-- above is satisfied at statement end and never transiently holds two
-- owners or zero owners.
create function transfer_ownership(p_household_id uuid, p_new_owner_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if not is_household_owner(p_household_id) then
    raise exception 'Only the current Owner can transfer ownership.';
  end if;
  if not exists (
    select 1 from members where household_id = p_household_id and user_id = p_new_owner_user_id
  ) then
    raise exception 'Target user is not a member of this household.';
  end if;

  update members
  set role = case
    when user_id = p_new_owner_user_id then 'owner'
    when user_id = caller then 'member'
    else role
  end
  where household_id = p_household_id
    and user_id in (p_new_owner_user_id, caller);
end;
$$;

-- ---------------------------------------------------------------------------
-- Locations & containers
-- ---------------------------------------------------------------------------

create table locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  description text,
  cover_photo_emoji text,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'trashed')),
  trashed_at timestamptz,
  permanently_delete_after timestamptz
);

create index locations_household_id_idx on locations(household_id);

create table containers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  parent_container_id uuid references containers(id) on delete cascade,
  name text not null,
  description text,
  tag_token text not null,
  display_code text, -- human-facing "Bin ID" (e.g. GAR-234); separate from tag_token
  cover_photo_emoji text,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'trashed')),
  trashed_at timestamptz,
  permanently_delete_after timestamptz,
  unique (household_id, tag_token)
);

create index containers_household_id_idx on containers(household_id);
create index containers_location_id_idx on containers(location_id);
create index containers_parent_container_id_idx on containers(parent_container_id);
-- Bin IDs are unique per household, but only when assigned (many containers can be unassigned).
create unique index containers_household_display_code_idx on containers(household_id, display_code) where display_code is not null;

-- Cycle prevention (A contains B contains A) — PRD §22 calls for this as a
-- database-level invariant, not just API-layer discipline every engineer
-- has to remember. Walks up NEW.parent_container_id's ancestor chain and
-- rejects the write if NEW.id appears in it (including the direct
-- self-parent case). The Move sheet (move-sheet.tsx) already filters a
-- container's own subtree out of its destination list client-side — this
-- is the second line of defense for any write that doesn't go through it.
create function prevent_container_cycle()
returns trigger
language plpgsql
as $$
begin
  if new.parent_container_id is null then
    return new;
  end if;
  if new.parent_container_id = new.id then
    raise exception 'A container cannot be its own parent.';
  end if;
  if exists (
    with recursive ancestors as (
      select id, parent_container_id from containers where id = new.parent_container_id
      union all
      select c.id, c.parent_container_id from containers c
      join ancestors a on c.id = a.parent_container_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'Moving this container here would create a cycle.';
  end if;
  return new;
end;
$$;

create trigger containers_prevent_cycle
  before insert or update of parent_container_id on containers
  for each row execute function prevent_container_cycle();

-- Mirrors moveContainer()'s cascade in the mock store (src/lib/store.ts):
-- moving a container to a new location carries its whole subtree — nested
-- containers and their items — with it. Only touches direct children;
-- each child's own location_id change re-fires this same trigger, so
-- depth propagates naturally through the trigger mechanism rather than a
-- recursive CTE recomputing the full descendant set up front.
create function cascade_container_location()
returns trigger
language plpgsql
as $$
begin
  if new.location_id is distinct from old.location_id then
    update containers set location_id = new.location_id where parent_container_id = new.id;
    update items set location_id = new.location_id, updated_at = now() where container_id = new.id;
  end if;
  return new;
end;
$$;

create trigger containers_cascade_location
  after update of location_id on containers
  for each row execute function cascade_container_location();

-- ---------------------------------------------------------------------------
-- Items, tags, extra details
-- ---------------------------------------------------------------------------

create table items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  container_id uuid references containers(id) on delete set null,
  name text not null,
  original_detected_name text,
  category text not null,
  quantity integer not null default 1 check (quantity between 0 and 9999),
  notes text not null default '',
  photo_emoji text not null,
  status text not null default 'active' check (status in ('active', 'archived', 'trashed')),
  needs_review boolean not null default false,
  review_reason text,
  -- Category-scoped extra fields (PRD v2 §6), e.g. {"modelNumber": "..."}. Not a
  -- generic custom-field system — the allowed keys per category live in application code.
  extra_details jsonb not null default '{}'::jsonb,
  -- Which household member this item personally belongs to (roommate
  -- households, not just families) — null means shared/household item, not
  -- owned by one person. Not validated against household membership here,
  -- same as created_by_user_id below; both rely on API-layer discipline
  -- (PRD §22's "cross-household reference validation" blanket rule) rather
  -- than a per-column trigger.
  owner_user_id uuid references auth.users(id) on delete set null,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trashed_at timestamptz,
  permanently_delete_after timestamptz
);

create index items_household_id_idx on items(household_id);
create index items_location_id_idx on items(location_id);
create index items_container_id_idx on items(container_id);
create index items_status_idx on items(household_id, status);
create index items_owner_user_id_idx on items(owner_user_id) where owner_user_id is not null;

-- Keeps location_id in sync with the container's own location whenever
-- container_id is set, so the two can never desync — itemsIn() and
-- friends (src/lib/selectors.ts) filter on both columns together and
-- would silently drop an item from every location-scoped view if they
-- disagreed. container_id null (a loose item, not in a container) leaves
-- location_id untouched — that's the only case where it's the source of
-- truth rather than a denormalized copy.
create function sync_item_location()
returns trigger
language plpgsql
as $$
begin
  if new.container_id is not null then
    select location_id into new.location_id from containers where id = new.container_id;
  end if;
  return new;
end;
$$;

create trigger items_sync_location
  before insert or update of container_id on items
  for each row execute function sync_item_location();

create table tags (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  unique (household_id, name)
);

create table item_tags (
  item_id uuid not null references items(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (item_id, tag_id)
);

create table normalization_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  raw_pattern text not null,
  canonical_name text not null,
  category text not null,
  source text not null check (source in ('learned', 'manual')),
  usage_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index normalization_rules_household_id_idx on normalization_rules(household_id);

-- ---------------------------------------------------------------------------
-- Attachments (PRD v2 §5)
-- ---------------------------------------------------------------------------

create table attachments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  kind text not null check (kind in ('receipt', 'manual', 'warranty', 'other')),
  file_name text not null,
  storage_path text not null, -- Supabase Storage object path
  content_type text not null,
  size_bytes bigint not null,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index attachments_item_id_idx on attachments(item_id);

-- ---------------------------------------------------------------------------
-- Label batches (PRD v2 §3)
-- ---------------------------------------------------------------------------

create table label_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  paper_preset text not null,
  toggle text not null check (toggle in ('qr', 'qr-code', 'qr-code-name')),
  include_location boolean not null default true,
  offset_x numeric not null default 0,
  offset_y numeric not null default 0
);

create table label_batch_entries (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references label_batches(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  container_id uuid references containers(id) on delete set null, -- null = unassigned/preprinted
  tag_token text not null,
  display_code text
);

create index label_batch_entries_batch_id_idx on label_batch_entries(batch_id);
create index label_batch_entries_container_id_idx on label_batch_entries(container_id);

-- ---------------------------------------------------------------------------
-- Favorites & activity log
-- ---------------------------------------------------------------------------

create table favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  entity_type text not null check (entity_type in ('item', 'container', 'location', 'household', 'member')),
  entity_id uuid not null, -- polymorphic — points at whichever table entity_type names, no FK
  entity_name text not null,
  -- Mirrors the ActivityAction union in src/lib/types.ts.
  action text not null check (action in (
    'created', 'edited', 'moved', 'archived', 'trashed', 'restored',
    'deleted_forever', 'invited', 'joined', 'removed', 'ownership_transferred'
  )),
  detail text,
  created_at timestamptz not null default now()
);

create index activity_log_household_id_idx on activity_log(household_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security — every table is scoped to the caller's household(s)
-- ---------------------------------------------------------------------------

alter table households enable row level security;
alter table members enable row level security;
alter table invites enable row level security;
alter table locations enable row level security;
alter table containers enable row level security;
alter table items enable row level security;
alter table tags enable row level security;
alter table item_tags enable row level security;
alter table normalization_rules enable row level security;
alter table attachments enable row level security;
alter table label_batches enable row level security;
alter table label_batch_entries enable row level security;
alter table favorites enable row level security;
alter table activity_log enable row level security;

-- households, members, and invites get tighter policies than everything
-- below: PRD §13 requires ownership transfer to be an owner-only,
-- database-enforced action, and the Household Members screen
-- (settings/members/page.tsx) already gates every mutation here — invite,
-- cancel invite, remove, transfer — behind an isOwner check client-side.
-- These policies back that up server-side instead of trusting the client.
--
-- Deliberately no client-facing INSERT policy on households or members:
-- the only sanctioned ways to create either row are create_household() and
-- a future accept_invite() security-definer function (see the invites
-- comment below) — both bypass RLS by design, so a matching INSERT policy
-- here would just be an unused, harder-to-reason-about second door.

create policy "household member read" on households
  for select using (is_household_member(id));
create policy "household owner update" on households
  for update using (is_household_owner(id)) with check (is_household_owner(id));
create policy "household owner delete" on households
  for delete using (is_household_owner(id));

create policy "household member read" on members
  for select using (is_household_member(household_id));
create policy "household owner delete" on members
  for delete using (is_household_owner(household_id));

create policy "household member read" on invites
  for select using (is_household_member(household_id));
create policy "household owner write" on invites
  for insert with check (is_household_owner(household_id));
create policy "household owner delete" on invites
  for delete using (is_household_owner(household_id));
-- No UPDATE policy yet: invite acceptance (status -> 'accepted') is keyed
-- off the invited email, not existing household membership, so it needs
-- its own security-definer accept_invite() function once that flow is
-- built. Not on the app's active path yet — store.ts has inviteMember and
-- cancelInvite mock actions to mirror, but no acceptInvite.

create policy "household member read/write" on locations
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "household member read/write" on containers
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "household member read/write" on items
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "household member read/write" on tags
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "household member read/write" on normalization_rules
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "household member read/write" on attachments
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "household member read/write" on label_batches
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "household member read/write" on label_batch_entries
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "household member read/write" on activity_log
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

-- item_tags and favorites have no household_id column of their own — scope through items.
create policy "household member read/write" on item_tags
  for all using (
    exists (select 1 from items where items.id = item_tags.item_id and is_household_member(items.household_id))
  ) with check (
    exists (select 1 from items where items.id = item_tags.item_id and is_household_member(items.household_id))
  );

create policy "household member read/write" on favorites
  for all using (
    exists (select 1 from items where items.id = favorites.item_id and is_household_member(items.household_id))
  ) with check (
    exists (select 1 from items where items.id = favorites.item_id and is_household_member(items.household_id))
  );
