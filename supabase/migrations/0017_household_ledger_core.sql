-- Household Ledger — Phase 0 schema (docs/Household Ledger Implementation
-- Plan.md §2, PRD docs/v4 - Enhanced Features §8/§9/§10/§25/§29).
--
-- Four additions, deliberately the smallest schema this PRD needs — see
-- the Implementation Plan §1 "reality check": Documents (§28) and
-- Appliances (§27) needed no schema at all (attachments.kind and
-- items.extra_details already cover them). This migration covers the two
-- real gaps plus two small net-new tables:
--
--   1. people             — a household member who may or may not have an
--                            Account (PRD §8/§23). `members` today *is*
--                            the account-holder list; there was no way to
--                            represent a child or managed profile at all.
--   2. items.owner_person_id — items can now belong to a Person instead of
--                            only an authenticated member (owner_user_id).
--                            owner_user_id is kept, not dropped, as a read
--                            compatibility shim — see the note below.
--   3. item_purchases     — the transaction ↔ item link (PRD §25). This is
--                            the actual product thesis; everything else in
--                            this file is supporting cast.
--   4. pinned_locations   — Simple Home Map (PRD §29): a handful of pinned
--                            critical locations, not a typed infrastructure
--                            model. No per-category schema on purpose.
--   5. event_log          — append-only history (PRD §3's "WHEN" pillar
--                            had nothing backing it). Not yet written to by
--                            any trigger in this migration — application
--                            code writes to it going forward; retrofitting
--                            an audit trail after the fact is much more
--                            expensive than including the table now.

-- ---------------------------------------------------------------------------
-- 1. People
-- ---------------------------------------------------------------------------

create table people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  display_name text not null,
  -- Mirrors the relationship options in PRD §22's "Add Household Member"
  -- screen exactly. No 'self' value: the account holder's own Person row
  -- is just another row here — the app already knows "this Person is you"
  -- from linked_user_id = auth.uid(), so a redundant self-referential
  -- category would be one more thing that can drift from the truth.
  relationship text not null default 'other'
    check (relationship in ('partner_spouse', 'child', 'parent', 'family_member', 'roommate', 'other')),
  avatar_path text,
  -- Null = managed profile (PRD §23): no email, phone, password, or
  -- authentication account required. Set once a managed profile is linked
  -- to a real Account, or immediately for a Person created from an
  -- existing member (see the create_household()/accept_invite() changes
  -- below) — either way, "linked" is the only concept; there is no
  -- separate boolean to fall out of sync with it.
  linked_user_id uuid references auth.users(id) on delete set null,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index people_household_id_idx on people(household_id);
-- Per household, not global: the same auth user can be a real member of
-- more than one household (a roommate situation spanning two houses), and
-- each membership gets its own Person row.
create unique index people_household_linked_user_id_idx on people(household_id, linked_user_id) where linked_user_id is not null;

-- Backfill: one Person per existing members row, so every current account
-- holder has a Person row before owner_person_id backfill (below) needs
-- one to point at. Relationship left at the 'other' default deliberately —
-- the household's actual relationships (who's a partner, who's a child)
-- aren't recoverable from `members` and shouldn't be guessed; a real value
-- gets set the first time someone edits it in the People UI (Implementation
-- Plan Workstream 2).
insert into people (household_id, display_name, avatar_path, linked_user_id, created_by_user_id, created_at)
select m.household_id, m.display_name, m.avatar_url, m.user_id, m.user_id, m.joined_at
from members m
on conflict do nothing;

-- create_household() and accept_invite() (0001_init.sql) are the only
-- sanctioned ways a `members` row is created — extending both here keeps
-- `people` in sync automatically for every future signup/invite-accept
-- instead of relying on application code to remember a second insert.
create or replace function create_household(p_name text, p_display_name text, p_email text, p_avatar_url text default null)
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
  insert into people (household_id, display_name, avatar_path, linked_user_id, created_by_user_id)
  values (new_household.id, p_display_name, p_avatar_url, auth.uid(), auth.uid());
  return new_household;
