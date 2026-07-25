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
  action text not null,
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

create policy "household member read/write" on households
  for all using (is_household_member(id)) with check (is_household_member(id));

create policy "household member read/write" on members
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "household member read/write" on invites
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

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
