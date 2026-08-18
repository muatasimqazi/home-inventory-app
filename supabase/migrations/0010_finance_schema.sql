-- Finance domain — core ledger schema (Phase 1 of the implementation plan).
--
-- Source of truth: docs/Personal Finance PRD.md (§10 Core Entities, §30-33)
-- and docs/Personal Finance Addendum.md ("Privacy model", "Data model
-- additions"). Table shapes and the RLS predicates below are taken
-- directly from the Addendum's condensed schema block — this migration is
-- that block made real, not a fresh design pass.
--
-- Scoped to the core ledger loop only (Dashboard → Accounts → Transactions
-- → Categories → Recurring Bills → Net Worth → Activity). Receipt
-- scanning's own tables (receipt_scan_batches, scanned_transaction_drafts,
-- scanned_receipt_line_items, transaction_attachments — Receipt Scanning
-- Addendum) land in a later migration alongside that feature's own code
-- (Phase 3), not here.
--
-- Reuses Shohaz's existing conventions exactly, per PRD §34/Addendum §"same
-- conventions as Shohaz": households(id)/members(household_id,user_id,role)
-- from 0001_init.sql, is_household_member()/is_household_owner() helper
-- functions, the status/trashed_at/permanently_delete_after lifecycle
-- shape from locations/containers/items, and activity_log reused directly
-- (no new finance-specific audit table).
--
-- Money columns use numeric(12,2), signed (negative = money out, positive
-- = money in) — matches how every mockup renders amounts ("-$86.40",
-- "+$3,120.00") and means current_balance = starting_balance + Σ(amount)
-- with no type-based sign-flipping logic needed anywhere, including in
-- the balance trigger below.

-- ---------------------------------------------------------------------------
-- Accounts, and the privacy layer around them
-- ---------------------------------------------------------------------------

create table accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('checking', 'savings', 'credit_card', 'cash', 'loan', 'mortgage', 'investment')),
  institution_name text,
  current_balance numeric(12,2) not null default 0, -- denormalized, kept live by transactions_recompute_balance() below
  available_balance numeric(12,2), -- manual (credit cards etc.) — never auto-overwritten, PRD §14
  starting_balance numeric(12,2) not null default 0,
  card_last_four text check (card_last_four ~ '^[0-9]{4}$'), -- Receipt Scanning Addendum §6 — drives receipt→account matching
  -- Privacy model (Personal Finance Addendum, "Privacy model", 2026-08-18):
  -- null = joint/household account, visible to everyone — the default,
  -- zero change to the common case. Set = personal, private by default to
  -- that one member; see finance_account_shares for explicit opt-in grants.
  owner_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived', 'trashed')),
  opened_at timestamptz,
  trashed_at timestamptz,
  permanently_delete_after timestamptz
);

create index accounts_household_id_idx on accounts(household_id);
create index accounts_owner_user_id_idx on accounts(owner_user_id) where owner_user_id is not null;
create index accounts_status_idx on accounts(household_id, status);

-- Explicit per-member opt-in grant onto a personal account. No row = not
-- shared with that member. Deliberately not an all-or-nothing household
-- toggle — a member shares a specific private account with specific other
-- members (Addendum, "Privacy model").
create table finance_account_shares (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  shared_with_user_id uuid not null references auth.users(id) on delete cascade,
  shared_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (account_id, shared_with_user_id)
);

create index finance_account_shares_account_id_idx on finance_account_shares(account_id);
create index finance_account_shares_shared_with_user_id_idx on finance_account_shares(shared_with_user_id);

-- Visibility check reused by every table below that inherits an account's
-- privacy transitively via account_id (PRD §32.8, Addendum RLS section).
-- security definer + stable so it can read accounts/finance_account_shares
-- regardless of the caller's own row-level policy state, same pattern as
-- is_household_member() in 0001_init.sql.
create function can_view_account(target_account_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from accounts a
    where a.id = target_account_id
      and is_household_member(a.household_id)
      and (
        a.owner_user_id is null
        or a.owner_user_id = auth.uid()
        or exists (
          select 1 from finance_account_shares s
          where s.account_id = a.id and s.shared_with_user_id = auth.uid()
        )
      )
  );
