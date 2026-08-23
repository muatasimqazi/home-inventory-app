-- User-editable timezone preference (Settings > your profile), plus the
-- one server-side spot it actually needs to be threaded through today.
--
-- Per-membership, not a separate table — same shape display_name/
-- avatar_url already use (0001_init.sql's members(household_id, user_id)
-- composite key). A person's timezone doesn't really change per
-- household, but neither does their name in practice; this just follows
-- the existing convention rather than introducing a second one.
alter table members add column timezone text;

-- confirm_scanned_transaction_draft() (0011_receipt_scanning.sql) falls
-- back to `current_date` when the AI couldn't read a date off the
-- receipt at all — current_date runs on Postgres' own session clock
-- (UTC on Supabase), not the household's. A receipt scanned at, say,
-- 6pm Pacific is already past midnight UTC — current_date would land on
-- tomorrow from the scanning member's actual point of view. p_today
-- (new, optional) lets the client pass its own locally-computed "today"
-- (lib/format.ts's getLocalTodayIso(), honoring the member's timezone
-- above if set) instead; current_date remains the fallback of the
-- fallback, for any caller that doesn't pass one.
--
-- Postgres resolves overloaded functions by exact signature, not by
-- "same name, compatible via defaults" — `create or replace` with an
-- extra parameter creates a second, *additional* 4-arg overload sitting
-- alongside the original 3-arg one from 0011, rather than replacing it.
-- Any caller still invoking the 3-arg form then hits a genuine
-- "function ... is not unique" error, because Postgres can't tell
-- whether they meant the 3-arg exact match or the 4-arg one with
-- p_today defaulted — confirmed locally before this shipped. The old
-- signature has to go, explicitly, for there to be exactly one
-- confirm_scanned_transaction_draft again.
drop function if exists confirm_scanned_transaction_draft(uuid, uuid, uuid);

create or replace function confirm_scanned_transaction_draft(
  p_draft_id uuid,
  p_account_id uuid,
  p_category_id uuid default null,
  p_today date default null
)
returns transactions
language plpgsql
as $$
declare
  draft scanned_transaction_drafts;
  new_transaction transactions;
begin
  select * into draft from scanned_transaction_drafts where id = p_draft_id;
  if draft.id is null then
    raise exception 'Draft not found.';
  end if;
  if draft.status <> 'pending' then
    raise exception 'This draft has already been %.', draft.status;
  end if;
  if not exists (select 1 from accounts where id = p_account_id and household_id = draft.household_id) then
    raise exception 'Account must belong to the same household as the draft.';
  end if;

  insert into transactions (
    household_id, account_id, occurred_at, amount, type,
    category_id, merchant, description, notes, status, source,
    created_by_user_id
  ) values (
    draft.household_id, p_account_id, coalesce(draft.suggested_date, p_today, current_date),
    -abs(coalesce(draft.suggested_amount_cents, 0)) / 100.0, -- a receipt is always money out
    'expense',
    coalesce(p_category_id, draft.suggested_category_id),
    draft.store, draft.store, '', 'posted', 'receipt_scan',
    auth.uid()
  )
  returning * into new_transaction;

  update scanned_receipt_line_items set transaction_id = new_transaction.id where draft_id = p_draft_id;

  update scanned_transaction_drafts
  set status = 'confirmed', resulting_transaction_id = new_transaction.id, account_id = p_account_id
  where id = p_draft_id;

  update receipt_scan_batches
  set confirmed_count = confirmed_count + 1, updated_at = now()
  where id = draft.batch_id;

  return new_transaction;
end;
$$;
