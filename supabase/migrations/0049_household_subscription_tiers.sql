-- App-level subscription tiers live on the household: one owner pays for
-- the shared household workspace, and every member reads the resulting
-- entitlement through the existing household bundle.

alter table households add column subscription_tier text not null default 'free';
alter table households add column subscription_status text not null default 'free';
alter table households add column stripe_customer_id text unique;
alter table households add column stripe_subscription_id text unique;
alter table households add column stripe_price_id text;
alter table households add column subscription_current_period_end timestamptz;
alter table households add column subscription_updated_at timestamptz not null default now();

alter table households
  add constraint households_subscription_tier_check
  check (subscription_tier in ('free', 'plus', 'pro'));

comment on column households.subscription_tier is 'Schuaz app plan for this household workspace. Set by Stripe webhooks or owner billing actions; free is the default.';
comment on column households.subscription_status is 'Stripe subscription status when paid, or free for unpaid households.';
comment on column households.stripe_customer_id is 'Stripe Customer id for this household, created lazily when the owner starts checkout.';
comment on column households.stripe_subscription_id is 'Current Stripe Subscription id for this household, if any.';
comment on column households.stripe_price_id is 'Current Stripe Price id backing the household plan.';
comment on column households.subscription_current_period_end is 'Current paid period end from Stripe, if any.';
comment on column households.subscription_updated_at is 'Last time billing metadata was changed locally.';