$$;

-- Owner-must-be-a-member validation, same shape as sync_item_location()'s
-- owner_user_id check in 0001_init.sql. Shared across accounts and
-- recurring_bills since both tables have the same (owner_user_id,
-- household_id) columns — one function, two triggers below.
create function validate_owner_is_household_member()
returns trigger
language plpgsql
as $$
begin
  if new.owner_user_id is not null and not exists (
    select 1 from members where household_id = new.household_id and user_id = new.owner_user_id
  ) then
    raise exception 'Owner must be a member of the account''s household.';
  end if;
  return new;
end;
$$;

create trigger accounts_validate_owner
  before insert or update of owner_user_id, household_id on accounts
  for each row execute function validate_owner_is_household_member();

-- Cross-household + self-share validation for share grants (mirrors
-- validate_container_location_household()'s style in 0001_init.sql).
create function validate_finance_account_share()
returns trigger
language plpgsql
as $$
declare
  acct accounts;
begin
  select * into acct from accounts where id = new.account_id;
  if acct.id is null then
    raise exception 'Account not found.';
  end if;
  if acct.household_id <> new.household_id then
    raise exception 'Share must belong to the same household as the account.';
  end if;
  if acct.owner_user_id is null then
    raise exception 'Cannot share a joint account — it is already visible to the whole household.';
  end if;
  if new.shared_with_user_id = acct.owner_user_id then
    raise exception 'Cannot share an account with its own owner.';
  end if;
  if not exists (select 1 from members where household_id = new.household_id and user_id = new.shared_with_user_id) then
    raise exception 'Can only share an account with a member of the same household.';
  end if;
  return new;
end;
$$;

create trigger finance_account_shares_validate
  before insert or update on finance_account_shares
  for each row execute function validate_finance_account_share();

-- ---------------------------------------------------------------------------
-- Categories & rules — household-wide, no privacy (Addendum: "a shared
-- categorization taxonomy isn't the kind of thing that needs privacy").
-- ---------------------------------------------------------------------------

create table categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade, -- null = system default category, shared/read-only
  name text not null,
  parent_category_id uuid references categories(id) on delete set null, -- one level of nesting; deeper nesting is app-enforced, not a DB constraint (same looseness as containers' cycle-only DB check)
  is_default boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived', 'trashed')),
  trashed_at timestamptz,
  permanently_delete_after timestamptz
);

create index categories_household_id_idx on categories(household_id);

create table category_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  match_field text not null check (match_field in ('merchant', 'description')),
  match_type text not null default 'contains' check (match_type in ('contains', 'exact')),
  match_value text not null,
  category_id uuid not null references categories(id) on delete cascade,
  applies_from timestamptz not null default now(), -- forward-only (PRD §16/§32.1), never retroactive
  created_at timestamptz not null default now()
);

create index category_rules_household_id_idx on category_rules(household_id);

-- Blocks trashing a category still referenced by a non-trashed transaction
-- — PRD §32.6's resolution ("block, require explicit reassignment") made a
-- database-level invariant, not just a UI guard. References `transactions`,
-- so this trigger is created after that table exists, further down.

-- ---------------------------------------------------------------------------
-- Transactions & balance snapshots — visibility inherited via account_id,
-- no privacy field of their own (Addendum, "Privacy model").
-- ---------------------------------------------------------------------------

create table transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  occurred_at date not null,
  posted_at date,
  amount numeric(12,2) not null, -- signed: negative = money out, positive = money in
  type text not null check (type in ('expense', 'income', 'transfer', 'payment', 'refund')),
  category_id uuid references categories(id),
  merchant text,
  description text,
  notes text not null default '',
  status text not null default 'posted' check (status in ('pending', 'posted')), -- bank posting state, distinct from trash lifecycle below
  excluded_from_reports boolean not null default false,
  linked_transaction_id uuid references transactions(id), -- self-FK; both legs of a transfer/payment point at each other
  source text not null default 'manual' check (source in ('manual', 'csv_import', 'receipt_scan')),
  import_batch_id uuid, -- FK added to csv_import_batches further down, once that table exists
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trashed_at timestamptz,
  permanently_delete_after timestamptz,
  constraint transactions_not_self_linked check (linked_transaction_id is distinct from id)
);

