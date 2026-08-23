-- AI-suggested manual/warranty document links for Appliance items — links
-- only (a manufacturer support URL, a manual page), not downloaded/
-- rehosted files: the model has no live web access, so any URL it gives
-- is from its own training data and can be wrong, outdated, or (despite
-- explicit prompting not to) fabricated. Rehosting a possibly-wrong or
-- copyrighted PDF from this app's own storage was the one thing worth not
-- doing without a real search+fetch pipeline behind it; a link the user
-- opens and judges for themselves carries none of that risk. Deliberately
-- its own table, not a repurposed `attachments` row — attachments'
-- storage_path is a real uploaded file, not a URL, and these have no file
-- behind them at all.

create table item_document_links (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  kind text not null check (kind in ('manual', 'warranty')),
  url text not null,
  label text not null,
  created_at timestamptz not null default now()
);

create index item_document_links_item_id_idx on item_document_links(item_id);

-- Cross-household reference validation, same shape as
-- validate_item_purchase_household() (0017_household_ledger_core.sql).
create function validate_item_document_link_household()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from items where id = new.item_id and household_id = new.household_id) then
    raise exception 'item_document_links.item_id must belong to the same household as the link.';
  end if;
  return new;
end;
$$;

create trigger item_document_links_validate_household
  before insert or update of item_id, household_id on item_document_links
  for each row execute function validate_item_document_link_household();

alter table item_document_links enable row level security;

-- Same privacy-aware shape as item_tags/favorites/attachments
-- (0031_item_sharing.sql) — a document link for a private, unshared item
-- shouldn't stay reachable to a household member who can't see the item
-- itself.
create policy "household member read/write, privacy-aware" on item_document_links
  for all using (can_view_item(item_document_links.item_id)) with check (can_view_item(item_document_links.item_id));

-- ---------------------------------------------------------------------------
-- Realtime — same opt-in mechanism as 0004_realtime_publication.sql.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'item_document_links'
  ) then
    execute 'alter publication supabase_realtime add table public.item_document_links';
  end if;
end $$;
