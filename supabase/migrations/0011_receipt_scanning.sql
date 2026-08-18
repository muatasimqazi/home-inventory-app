-- Receipt scanning (Phase 3 of the implementation plan) — schema for
-- docs/Receipt Scanning Addendum.md §3/§6: photograph a receipt (or a
-- stack of receipts/a statement), AI extracts store/date/total/line
-- items, human reviews, confirms into a real `transactions` row with the
-- receipt image retained permanently and full line-item detail queryable
-- underneath.
--
-- Four new tables: receipt_scan_batches (one scan session, 1+ photos),
-- scanned_transaction_drafts (one row per candidate transaction — one
-- receipt's total — the review-stage holding area, mirroring how
-- csv_import_batches relates to the transactions it eventually creates),
-- scanned_receipt_line_items (full per-item detail, survives past
-- confirmation as permanent structure on the resulting transaction, not
-- discarded once the draft's job is done), transaction_attachments (the
-- permanently-retained receipt image itself).
--
-- Deliberate scope simplification, not an oversight: batches/drafts/line-
-- items use plain household-membership RLS, not the account-privacy-aware
-- predicate transactions/accounts get. They're pre-confirmation review-
-- stage data, not yet real ledger entries — any household member can help
-- review a scan batch regardless of which account a draft eventually
-- resolves to, matching "review-stage holding area" framing in the
-- Addendum. Real privacy only applies once a draft is *confirmed* into an
-- actual `transactions` row, which inherits the normal can_view_account()
-- predicate like any other transaction. transaction_attachments is the
-- one table here that DOES get the privacy-aware predicate, since a
-- receipt image can reveal real purchase detail on what might be a
-- private account.

create table receipt_scan_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  source_image_paths text[] not null default '{}', -- Storage paths, one or more photos/pages in one scan session
  status text not null default 'processing' check (status in ('processing', 'ready_for_review', 'confirmed', 'failed')),
  detected_count integer not null default 0,
  confirmed_count integer not null default 0,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index receipt_scan_batches_household_id_idx on receipt_scan_batches(household_id);

create table scanned_transaction_drafts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  batch_id uuid not null references receipt_scan_batches(id) on delete cascade,
  store text,
  suggested_date date,
  -- *_cents (not the numeric-dollars shape `transactions.amount` uses) —
  -- deliberate: this is what the AI extraction naturally produces at the
  -- review stage, and integer cents avoid float-rounding noise while a
  -- draft is still being edited. Converted to numeric dollars only once,
  -- at confirm_scanned_transaction_draft() below, the single boundary
  -- where a draft becomes a real ledger row.
  subtotal_cents integer,
  tax_cents integer,
  suggested_amount_cents integer,
  suggested_category_id uuid references categories(id),
  category_source text check (category_source in ('rule_match', 'ai_suggestion', 'user_corrected')),
  confidence numeric(3,2) check (confidence >= 0 and confidence <= 1),
  needs_review boolean not null default false,
  review_reason text,
  bounding_box jsonb, -- {x,y,width,height}, normalized 0-1, same shape as DetectedItem's — which receipt on a multi-receipt photo this is
  photo_index integer not null default 0, -- which image in the batch's source_image_paths this receipt was found on
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'dismissed')),
  resulting_transaction_id uuid references transactions(id), -- set once confirmed
  account_id uuid references accounts(id) -- nullable until resolved via card_last_four match or picked during review (Addendum §6)
);

create index scanned_transaction_drafts_household_id_idx on scanned_transaction_drafts(household_id);
create index scanned_transaction_drafts_batch_id_idx on scanned_transaction_drafts(batch_id);

create table scanned_receipt_line_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  draft_id uuid not null references scanned_transaction_drafts(id) on delete cascade,
  transaction_id uuid references transactions(id), -- nullable until the parent draft is confirmed, set alongside draft_id (not replacing it) at that point
  raw_item text not null,
  standard_name text,
  brand text,
  category_guess_id uuid references categories(id),
  subcategory_guess_id uuid references categories(id),
  subcategory_guess_text text, -- the AI's raw guess, kept even if it didn't resolve to a real subcategory
  quantity numeric(10,2) not null default 1,
  unit_price_cents integer,
  line_total_cents integer,
  confidence numeric(3,2) check (confidence >= 0 and confidence <= 1)
);

create index scanned_receipt_line_items_draft_id_idx on scanned_receipt_line_items(draft_id);
create index scanned_receipt_line_items_transaction_id_idx on scanned_receipt_line_items(transaction_id) where transaction_id is not null;