end;
$$;

create or replace function accept_invite(p_invite_id uuid, p_display_name text, p_avatar_url text default null)
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

  insert into people (household_id, display_name, avatar_path, linked_user_id, created_by_user_id)
  values (target_invite.household_id, p_display_name, p_avatar_url, auth.uid(), auth.uid())
  on conflict (household_id, linked_user_id) do nothing;

  update invites set status = 'accepted' where id = p_invite_id;

  select * into joined_household from households where id = target_invite.household_id;
  return joined_household;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Item ownership by Person
-- ---------------------------------------------------------------------------

-- owner_user_id is kept, not dropped: 56 call sites across src/ read or
-- write it today (Implementation Plan §9 — grep before dropping). It
-- becomes a compatibility shim once Workstream 2 (People & ownership UI)
-- switches the app to owner_person_id; drop it in its own follow-up
-- migration once every call site is confirmed migrated, not in this one.
alter table items add column owner_person_id uuid references people(id) on delete set null;
create index items_owner_person_id_idx on items(owner_person_id) where owner_person_id is not null;

update items
set owner_person_id = people.id
from people
where people.household_id = items.household_id
  and people.linked_user_id = items.owner_user_id
  and items.owner_user_id is not null
  and items.owner_person_id is null;

-- Extends sync_item_location() (0001_init.sql) rather than adding a
-- second trigger — one place validates every item-ownership/location
-- invariant, matching how the function already validates owner_user_id.
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

  return new;
end;
$$;

-- 0001_init.sql already created this trigger against the pre-owner_person_id
-- version of the function; drop and recreate rather than leaving the old
-- column list in place, following the same pattern 0013_manual_line_items.sql
-- used for the same situation.
drop trigger if exists items_sync_location on items;
create trigger items_sync_location
  before insert or update of container_id, location_id, household_id, owner_user_id, owner_person_id on items
  for each row execute function sync_item_location();

-- ---------------------------------------------------------------------------
-- 3. Item ↔ transaction linking (PRD §25 — the product thesis)
-- ---------------------------------------------------------------------------

create table item_purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  -- Both nullable, but at least one required (check below): a link can
  -- point at a confirmed transaction, a not-yet-confirmed receipt-scan
  -- line item, or both once a draft resolves into a real transaction.
  transaction_id uuid references transactions(id) on delete set null,
  scanned_receipt_line_item_id uuid references scanned_receipt_line_items(id) on delete set null,
  source text not null check (source in ('manual', 'ai_suggested', 'finance_nudge')),
  linked_by_user_id uuid not null references auth.users(id),
  linked_at timestamptz not null default now(),
  constraint item_purchases_has_a_target check (transaction_id is not null or scanned_receipt_line_item_id is not null)
);

-- Deliberately no repair/maintenance-cost link_type here — that's PRD
-- §31/"Later" territory (Appliance Lifecycle repairs) and doesn't have a
-- real workflow yet. Adding it now would be exactly the "model a
-- relationship before the feature that needs it exists" mistake the PRD
-- itself was revised to avoid (see the original §10 relationship
-- reduction). One row = one purchase link; extend later against a real
-- repairs feature, not speculatively now.

create index item_purchases_household_id_idx on item_purchases(household_id);
create index item_purchases_item_id_idx on item_purchases(item_id);
create index item_purchases_transaction_id_idx on item_purchases(transaction_id) where transaction_id is not null;
create index item_purchases_line_item_idx on item_purchases(scanned_receipt_line_item_id) where scanned_receipt_line_item_id is not null;

create function validate_item_purchase_household()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from items where id = new.item_id and household_id = new.household_id) then
    raise exception 'item_purchases.item_id must belong to the same household as the link.';
  end if;
  if new.transaction_id is not null and not exists (
    select 1 from transactions where id = new.transaction_id and household_id = new.household_id
  ) then
    raise exception 'item_purchases.transaction_id must belong to the same household as the link.';
  end if;
  if new.scanned_receipt_line_item_id is not null and not exists (
    select 1 from scanned_receipt_line_items where id = new.scanned_receipt_line_item_id and household_id = new.household_id
  ) then
    raise exception 'item_purchases.scanned_receipt_line_item_id must belong to the same household as the link.';
  end if;
  return new;
