-- Web Push notifications (docs/Household Hub Addendum.md §5, generalized
-- per docs/Platform Foundation Addendum.md §2) — real infrastructure, not
-- domain-specific: household_tasks doesn't exist in code yet, but the
-- notification pipeline is built against the generalized
-- domain_key/event_type shape those addenda already specced, with the
-- first real trigger wired to Finance's existing recurring bills (the
-- only "due at a specific time" event today) rather than waiting on a
-- domain that isn't built.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  device_label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index push_subscriptions_household_id_idx on push_subscriptions(household_id);
create index push_subscriptions_user_id_idx on push_subscriptions(user_id);

-- Idempotency log — UNIQUE constraint is the actual guarantee "one push
-- per due occurrence, never a duplicate re-send" relies on; the send job
-- checks this table before sending, not the other way around.
create table event_notification_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  domain_key text not null, -- 'tasks' | 'finance' | 'inventory' | 'automation' | ...
  entity_type text not null,
  entity_id uuid not null,
  occurrence_key text not null, -- disambiguates recurring occurrences of the same entity (a due date, a billing period, etc.)
  sent_at timestamptz not null default now(),
  unique (domain_key, entity_type, entity_id, occurrence_key)
);

create index event_notification_log_household_id_idx on event_notification_log(household_id);

create table notification_preferences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  domain_key text not null,
  event_type text not null, -- domain-defined, e.g. 'bill.due'
  channel text not null default 'push' check (channel in ('push', 'in_app_only')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (user_id, domain_key, event_type)
);

create index notification_preferences_user_id_idx on notification_preferences(user_id);

-- Cross-household reference validation, same style as every other table's
-- own version of this trigger (e.g. validate_csv_import_batch_household()
-- in 0010).
create function validate_push_subscription_household()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from members where household_id = new.household_id and user_id = new.user_id) then
    raise exception 'Push subscription user must be a member of the subscription''s household.';
  end if;
  return new;
end;
$$;

create trigger push_subscriptions_validate_household
  before insert or update of household_id, user_id on push_subscriptions
  for each row execute function validate_push_subscription_household();

create trigger notification_preferences_validate_household
  before insert or update of household_id, user_id on notification_preferences
  for each row execute function validate_push_subscription_household();

-- RLS — same plain household-membership shape every other table uses
-- (PRD §32.8's "no new RLS pattern" default), but user-scoped on top:
-- a push subscription is a device, not a household asset, so a member
-- only ever sees/manages their own rows even though every table also
-- carries household_id for consistent RLS shape (Household Hub Addendum
-- §4's own framing, carried over unchanged).
alter table push_subscriptions enable row level security;
alter table event_notification_log enable row level security;
alter table notification_preferences enable row level security;

create policy "own push subscriptions" on push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- event_notification_log has no direct end-user-facing purpose (the send
-- job, running on the admin client, is the only real reader/writer) —
-- household members can still read it (e.g. a future "notification
-- history" surface), just never write it directly.
create policy "household member read" on event_notification_log
  for select using (is_household_member(household_id));

create policy "own notification preferences" on notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Table-level grants are picked up automatically by 0009's
-- `alter default privileges` — nothing to add here.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notification_preferences'
  ) then
    alter publication supabase_realtime add table notification_preferences;
  end if;
end $$;
