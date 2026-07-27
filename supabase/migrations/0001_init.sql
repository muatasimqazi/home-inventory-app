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

-- Redeeming an invite is keyed off the caller's own authenticated email
-- (auth.email(), the JWT claim — not a string the client can spoof by
-- passing an arbitrary "email" argument) matched case-insensitively
-- against invites.invited_email, not off household membership the caller
-- doesn't have yet. security definer so it can insert into `members` and
-- update `invites` despite the caller not being a member of that
-- household at call time — the entire reason RLS can't just grow an
-- "accept your own invite" policy for a normal client-side UPDATE.
create function accept_invite(p_invite_id uuid, p_display_name text, p_avatar_url text default null)
returns households
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invite invites;
  joined_household households;
begin
  select * into target_invite from invites where id = p_invite_id;
  if not found then
    raise exception 'Invite not found.';
  end if;
  if target_invite.status <> 'pending' then
    raise exception 'This invite is no longer pending.';
  end if;
  if target_invite.expires_at <= now() then
    update invites set status = 'expired' where id = p_invite_id;
    raise exception 'This invite has expired.';
  end if;
  if lower(target_invite.invited_email) <> lower(auth.email()) then
    raise exception 'This invite was sent to a different email address.';
  end if;

  insert into members (household_id, user_id, role, display_name, email, avatar_url)
  values (target_invite.household_id, auth.uid(), 'member', p_display_name, auth.email(), p_avatar_url)
  on conflict (household_id, user_id) do nothing;

  update invites set status = 'accepted' where id = p_invite_id;

  select * into joined_household from households where id = target_invite.household_id;
  return joined_household;
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
  -- Set once an NFC tag has actually been linked (native write or the iOS
  -- Shortcuts fallback both count) — null means only the QR label exists.
  nfc_linked_at timestamptz,
  unique (household_id, tag_token)
);

create index containers_household_id_idx on containers(household_id);
create index containers_location_id_idx on containers(location_id);
create index containers_parent_container_id_idx on containers(parent_container_id);
-- Bin IDs are unique per household, but only when assigned (many containers can be unassigned).
create unique index containers_household_display_code_idx on containers(household_id, display_code) where display_code is not null;

-- Cross-household reference validation (PRD §22's blanket rule: every
-- write validates that *all* foreign-key references, not just the primary
-- entity, resolve to the caller's household — enforced here, not left to
-- API-layer discipline). A container's location must actually belong to
-- the same household as the container itself.
create function validate_container_location_household()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from locations where id = new.location_id and household_id = new.household_id) then
    raise exception 'Container location must belong to the same household as the container.';
  end if;
  return new;
end;
$$;

create trigger containers_validate_location_household
  before insert or update of location_id, household_id on containers
  for each row execute function validate_container_location_household();

-- Cycle prevention (A contains B contains A) — PRD §22 calls for this as a
-- database-level invariant, not just API-layer discipline every engineer
-- has to remember. Walks up NEW.parent_container_id's ancestor chain and
-- rejects the write if NEW.id appears in it (including the direct
-- self-parent case). The Move sheet (move-sheet.tsx) already filters a
-- container's own subtree out of its destination list client-side — this
-- is the second line of defense for any write that doesn't go through it.
-- Also enforces the same cross-household rule as above: a parent
-- container must belong to the same household as its child.
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
    select 1 from containers where id = new.parent_container_id and household_id <> new.household_id
  ) then
    raise exception 'Parent container must belong to the same household.';
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
  -- owned by one person. Validated by sync_item_location() below (it must
  -- be an actual member of this item's household, not just any auth user) —
  -- created_by_user_id doesn't need the same check: RLS's
  -- is_household_member(household_id) already gates every write to this
  -- table, so whoever the API sets created_by_user_id to (always the
  -- caller, auth.uid()) is already guaranteed to be a member.
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
-- location_id as whatever was written directly — validated below instead.
--
-- Also where the cross-household reference checks for items live (PRD
-- §22): the container (or, for a loose item, the location) must belong
-- to the same household as the item, and owner_user_id — if set — must
-- actually be a member of that household, not just any Supabase auth user.
create function sync_item_location()
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

  if new.owner_user_id is not null and not exists (
    select 1 from members where household_id = new.household_id and user_id = new.owner_user_id
  ) then
    raise exception 'Item owner must be a member of the item''s household.';
  end if;

  return new;
end;
$$;

create trigger items_sync_location
  before insert or update of container_id, location_id, household_id, owner_user_id on items
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

-- item_tags has no household_id of its own (it's a pure join table) — the
-- cross-household check here is that the item and the tag actually belong
-- to the *same* household, not just that each individually does.
create function validate_item_tag_household()
returns trigger
language plpgsql
as $$
declare
  item_household uuid;
  tag_household uuid;
begin
  select household_id into item_household from items where id = new.item_id;
  select household_id into tag_household from tags where id = new.tag_id;
  if item_household is null or tag_household is null then
    raise exception 'Item or tag not found.';
  end if;
  if item_household <> tag_household then
    raise exception 'Item and tag must belong to the same household.';
  end if;
  return new;
end;
$$;

create trigger item_tags_validate_household
  before insert or update on item_tags
  for each row execute function validate_item_tag_household();

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
  -- No PRD-specified numbers for either check below — mirrors
  -- lib/attachment-limits.ts's 10MB cap and image/PDF-only rule so the
  -- same limits hold even for a write that bypasses the client (a direct
  -- API call, a future import path, etc.), not just whichever UI happened
  -- to check first.
  content_type text not null check (content_type like 'image/%' or content_type = 'application/pdf'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index attachments_item_id_idx on attachments(item_id);

create function validate_attachment_household()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from items where id = new.item_id and household_id = new.household_id) then
    raise exception 'Attachment must belong to the same household as its item.';
  end if;
  return new;
end;
$$;

create trigger attachments_validate_household
  before insert or update of item_id, household_id on attachments
  for each row execute function validate_attachment_household();

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
  offset_y numeric not null default 0,
  -- 'draft' isn't produced by the app's current single-step create+generate
  -- flow, but stays the schema default (PRD §22) so a future save-for-later
  -- flow doesn't need a migration to add it.
  status text not null default 'draft' check (status in ('draft', 'generated', 'printed'))
);

create table label_batch_entries (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references label_batches(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  container_id uuid references containers(id) on delete set null, -- null = unassigned/preprinted
  tag_token text not null,
  display_code text,
  -- Tied to container_id, not independently settable: unassigned iff no
  -- container yet; assigned/printed both require one. Mirrors the mock's
  -- own derivation (claimUnassignedLabel / markLabelBatchPrinted) as a
  -- CHECK rather than a trigger, since it only depends on this row's own
  -- columns.
  status text not null default 'unassigned' check (
    (status = 'unassigned' and container_id is null) or
    (status in ('assigned', 'printed') and container_id is not null)
  )
);

create index label_batch_entries_batch_id_idx on label_batch_entries(batch_id);
create index label_batch_entries_container_id_idx on label_batch_entries(container_id);

create function validate_label_batch_entry_household()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from label_batches where id = new.batch_id and household_id = new.household_id) then
    raise exception 'Label batch entry must belong to the same household as its batch.';
  end if;
  if new.container_id is not null and not exists (
    select 1 from containers where id = new.container_id and household_id = new.household_id
  ) then
    raise exception 'Label batch entry''s container must belong to the same household.';
  end if;
  return new;
end;
$$;

create trigger label_batch_entries_validate_household
  before insert or update of batch_id, container_id, household_id on label_batch_entries
  for each row execute function validate_label_batch_entry_household();

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
    'deleted_forever', 'invited', 'joined', 'removed', 'left', 'ownership_transferred'
  )),
  detail text,
  created_at timestamptz not null default now()
);