create index transactions_household_id_idx on transactions(household_id);
create index transactions_account_id_idx on transactions(account_id);
create index transactions_category_id_idx on transactions(category_id) where category_id is not null;
create index transactions_linked_transaction_id_idx on transactions(linked_transaction_id) where linked_transaction_id is not null;
create index transactions_status_idx on transactions(household_id, status);

-- Cross-household reference validation, same style as 0001_init.sql's
-- validate_container_location_household()/sync_item_location() — every
-- FK'd reference must resolve to the transaction's own household, not
-- just the primary account_id.
create function validate_transaction_references()
returns trigger
language plpgsql
as $$
declare
  account_household uuid;
  category_household uuid;
begin
  select household_id into account_household from accounts where id = new.account_id;
  if account_household is null then
    raise exception 'Account not found.';
  end if;
  if account_household <> new.household_id then
    raise exception 'Transaction account must belong to the same household as the transaction.';
  end if;

  if new.category_id is not null then
    select household_id into category_household from categories where id = new.category_id;
    if category_household is not null and category_household <> new.household_id then
      raise exception 'Transaction category must belong to the same household as the transaction.';
    end if;
  end if;

  return new;
end;
$$;

create trigger transactions_validate_references
  before insert or update of account_id, household_id, category_id on transactions
  for each row execute function validate_transaction_references();

-- Balance computation — resolved PRD §32.2: Postgres trigger, real-time,
-- not scheduled. current_balance = starting_balance + Σ(non-trashed
-- transactions.amount) for that account. Recomputes whichever account(s)
-- a write actually touches (old and new account_id on UPDATE, so moving a
-- transaction between accounts corrects both sides).
create function recompute_account_balance(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update accounts
  set current_balance = starting_balance + coalesce((
    select sum(amount) from transactions
    where account_id = p_account_id and trashed_at is null
  ), 0)
  where id = p_account_id;
end;
$$;

create function transactions_recompute_balance()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform recompute_account_balance(old.account_id);
    return old;
  end if;

  perform recompute_account_balance(new.account_id);
  if tg_op = 'UPDATE' and old.account_id is distinct from new.account_id then
    perform recompute_account_balance(old.account_id);
  end if;
  return new;
end;
$$;

create trigger transactions_balance_trigger
  after insert or delete or update of amount, account_id, trashed_at on transactions
  for each row execute function transactions_recompute_balance();

-- Linked transfer/payment pairs trash together (PRD §33) — trashing one
-- leg trashes its counterpart. The "and trashed_at is null" guard on the
-- nested UPDATE is what stops this from recursing infinitely: by the time
-- the counterpart's own AFTER trigger fires and tries to cascade back,
-- the original row's trashed_at is already set, so its WHERE clause
-- matches nothing.
create function cascade_trash_linked_transaction()
returns trigger
language plpgsql
as $$
begin
  if new.trashed_at is not null and old.trashed_at is null and new.linked_transaction_id is not null then
    update transactions
    set trashed_at = new.trashed_at, permanently_delete_after = new.permanently_delete_after
    where id = new.linked_transaction_id and trashed_at is null;
  end if;
  return new;
end;
$$;

create trigger transactions_cascade_trash_linked
  after update of trashed_at on transactions
  for each row execute function cascade_trash_linked_transaction();

-- Now that `transactions` exists: PRD §32.6's block-on-trash-if-referenced
-- rule for categories.
create function prevent_trash_referenced_category()
returns trigger
language plpgsql
as $$
begin
  if new.trashed_at is not null and old.trashed_at is null then
    if exists (select 1 from transactions where category_id = new.id and trashed_at is null) then
      raise exception 'Cannot trash a category still referenced by transactions. Reassign or archive instead.';
    end if;
  end if;
  return new;
end;
$$;

create trigger categories_prevent_trash_referenced
  before update of trashed_at on categories
  for each row execute function prevent_trash_referenced_category();

create table account_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  balance numeric(12,2) not null,
  as_of_date date not null,
  source text not null default 'scheduled' check (source in ('scheduled', 'manual')),
  created_at timestamptz not null default now()
  -- No household_id/visibility field of its own — inherited via account_id (Addendum).
);

