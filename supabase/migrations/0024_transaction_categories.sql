-- Categories foundation (Workstream 1 of the multi-category batch) —
-- `transaction_categories`: tag-style multi-category support for
-- transactions. The household explicitly asked for this to be tag-style,
-- not split-transaction accounting — a transaction can carry several
-- category tags, and each tag still represents the transaction's full
-- amount, never a fraction of it summing to a total.
--
-- transactions.category_id (0010_finance_schema.sql) is deliberately left
-- untouched: every existing dashboard/budget-by-category/category_rules/
-- Ask-tool call site keeps reading that single column exactly as before.
-- This migration only adds the fuller junction table alongside it —
-- application code (transaction-form-sheet.tsx) is responsible for
-- keeping category_id populated with whichever category is selected
-- first/primary, so every one of those existing single-category call
-- sites keeps seeing something sensible. Extending them to be
-- junction-table-aware is a later workstream's job, not this one's.
--
-- Follows the same "add a junction table alongside an existing single-
-- value column, don't touch the column's own call sites" spirit as
-- items.owner_person_id/owner_user_id (0017_household_ledger_core.sql).

create table transaction_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (transaction_id, category_id)
);

create index transaction_categories_household_id_idx on transaction_categories(household_id);
create index transaction_categories_transaction_id_idx on transaction_categories(transaction_id);
create index transaction_categories_category_id_idx on transaction_categories(category_id);

-- Cross-household reference validation, same style as
-- validate_transaction_references()/validate_item_purchase_household()
-- (0010_finance_schema.sql / 0017_household_ledger_core.sql) — every FK'd
-- reference must resolve to the link's own household, not just whichever
-- side happens to be required.
create function validate_transaction_category_household()
returns trigger
language plpgsql
as $$
declare
  txn_household uuid;
  cat_household uuid;
begin
  select household_id into txn_household from transactions where id = new.transaction_id;
  if txn_household is null then
    raise exception 'Transaction not found.';
  end if;
  if txn_household <> new.household_id then
    raise exception 'transaction_categories.transaction_id must belong to the same household as the link.';
  end if;

  -- category_id's household_id can legitimately be null (a system default
  -- category, shared/read-only across every household — see categories'
  -- own comment in 0010_finance_schema.sql) — only reject a mismatch
  -- against a real, different household.
  select household_id into cat_household from categories where id = new.category_id;
  if cat_household is not null and cat_household <> new.household_id then
    raise exception 'transaction_categories.category_id must belong to the same household as the link.';
  end if;

  return new;
end;
$$;

create trigger transaction_categories_validate_household
  before insert or update of transaction_id, category_id, household_id on transaction_categories
  for each row execute function validate_transaction_category_household();

-- Backfill: one transaction_categories row for every existing transaction
-- that already has a non-null category_id, so the new table starts
-- consistent with the old column instead of empty.
insert into transaction_categories (household_id, transaction_id, category_id, created_at)
select household_id, id, category_id, created_at
from transactions
where category_id is not null
on conflict (transaction_id, category_id) do nothing;

-- prevent_trash_referenced_category() (0010_finance_schema.sql) only ever
-- checked transactions.category_id — the single legacy column. Now that a
-- category can also be referenced purely as a secondary tag (via
-- transaction_categories, with no transaction's own category_id pointing
-- at it), the original check alone would let that category be trashed
-- while still actively tagging a transaction, silently violating PRD
-- §32.6's "cannot trash a still-referenced category" invariant. Extended,
-- not replaced, so every part of the original guard still applies.
create or replace function prevent_trash_referenced_category()
returns trigger
language plpgsql
as $$
begin
  if new.trashed_at is not null and old.trashed_at is null then
    if exists (select 1 from transactions where category_id = new.id and trashed_at is null) then
      raise exception 'Cannot trash a category still referenced by transactions. Reassign or archive instead.';
    end if;
    if exists (
      select 1 from transaction_categories tc
      join transactions t on t.id = tc.transaction_id
      where tc.category_id = new.id and t.trashed_at is null
    ) then
      raise exception 'Cannot trash a category still referenced by transactions. Reassign or archive instead.';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table transaction_categories enable row level security;

-- Visibility inherited via the transaction's own account_id — same
-- reasoning as item_purchases' "household member read/write,
-- privacy-aware" policy (0017_household_ledger_core.sql) and transactions'
-- own policy (0010_finance_schema.sql): transaction visibility in this app
-- isn't just household membership (private personal accounts, Personal
-- Finance Addendum "Privacy model"), so a naive is_household_member()-only
-- policy would leak a private account's category tags to a household
-- member who can't even see the transaction itself. transaction_id is
-- NOT nullable here (unlike item_purchases' transaction_id), so this is
-- unconditional rather than the "only restrict when transaction_id is
-- set" branch item_purchases needs.
create policy "household member read/write, privacy-aware" on transaction_categories
  for all using (
    is_household_member(household_id)
    and can_view_account((select account_id from transactions where id = transaction_categories.transaction_id))
  )
  with check (
    is_household_member(household_id)
    and can_view_account((select account_id from transactions where id = transaction_categories.transaction_id))
  );

-- ---------------------------------------------------------------------------
-- Realtime — same opt-in mechanism as 0004_realtime_publication.sql.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transaction_categories'
  ) then
    execute 'alter publication supabase_realtime add table public.transaction_categories';
  end if;
end $$;