end;
$$;

create trigger item_purchases_validate_household
  before insert or update of item_id, transaction_id, scanned_receipt_line_item_id, household_id on item_purchases
  for each row execute function validate_item_purchase_household();

-- ---------------------------------------------------------------------------
-- 4. Simple Home Map (PRD §29) — pinned locations, not a schematic
-- ---------------------------------------------------------------------------

create table pinned_locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  -- 'wall_photo' covers the renovation-photo case (PRD §29's "Capture
  -- Before Closing Wall") — it's just another pinned-location category,
  -- not a separate feature. Deliberately no per-category structured
  -- fields (no breaker-list schema, no valve-type schema) — see
  -- Implementation Plan §6: a typed Home Systems taxonomy is explicit
  -- non-scope, not an oversight.
  category text not null check (category in
    ('water_shutoff', 'electrical_panel', 'gas_shutoff', 'hvac', 'network', 'wall_photo', 'other')),
  photo_path text,
  location_note text,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index pinned_locations_household_id_idx on pinned_locations(household_id);

-- ---------------------------------------------------------------------------
-- 5. Event log (PRD §3's "WHEN"/History pillar)
-- ---------------------------------------------------------------------------

create table event_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index event_log_household_id_occurred_at_idx on event_log(household_id, occurred_at desc);
create index event_log_entity_idx on event_log(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Storage: pinned-location photos reuse the existing private "attachments"
-- bucket (0003_attachments_storage.sql) rather than a new one — no new
-- bucket, no new storage policy needed. This is a deliberate privacy
-- choice, not just convenience: home-systems photos (electrical panel,
-- router, wall photos revealing wiring/plumbing) are the single most
-- sensitive photo category the product handles, so they get attachments'
-- private-bucket treatment, not item-photos' public one. Object path
-- convention: `${householdId}/pinned-locations/${pinnedLocationId}`.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table people enable row level security;
alter table item_purchases enable row level security;
alter table pinned_locations enable row level security;
alter table event_log enable row level security;

create policy "household member read/write" on people
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

-- Privacy-aware, matching transactions' own policy (0010_finance_schema.sql):
-- a household member who can't see a private account's transactions
-- shouldn't be able to see — or create — a link into one via an item,
-- even though item_purchases itself has no account_id column. Only
-- restricts visibility when transaction_id is actually set; a link that's
-- still only a scanned_receipt_line_item (pre-confirmation draft) follows
-- receipt-scanning's existing "review-stage, plain household membership"
-- privacy shape (0011_receipt_scanning.sql's comment on why drafts are
-- less restricted than confirmed transactions).
create policy "household member read/write, privacy-aware" on item_purchases
  for all using (
    is_household_member(household_id)
    and (
      transaction_id is null
      or can_view_account((select account_id from transactions where id = item_purchases.transaction_id))
    )
  )
  with check (
    is_household_member(household_id)
    and (
      transaction_id is null
      or can_view_account((select account_id from transactions where id = item_purchases.transaction_id))
    )
  );

create policy "household member read/write" on pinned_locations
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

-- Read/insert only — an audit trail is append-only by design, same as
-- attachments having no update policy (0003_attachments_storage.sql's
-- comment: "created and deleted, never edited in place"); event_log isn't
-- even deleted in the normal course of things, so there's no delete
-- policy either. Rows disappear only via cascade when a household is
-- deleted (no household_id FK survives that).
create policy "household member read" on event_log
  for select using (is_household_member(household_id));
create policy "household member insert" on event_log
  for insert with check (is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Realtime — same opt-in mechanism as 0004_realtime_publication.sql.
-- event_log deliberately excluded: nothing subscribes to a live audit
-- trail today, and adding it later is a one-line follow-up, not a
-- migration that needs redoing.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['people', 'item_purchases', 'pinned_locations']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