create index account_balance_snapshots_account_id_idx on account_balance_snapshots(account_id, as_of_date desc);

-- ---------------------------------------------------------------------------
-- Recurring bills — same privacy shape as accounts (owner_user_id +
-- finance_bill_shares), manual only, no pattern detection (PRD §18).
-- ---------------------------------------------------------------------------

create table recurring_bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  expected_amount numeric(12,2) not null,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  next_due_date date not null,
  category_id uuid references categories(id),
  account_id uuid references accounts(id),
  owner_user_id uuid references auth.users(id) on delete set null, -- same nullable joint-vs-personal shape as accounts
  is_active boolean not null default true, -- paused/resumed, distinct from trash lifecycle below
  trashed_at timestamptz,
  permanently_delete_after timestamptz
);

create index recurring_bills_household_id_idx on recurring_bills(household_id);
create index recurring_bills_owner_user_id_idx on recurring_bills(owner_user_id) where owner_user_id is not null;

create trigger recurring_bills_validate_owner
  before insert or update of owner_user_id, household_id on recurring_bills
  for each row execute function validate_owner_is_household_member();

create table finance_bill_shares (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  bill_id uuid not null references recurring_bills(id) on delete cascade,
  shared_with_user_id uuid not null references auth.users(id) on delete cascade,
  shared_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (bill_id, shared_with_user_id)
);

create index finance_bill_shares_bill_id_idx on finance_bill_shares(bill_id);
create index finance_bill_shares_shared_with_user_id_idx on finance_bill_shares(shared_with_user_id);

-- Defined after finance_bill_shares exists, since it queries that table.
create function can_view_recurring_bill(target_bill_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from recurring_bills b
    where b.id = target_bill_id
      and is_household_member(b.household_id)
      and (
        b.owner_user_id is null
        or b.owner_user_id = auth.uid()
        or exists (
          select 1 from finance_bill_shares s
          where s.bill_id = b.id and s.shared_with_user_id = auth.uid()
        )
      )
  );
$$;

create function validate_finance_bill_share()
returns trigger
language plpgsql
as $$
declare
  bill recurring_bills;
begin
  select * into bill from recurring_bills where id = new.bill_id;
  if bill.id is null then
    raise exception 'Recurring bill not found.';
  end if;
  if bill.household_id <> new.household_id then
    raise exception 'Share must belong to the same household as the bill.';
  end if;
  if bill.owner_user_id is null then
    raise exception 'Cannot share a joint bill — it is already visible to the whole household.';
  end if;
  if new.shared_with_user_id = bill.owner_user_id then
    raise exception 'Cannot share a bill with its own owner.';
  end if;
  if not exists (select 1 from members where household_id = new.household_id and user_id = new.shared_with_user_id) then
    raise exception 'Can only share a bill with a member of the same household.';
  end if;
  return new;
end;
$$;

create trigger finance_bill_shares_validate
  before insert or update on finance_bill_shares
  for each row execute function validate_finance_bill_share();

-- ---------------------------------------------------------------------------
-- CSV import batches — visibility inherited via account_id (Addendum).
-- ---------------------------------------------------------------------------

create table csv_import_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  file_name text not null,
  column_mapping jsonb not null default '{}'::jsonb,
  imported_at timestamptz,
  row_count integer not null default 0,
  duplicate_count integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'imported', 'failed')),
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index csv_import_batches_household_id_idx on csv_import_batches(household_id);
create index csv_import_batches_account_id_idx on csv_import_batches(account_id);

alter table transactions add constraint transactions_import_batch_id_fkey
  foreign key (import_batch_id) references csv_import_batches(id) on delete set null;

create function validate_csv_import_batch_household()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from accounts where id = new.account_id and household_id = new.household_id) then
    raise exception 'CSV import batch account must belong to the same household as the batch.';
  end if;
  return new;
end;
$$;

