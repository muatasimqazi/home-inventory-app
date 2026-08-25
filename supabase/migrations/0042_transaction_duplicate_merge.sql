-- Duplicate-transaction prevention (receipt scan + bank sync) — parts D
-- and E of the plan. Two new RPCs, both plain `language plpgsql` with no
-- explicit security clause (SECURITY INVOKER, Postgres' default) — same
-- shape as confirm_scanned_transaction_draft() (0011/0030), so the
-- calling user's own RLS grants (household membership on the review-
-- stage tables, the privacy-aware can_view_account() predicate on
-- transactions itself) are what actually authorize every read/write
-- inside these functions, not a bespoke check duplicated here.

-- attach_scanned_draft_to_transaction(): the "reverse direction" fix —
-- when a receipt is reviewed and turns out to be a bank-synced charge
-- that already exists as a transaction, this attaches the receipt's line
-- items to that EXISTING transaction instead of confirm_scanned_
-- transaction_draft()'s usual behavior of inserting a brand new one.
-- Mirrors that function's structure closely on purpose — same draft
-- validation, same line-item reassignment, same batch bookkeeping —
-- just without ever calling `insert into transactions`.
create function attach_scanned_draft_to_transaction(
  p_draft_id uuid,
  p_transaction_id uuid,
  p_category_id uuid default null
)
returns transactions
language plpgsql
as $$
declare
  draft scanned_transaction_drafts;
  target transactions;
begin
  select * into draft from scanned_transaction_drafts where id = p_draft_id;
  if draft.id is null then
    raise exception 'Draft not found.';
  end if;
  if draft.status <> 'pending' then
    raise exception 'This draft has already been %.', draft.status;
  end if;

  select * into target from transactions where id = p_transaction_id;
  if target.id is null then
    raise exception 'Transaction not found.';
  end if;
  if target.household_id <> draft.household_id then
    raise exception 'Transaction must belong to the same household as the draft.';
  end if;
  if target.trashed_at is not null then
    raise exception 'Cannot attach to a trashed transaction.';
  end if;

  update scanned_receipt_line_items set transaction_id = p_transaction_id where draft_id = p_draft_id;

  -- Fill the category gap only if the existing transaction doesn't
  -- already have one — never overwrite what the bank sync (or the
  -- household) already resolved. Same "don't clobber what's already
  -- there" posture the app's own updateTransaction()/userEdited gate
  -- uses for Plaid refreshes (src/lib/store.ts).
  update transactions
  set category_id = coalesce(category_id, p_category_id, draft.suggested_category_id)
  where id = p_transaction_id
  returning * into target;

  update scanned_transaction_drafts
  set status = 'confirmed', resulting_transaction_id = p_transaction_id, account_id = target.account_id
  where id = p_draft_id;

  update receipt_scan_batches
  set confirmed_count = confirmed_count + 1, updated_at = now()
  where id = draft.batch_id;

  return target;
end;
$$;

-- merge_transactions(): the manual fallback for two transactions that
-- already exist as separate rows for the same real charge (either an
-- older duplicate from before this fix shipped, or a case the automated
-- checks still miss). Moves every piece of "receipt detail" from the
-- discarded row onto the kept one, fills category/notes gaps (never
-- overwrites), then trashes the discarded row through the normal
-- retention window rather than a hard delete.
create function merge_transactions(
  p_keep_transaction_id uuid,
  p_discard_transaction_id uuid
)
returns transactions
language plpgsql
as $$
declare
  keep_txn transactions;
  discard_txn transactions;
begin
  if p_keep_transaction_id = p_discard_transaction_id then
    raise exception 'Cannot merge a transaction with itself.';
  end if;

  select * into keep_txn from transactions where id = p_keep_transaction_id;
  select * into discard_txn from transactions where id = p_discard_transaction_id;
  if keep_txn.id is null or discard_txn.id is null then
    raise exception 'Transaction not found.';
  end if;
  if keep_txn.household_id <> discard_txn.household_id then
    raise exception 'Both transactions must belong to the same household.';
  end if;
  if keep_txn.trashed_at is not null or discard_txn.trashed_at is not null then
    raise exception 'Cannot merge a trashed transaction.';
  end if;
  if keep_txn.linked_transaction_id is not null or discard_txn.linked_transaction_id is not null then
    raise exception 'Cannot merge a transfer/payment leg — it already represents a real reciprocal pair, not a duplicate.';
  end if;

  update transaction_attachments set transaction_id = p_keep_transaction_id where transaction_id = p_discard_transaction_id;
  update scanned_receipt_line_items set transaction_id = p_keep_transaction_id where transaction_id = p_discard_transaction_id;
  update item_purchases set transaction_id = p_keep_transaction_id where transaction_id = p_discard_transaction_id;

  -- transaction_categories has a unique(transaction_id, category_id)
  -- constraint — drop any discard-side tag the kept row already carries
  -- before reassigning the rest, or the plain UPDATE below would hit a
  -- duplicate-key error on the first overlapping tag.
  delete from transaction_categories
  where transaction_id = p_discard_transaction_id
    and category_id in (select category_id from transaction_categories where transaction_id = p_keep_transaction_id);
  update transaction_categories set transaction_id = p_keep_transaction_id where transaction_id = p_discard_transaction_id;

  -- plaid_transaction_id has a unique constraint (transactions_
  -- plaid_transaction_id_key) — cleared off the discard row FIRST, as
  -- its own statement, before ever being written onto the kept row.
  -- Setting it on keep_txn in the same statement discard_txn still holds
  -- the identical value would hit that constraint immediately (unique
  -- checks aren't deferred by default), even though the two rows are
  -- headed for exactly one surviving value between them.
  if discard_txn.plaid_transaction_id is not null then
    update transactions set plaid_transaction_id = null where id = p_discard_transaction_id;
  end if;

  update transactions
  set
    category_id = coalesce(keep_txn.category_id, discard_txn.category_id),
    notes = case when coalesce(keep_txn.notes, '') = '' then discard_txn.notes else keep_txn.notes end,
    plaid_transaction_id = coalesce(keep_txn.plaid_transaction_id, discard_txn.plaid_transaction_id),
    merchant_logo_url = coalesce(keep_txn.merchant_logo_url, discard_txn.merchant_logo_url),
    updated_at = now()
  where id = p_keep_transaction_id
  returning * into keep_txn;

  update transactions
  set trashed_at = now(), permanently_delete_after = now() + interval '30 days'
  where id = p_discard_transaction_id;

  return keep_txn;
end;
$$;
