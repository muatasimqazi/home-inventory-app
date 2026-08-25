-- Real bug, found live in production: validate_account_plaid_item_household()
-- (0015_plaid_bank_sync.sql) was never marked `security definer`, so its
-- internal `select ... from plaid_items` ran as whatever role actually
-- issued the accounts update — for a real user, that's `authenticated`
-- via PostgREST, not service_role. plaid_items has RLS enabled with
-- *zero* policies for anon/authenticated by deliberate design (only
-- service_role can read it — see that migration's own comment on the
-- table). So the trigger's lookup always came back empty for a real
-- user's session, regardless of whether the row genuinely existed, and
-- it incorrectly concluded "Plaid item not found." — on *every* edit to
-- *every* genuinely, validly Plaid-linked account, for every real user,
-- since household_id (also in this trigger's `update of` column list) is
-- unconditionally present on every account update the app sends.
--
-- Confirmed live against local Supabase: the same update succeeded as
-- the postgres superuser (RLS bypassed) and failed with this exact
-- message as a real `authenticated` role on a genuinely-linked account.
--
-- security definer + search_path pin, the same pattern every other
-- cross-table RLS-bypassing check in this codebase already uses (e.g.
-- can_view_account() in 0010_finance_schema.sql, is_household_member()
-- in 0001_init.sql) — this function should always have used it.
create or replace function validate_account_plaid_item_household()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_household uuid;
begin
  if new.plaid_item_id is not null then
    select household_id into item_household from plaid_items where id = new.plaid_item_id;
    if item_household is null then
      raise exception 'Plaid item not found.';
    end if;
    if item_household <> new.household_id then
      raise exception 'Account''s Plaid item must belong to the same household as the account.';
    end if;
  end if;
  return new;
end;
$$;
