-- "Show who added a joint account" — accounts never tracked a creator,
-- unlike transactions/recurring_bills (both have created_by_user_id
-- already, same pattern reused here).
alter table accounts
  add column created_by_user_id uuid references auth.users(id) on delete set null;

-- Backfill existing rows on a best-effort basis — any account with no
-- source below just stays null, and the UI simply omits the avatar for
-- those rather than guessing.
--
-- 1. Manually-created accounts: the earliest 'created' activity_log
--    entry for that account (createAccount has logged this since
--    0010_finance_schema.sql first let 'account' be a valid entity_type).
update accounts a
set created_by_user_id = sub.actor_user_id
from (
  select distinct on (entity_id) entity_id, actor_user_id
  from activity_log
  where entity_type = 'account' and action = 'created'
  order by entity_id, created_at asc
) sub
where a.id = sub.entity_id and a.created_by_user_id is null;

-- 2. Plaid-linked accounts: whoever connected the bank (plaid_items
--    already tracks this) is the natural "who added this" answer for an
--    account that was never created through the manual form at all.
update accounts a
set created_by_user_id = pi.created_by_user_id
from plaid_items pi
where a.plaid_item_id = pi.id and a.created_by_user_id is null;
