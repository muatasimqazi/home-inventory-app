-- Real gap found live: a cancelled subscription correctly keeps its
-- current tier until the paid period actually ends (same "still
-- entitled, just won't renew" model both billing providers use — a
-- Stripe subscription's own status stays "active" with
-- cancel_at_period_end: true, and RevenueCat's CANCELLATION event is
-- deliberately a no-op on subscription_tier here too), but nothing in
-- the schema tracked that "won't renew" state at all, so the UI had no
-- way to show it — a real cancellation looked identical to an ordinary
-- active subscription, which reads as "cancelling did nothing."
alter table households add column subscription_cancel_at_period_end boolean not null default false;

comment on column households.subscription_cancel_at_period_end is 'True when the current paid period is the LAST one — the household stays at subscription_tier until subscription_current_period_end, then drops to free. Set from Stripe''s own cancel_at_period_end field, or from RevenueCat''s CANCELLATION/UNCANCELLATION events for the Apple path.';