create table transaction_attachments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  storage_path text not null, -- reuses the existing private "attachments" bucket (0003_attachments_storage.sql), path `${householdId}/${attachmentId}` — same shape as item attachments, no new bucket needed for one more consumer of an already-generic private-storage pattern
  content_type text not null check (content_type like 'image/%' or content_type = 'application/pdf'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  -- The *specific receipt* this image came from, not the batch — a bulk
  -- statement scan can produce several transactions from one batch;
  -- pointing at the batch would lose which of several source images
  -- belongs to which transaction. Null for a manually-attached receipt
  -- added later, outside this feature.
  source_draft_id uuid references scanned_transaction_drafts(id) on delete set null,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index transaction_attachments_transaction_id_idx on transaction_attachments(transaction_id);

-- ---------------------------------------------------------------------------
-- Cross-household reference validation, same style as every other table in
-- this schema.
-- ---------------------------------------------------------------------------

create function validate_scanned_draft_references()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from receipt_scan_batches where id = new.batch_id and household_id = new.household_id) then
    raise exception 'Draft must belong to the same household as its scan batch.';
  end if;
  if new.account_id is not null and not exists (select 1 from accounts where id = new.account_id and household_id = new.household_id) then
    raise exception 'Draft account must belong to the same household as the draft.';
  end if;
  return new;
end;
$$;

create trigger scanned_transaction_drafts_validate_references
  before insert or update of batch_id, household_id, account_id on scanned_transaction_drafts
  for each row execute function validate_scanned_draft_references();

create function validate_line_item_references()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from scanned_transaction_drafts where id = new.draft_id and household_id = new.household_id) then
    raise exception 'Line item must belong to the same household as its draft.';
  end if;
  return new;
end;
$$;

create trigger scanned_receipt_line_items_validate_references
  before insert or update of draft_id, household_id on scanned_receipt_line_items
  for each row execute function validate_line_item_references();

create function validate_transaction_attachment_references()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from transactions where id = new.transaction_id and household_id = new.household_id) then
    raise exception 'Attachment must belong to the same household as its transaction.';
  end if;
  return new;
end;
$$;

create trigger transaction_attachments_validate_references
  before insert or update of transaction_id, household_id on transaction_attachments
  for each row execute function validate_transaction_attachment_references();

-- ---------------------------------------------------------------------------
-- confirm_scanned_transaction_draft() — atomically turns one reviewed
-- draft into a real transaction. SECURITY INVOKER (not DEFINER, unlike
-- create_household()/accept_invite() in 0001_init.sql): every write this
-- makes (transactions insert, scanned_receipt_line_items update, draft
-- update, batch counter bump) is already something the calling household
-- member's own RLS grants let them do directly — there's no "prove
-- membership before your first row exists" bootstrapping problem here the
-- way there is for household creation, so running as the caller's own
-- privileges (and therefore still fully RLS-checked at every statement)
-- is both simpler and safer than reaching for elevated privileges that
-- aren't actually needed. One function call = one implicit transaction,
-- which is the actual point: a draft can't end up half-confirmed (a real
-- transaction created but the draft/line-items left dangling, or vice
-- versa) the way three or four separate client-side writes risks on a
-- mid-sequence failure.
create function confirm_scanned_transaction_draft(
  p_draft_id uuid,
  p_account_id uuid,
  p_category_id uuid default null
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
    draft.household_id, p_account_id, coalesce(draft.suggested_date, current_date),
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

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table receipt_scan_batches enable row level security;
alter table scanned_transaction_drafts enable row level security;
alter table scanned_receipt_line_items enable row level security;
alter table transaction_attachments enable row level security;

create policy "household member read/write" on receipt_scan_batches
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "household member read/write" on scanned_transaction_drafts
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "household member read/write" on scanned_receipt_line_items
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

-- Privacy-aware, unlike the three above — a receipt image can show real
-- purchase detail on what might be a private account, so this follows
-- transactions' own can_view_account() predicate, not plain membership.
create policy "household member read/write, privacy-aware" on transaction_attachments
  for all using (can_view_account((select account_id from transactions where id = transaction_id)))
  with check (can_view_account((select account_id from transactions where id = transaction_id)));

-- ---------------------------------------------------------------------------
-- Realtime — same publication every other Finance table joined.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'receipt_scan_batches', 'scanned_transaction_drafts',
    'scanned_receipt_line_items', 'transaction_attachments'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
