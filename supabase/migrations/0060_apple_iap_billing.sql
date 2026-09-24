-- iOS App Store rejection (Guideline 3.1.1): the app can't unlock paid
-- Plus/Pro tiers via Stripe (even via an external browser redirect) on
-- iOS without also offering In-App Purchase. Adds an Apple/RevenueCat
-- billing path alongside the existing Stripe one (0049) — households
-- can now be paid through either provider, tracked by which currently
-- owns the subscription.
--
-- RevenueCat is the app_user_id for these purchases — set to the
-- household's own id (households.id), the same "one owner pays for the
-- shared household workspace" model Stripe already uses
-- (client_reference_id: householdId in billing/checkout/route.ts) —
-- not a per-user id, so no new mapping table is needed: RevenueCat's
-- webhook events carry the household id directly as app_user_id.
alter table households add column billing_provider text;

alter table households
  add constraint households_billing_provider_check
  check (billing_provider is null or billing_provider in ('stripe', 'apple'));

comment on column households.billing_provider is 'Which system currently owns this household''s paid subscription, if any: ''stripe'' (web/Android checkout) or ''apple'' (iOS In-App Purchase via RevenueCat). Null for a free household. subscription_tier/subscription_status/subscription_current_period_end are shared fields either provider writes to — this column is just which one last wrote them, so a webhook from the *other* provider doesn''t clobber an active subscription it doesn''t actually own.';

-- RevenueCat's own transaction id for the current entitlement, for
-- support/debugging (looking a household up in the RevenueCat
-- dashboard) — same role stripe_subscription_id already plays for the
-- Stripe path. Nullable/not unique: unlike Stripe's real subscription
-- object id, this is just the latest transaction RevenueCat told us
-- about, useful for cross-referencing rather than as a stable foreign
-- key.
alter table households add column apple_original_transaction_id text;
comment on column households.apple_original_transaction_id is 'Latest Apple original_transaction_id RevenueCat reported for this household''s subscription, if billed through Apple. For support/debugging lookups in the RevenueCat dashboard, not a stable identifier to join on.';
