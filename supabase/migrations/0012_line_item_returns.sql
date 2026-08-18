-- Individual item returns/refunds. Editing a line item (0010/0011 +
-- app-layer follow-up) only ever rewrote what a receipt *said* — it never
-- represented "this specific item came back and money moved." That's a
-- real, separate event: a refund posts as its own dated transaction (often
-- days later, sometimes a different amount than the original price due to
-- a restocking fee), the same way a bank statement shows it — not a silent
-- edit to the original purchase's amount.
--
-- refund_transaction_id links a line item to the real `transactions` row
-- (type='refund') that paid it back; refunded_amount_cents records exactly
-- how much *this item's share* of that refund was, independent of the
-- refund transaction's own total — necessary because one refund
-- transaction can cover several returned items from the same trip, and
-- because restocking fees mean the refunded amount isn't always equal to
-- line_total_cents. "Returned" as a concept is derived (refund_transaction_id
-- is not null), not a separate boolean — there's no meaningful
-- "returned but no refund exists yet" state to represent (Personal
-- Finance Addendum discussion, 2026-08-18: refunds are a real linked
-- transaction, not a status flag with no money movement).

alter table scanned_receipt_line_items
  add column refund_transaction_id uuid references transactions(id) on delete set null,
  add column refunded_amount_cents integer check (refunded_amount_cents is null or refunded_amount_cents >= 0),
  add constraint scanned_receipt_line_items_refund_pair check ((refund_transaction_id is null) = (refunded_amount_cents is null));

create index scanned_receipt_line_items_refund_transaction_id_idx
  on scanned_receipt_line_items(refund_transaction_id) where refund_transaction_id is not null;

-- Same cross-household + shape validation style as validate_line_item_references()
-- in 0011 — a refund link must point at a real refund-type transaction in
-- the same household, not just any transaction.
create function validate_line_item_refund_reference()
returns trigger
language plpgsql
as $$
begin
  if new.refund_transaction_id is not null then
    if not exists (
      select 1 from transactions
      where id = new.refund_transaction_id
        and household_id = new.household_id
        and type = 'refund'
    ) then
      raise exception 'A line item can only be linked to a refund-type transaction in the same household.';
    end if;
  end if;
  return new;
end;
$$;

create trigger scanned_receipt_line_items_validate_refund_reference
  before insert or update of refund_transaction_id, household_id on scanned_receipt_line_items
  for each row execute function validate_line_item_refund_reference();
