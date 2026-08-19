-- Lets a household member add a line item directly to an already-confirmed
-- transaction — the real gap this closes: a real Costco receipt (35 items,
-- two sections with per-item instant-savings discounts) extracted its
-- store/date/subtotal/tax/total correctly but returned zero line items;
-- runExtraction()'s own fallback confidence for that case still confirmed
-- the transaction with an empty itemized breakdown and no way to add one
-- afterward short of a full re-scan. draft_id was NOT NULL, which assumed
-- every line item traces back to an AI-extraction review session — untrue
-- for one a person types in by hand after the fact.
alter table scanned_receipt_line_items alter column draft_id drop not null;

-- Manually-added items skip the draft/review stage entirely and attach
-- straight to a real transaction, so at least one of draft_id/
-- transaction_id must be set — never a fully orphaned row. Also closes a
-- pre-existing gap in the same function: transaction_id was never
-- validated at all (only draft_id was), despite every other cross-
-- reference trigger in this schema checking every FK it has.
create or replace function validate_line_item_references()
returns trigger
language plpgsql
as $$
begin
  if new.draft_id is null and new.transaction_id is null then
    raise exception 'A line item must be attached to either a draft or a transaction.';
  end if;
  if new.draft_id is not null and not exists (select 1 from scanned_transaction_drafts where id = new.draft_id and household_id = new.household_id) then
    raise exception 'Line item must belong to the same household as its draft.';
  end if;
  if new.transaction_id is not null and not exists (select 1 from transactions where id = new.transaction_id and household_id = new.household_id) then
    raise exception 'Line item must belong to the same household as its transaction.';
  end if;
  return new;
end;
$$;

drop trigger if exists scanned_receipt_line_items_validate_references on scanned_receipt_line_items;
create trigger scanned_receipt_line_items_validate_references
  before insert or update of draft_id, transaction_id, household_id on scanned_receipt_line_items
  for each row execute function validate_line_item_references();