create trigger csv_import_batches_validate_household
  before insert or update of account_id, household_id on csv_import_batches
  for each row execute function validate_csv_import_batch_household();

-- ---------------------------------------------------------------------------
-- Deleting an account moves its transactions to Trash together (PRD §33)
-- — never orphaned, never silently cascaded without the same
-- recoverability guarantee. Composable with the linked-pair cascade above:
-- trashing a transaction here will also fire its own trigger to trash any
-- linked counterpart on a *different* account.
-- ---------------------------------------------------------------------------

create function cascade_trash_account_transactions()
returns trigger
language plpgsql
as $$
begin
  if new.trashed_at is not null and old.trashed_at is null then
    update transactions
    set trashed_at = new.trashed_at, permanently_delete_after = new.permanently_delete_after
    where account_id = new.id and trashed_at is null;
  end if;
  return new;
end;
$$;

create trigger accounts_cascade_trash_transactions
  after update of trashed_at on accounts
  for each row execute function cascade_trash_account_transactions();

-- ---------------------------------------------------------------------------
-- activity_log: extend entity_type for finance entities, and layer a
-- privacy filter on top of the existing plain-membership policy (PRD
-- §32.8) — an entry about a private account/bill is only visible to
-- whoever could already see that account/bill.
-- ---------------------------------------------------------------------------

alter table activity_log drop constraint if exists activity_log_entity_type_check;
alter table activity_log add constraint activity_log_entity_type_check
  check (entity_type in (
    'item', 'container', 'location', 'household', 'member',
    'account', 'transaction', 'category', 'recurring_bill'
  ));

-- entity_id is polymorphic (no FK, same as every other entity_type
-- already in this table) — resolves visibility by entity_type: 'account'/
-- 'recurring_bill' entries check the entity itself; 'transaction' entries
-- resolve through the transaction's account_id; everything else (item,
-- container, location, household, member, category) is unaffected by
-- this predicate and stays governed by plain household membership.
create function can_view_activity_log_entry(p_entity_type text, p_entity_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_account_id uuid;
begin
  if p_entity_type = 'account' then
    return can_view_account(p_entity_id);
  elsif p_entity_type = 'recurring_bill' then
    return can_view_recurring_bill(p_entity_id);
  elsif p_entity_type = 'transaction' then
    select account_id into v_account_id from transactions where id = p_entity_id;
    if v_account_id is null then
      -- Transaction row no longer exists (permanently purged past Trash
      -- retention) — don't retroactively hide an audit entry for a
      -- record that's already gone; nothing left to leak.
      return true;
    end if;
    return can_view_account(v_account_id);
  else
    return true;
  end if;
end;
$$;

-- RESTRICTIVE (ANDs with the existing permissive "household member
-- read/write" policy from 0001_init.sql, rather than replacing it) —
-- Postgres ORs multiple *permissive* policies together, which can only
-- broaden access; a restrictive policy is the correct tool to narrow it
-- without touching the existing policy at all.
create policy "finance entity visibility" on activity_log
  as restrictive
  for select
  using (can_view_activity_log_entry(entity_type, entity_id));

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table accounts enable row level security;
alter table finance_account_shares enable row level security;
alter table account_balance_snapshots enable row level security;
alter table transactions enable row level security;
alter table categories enable row level security;
alter table category_rules enable row level security;
alter table recurring_bills enable row level security;
alter table finance_bill_shares enable row level security;
alter table csv_import_batches enable row level security;

-- Accounts: read/update/delete governed by can_view_account(); insert
-- checked inline since the row doesn't exist yet to look up (a caller can
-- only create a joint account or a personal account they own themselves
-- — granting access to someone else's new personal account happens via
-- finance_account_shares afterward, not at creation).
create policy "account read" on accounts
  for select using (can_view_account(id));
create policy "account insert" on accounts
  for insert with check (
    is_household_member(household_id)
    and (owner_user_id is null or owner_user_id = auth.uid())
  );
create policy "account update" on accounts
  for update using (can_view_account(id))
  with check (
    is_household_member(household_id)
    and (
      owner_user_id is null or owner_user_id = auth.uid()
      or exists (select 1 from finance_account_shares where account_id = accounts.id and shared_with_user_id = auth.uid())
    )
  );
create policy "account delete" on accounts
  for delete using (can_view_account(id));

-- Shares: visible to the account's owner (who granted it) and the person
-- it was shared with (so they know they have access); only the owner can
-- grant or revoke — matches the "Manage sharing" UI being owner-only.
create policy "account share read" on finance_account_shares
  for select using (
    is_household_member(household_id)
    and (
      shared_with_user_id = auth.uid()
      or exists (select 1 from accounts where id = account_id and owner_user_id = auth.uid())
    )
  );
create policy "account share write" on finance_account_shares
  for insert with check (
    exists (select 1 from accounts where id = account_id and owner_user_id = auth.uid() and household_id = finance_account_shares.household_id)
  );
create policy "account share delete" on finance_account_shares
  for delete using (
    exists (select 1 from accounts where id = account_id and owner_user_id = auth.uid())
    or shared_with_user_id = auth.uid() -- a member can also remove their own access
  );

create policy "household member read/write, privacy-aware" on account_balance_snapshots
  for all using (can_view_account(account_id)) with check (can_view_account(account_id));

create policy "household member read/write, privacy-aware" on transactions
  for all using (can_view_account(account_id)) with check (can_view_account(account_id));

-- Categories/rules: household-wide, no privacy layer — plain membership,
-- with one wrinkle categories has that no other table does: household_id
-- is nullable (null = system default, shared read-only across every
-- household). is_household_member(NULL) is always false (SQL NULL
-- comparison), so a single "is_household_member(household_id)" policy
-- would make system defaults unreadable by anyone — split into a
-- SELECT policy that also allows household_id IS NULL, and a mutate
-- policy that doesn't (system defaults aren't user-editable).
create policy "category read" on categories
  for select using (household_id is null or is_household_member(household_id));
