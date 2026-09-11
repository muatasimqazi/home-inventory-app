-- Per-user customization for the morning briefing push
-- (send-daily-briefing/route.ts) — opt-in (enabled defaults false,
-- unlike every other event type's opt-out default in
-- notification_preferences), with its own preferred send hour and which
-- content sections to include. notification_preferences (0016) has no
-- room for either of those — it's just enabled/channel — and doesn't fit
-- a feature this opinionated defaulting to on for everyone. A dedicated
-- table, not new columns bolted onto notification_preferences, since
-- notification_hour/include_* are meaningless for every other event type
-- there.
create table daily_briefing_preferences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  -- Local hour (0-23) in the household's own derived timezone
  -- (lib/timezone.ts, from households.latitude/longitude) — not UTC.
  notification_hour smallint not null default 7 check (notification_hour >= 0 and notification_hour <= 23),
  include_weather boolean not null default true,
  include_outfit boolean not null default true,
  include_tasks boolean not null default true,
  include_bills boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (user_id, household_id)
);

create index daily_briefing_preferences_user_id_idx on daily_briefing_preferences(user_id);

-- Same cross-household reference validation every other user-scoped
-- household table has its own copy of (e.g.
-- validate_push_subscription_household() in 0016).
create function validate_daily_briefing_preferences_household()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from members where household_id = new.household_id and user_id = new.user_id) then
    raise exception 'Daily briefing preferences user must be a member of the household.';
  end if;
  return new;
end;
$$;

create trigger daily_briefing_preferences_validate_household
  before insert or update of household_id, user_id on daily_briefing_preferences
  for each row execute function validate_daily_briefing_preferences_household();

alter table daily_briefing_preferences enable row level security;

create policy "own daily briefing preferences" on daily_briefing_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Table-level grants are picked up automatically by 0009's
-- `alter default privileges` — nothing to add here.
