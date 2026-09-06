-- Native push registration tokens (docs/Mobile App Addendum.md §2.1) —
-- parallel to push_subscriptions (0016_push_notifications.sql), not a
-- replacement for it. push_subscriptions is standards-based Web Push
-- (browser/PWA); a Capacitor-wrapped native app can't receive that inside
-- its WebView, so it registers an FCM token here instead via
-- @capacitor/push-notifications. sendPushToUser() (lib/push/send.ts)
-- delivers to both tables for a given user — a household member gets
-- pushed on whatever they've actually registered, browser or native app
-- or both.

create table device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  fcm_token text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index device_push_tokens_household_id_idx on device_push_tokens(household_id);
create index device_push_tokens_user_id_idx on device_push_tokens(user_id);

alter table device_push_tokens enable row level security;

-- Same shape as push_subscriptions' own policy — user-scoped, not
-- household-scoped, since a device token is inherently personal (it's
-- registered per Capacitor app install, not shared).
create policy "own device push tokens" on device_push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