create policy "category insert" on categories
  for insert with check (household_id is not null and is_household_member(household_id));
create policy "category update" on categories
  for update using (household_id is not null and is_household_member(household_id))
  with check (household_id is not null and is_household_member(household_id));
create policy "category delete" on categories
  for delete using (household_id is not null and is_household_member(household_id));

create policy "household member read/write" on category_rules
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "recurring bill read" on recurring_bills
  for select using (can_view_recurring_bill(id));
create policy "recurring bill insert" on recurring_bills
  for insert with check (
    is_household_member(household_id)
    and (owner_user_id is null or owner_user_id = auth.uid())
  );
create policy "recurring bill update" on recurring_bills
  for update using (can_view_recurring_bill(id))
  with check (
    is_household_member(household_id)
    and (
      owner_user_id is null or owner_user_id = auth.uid()
      or exists (select 1 from finance_bill_shares where bill_id = recurring_bills.id and shared_with_user_id = auth.uid())
    )
  );
create policy "recurring bill delete" on recurring_bills
  for delete using (can_view_recurring_bill(id));

create policy "bill share read" on finance_bill_shares
  for select using (
    is_household_member(household_id)
    and (
      shared_with_user_id = auth.uid()
      or exists (select 1 from recurring_bills where id = bill_id and owner_user_id = auth.uid())
    )
  );
create policy "bill share write" on finance_bill_shares
  for insert with check (
    exists (select 1 from recurring_bills where id = bill_id and owner_user_id = auth.uid() and household_id = finance_bill_shares.household_id)
  );
create policy "bill share delete" on finance_bill_shares
  for delete using (
    exists (select 1 from recurring_bills where id = bill_id and owner_user_id = auth.uid())
    or shared_with_user_id = auth.uid()
  );

create policy "household member read/write, privacy-aware" on csv_import_batches
  for all using (can_view_account(account_id)) with check (can_view_account(account_id));

-- ---------------------------------------------------------------------------
-- Realtime — add the new tables to the same publication 0004_realtime_
-- publication.sql set up, guarded the same way (safe to re-run).
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'finance_account_shares', 'account_balance_snapshots',
    'transactions', 'categories', 'category_rules',
    'recurring_bills', 'finance_bill_shares', 'csv_import_batches'
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
