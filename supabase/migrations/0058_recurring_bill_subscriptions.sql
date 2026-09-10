-- Explicit "this recurring bill is a subscription" flag — same shape as
-- is_debt_payment (0031-era), an independent boolean rather than an
-- inferred category-name heuristic, so it's always visible/correctable
-- in the form rather than silently guessed. Drives the Recurring Bills
-- page splitting "everything that isn't a debt payment" into a real
-- Subscriptions section (Netflix, Spotify, etc.) separate from Bills &
-- Utilities, each with its own annualized total — mirrors a reference
-- design the user shared.
alter table recurring_bills
  add column is_subscription boolean not null default false;