create index activity_log_household_id_idx on activity_log(household_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Trash auto-purge (PRD §14: trashed rows are "automatically and
-- permanently purged by a scheduled job" once permanently_delete_after
-- passes — until now, permanently_delete_after was computed and stored
-- everywhere trash happens, but nothing ever read it to actually delete
-- anything; rows just sat in trash forever past retention unless a human
-- clicked "Delete Forever").
--
-- Requires the pg_cron extension enabled on the Supabase project
-- (Database → Extensions in the dashboard — available on all plans, but
-- not on by default, and not something this migration file can turn on
-- by itself if the project disallows it). If pg_cron truly isn't
-- available, purge_expired_trash() below still works as a plain function
-- — call it manually or from an external scheduler instead of relying on
-- the cron.schedule() call at the bottom of this section.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;

-- security definer: a scheduled job has no household context of its own —
-- it isn't "a member" of anything, so RLS's is_household_member() checks
-- would block every delete if this ran under a caller's own privileges.
-- Deletes leaf-first (items, then containers, then locations) and only
-- deletes a container/location once nothing still depends on it, so an
-- expired parent never takes a *not-yet-expired* (or even still-active)
-- child down with it via ON DELETE CASCADE — the cheap version of this
-- function would just `delete from locations where ...` and trust cascade,
-- but containers.location_id and containers.parent_container_id are both
-- ON DELETE CASCADE, so that would also sweep away any container whose
-- own retention window hasn't actually expired yet, just because it lives
-- under an expired parent.
create function purge_expired_trash()
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

  -- Bounded loop: a multi-level expired container tree (bins nested a few
  -- levels deep, all trashed together via the existing cascading-trash
  -- behavior) fully clears in one run instead of peeling off one level per
  -- cron tick. 10 iterations is far beyond any realistic nesting depth.
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
end;
$$;

select cron.schedule('purge-expired-trash', '0 * * * *', 'select purge_expired_trash();');

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
-- "and user_id <> auth.uid()" matters: without it, an Owner could delete
-- their own row through *this* policy even though the self-leave policy
-- below blocks it — multiple permissive policies for the same command OR
-- together, so the restriction has to hold in both, not just one.
create policy "household owner delete" on members
  for delete using (is_household_owner(household_id) and user_id <> auth.uid());
-- Leave Household (PRD §13/§29): any member can delete their own row,
-- but not if they're the household's Owner — the one-owner invariant
-- means there's no "leave, someone else is still owner" case for an
-- Owner; they must transfer_ownership() first, becoming a plain member,
-- then this policy applies to them like anyone else.
create policy "member leaves own row" on members
  for delete using (user_id = auth.uid() and role <> 'owner');

create policy "household member read" on invites
  for select using (is_household_member(household_id));
create policy "household owner write" on invites
  for insert with check (is_household_owner(household_id));
create policy "household owner delete" on invites
  for delete using (is_household_owner(household_id));
-- Deliberately no UPDATE policy: invite acceptance (status -> 'accepted')
-- is keyed off the invited email, not existing household membership the
-- caller doesn't have yet, so it goes through accept_invite() above
-- (security definer, bypasses RLS) rather than a client-side UPDATE.

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
