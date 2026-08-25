-- Wardrobe Photo Studio (docs/Wardrobe Inventory.md) — AI-generated
-- ecommerce-style product photos for an inventory item. One row per
-- generated style per attempt (never overwritten — "generation history"
-- is just every row that ever existed for an item), grouped by batch_id
-- for whichever styles were requested together in one call.
create table item_studio_photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  batch_id uuid not null default gen_random_uuid(),
  original_photo_path text not null, -- item-photos bucket, the as-captured source used for this generation
  style text not null check (style in ('white_background','transparent_background','studio_shadow','boutique_flat_lay','neutral_lifestyle')),
  aspect_ratio text not null default '1:1' check (aspect_ratio in ('1:1','4:5')),
  -- 'queued'/'processing' exist for schema headroom but aren't written by
  -- this pass — generation is synchronous (a single Fluid Compute call
  -- comfortably covers the 30-60s target), so a row is only ever inserted
  -- once it already has a final status. A future async/queued version
  -- wouldn't need a migration, just a different write pattern.
  status text not null default 'queued' check (status in ('queued','processing','complete','failed')),
  generated_photo_path text, -- item-photos bucket, set once complete
  error_message text,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index item_studio_photos_household_id_idx on item_studio_photos(household_id);
create index item_studio_photos_item_id_idx on item_studio_photos(item_id);
create index item_studio_photos_batch_id_idx on item_studio_photos(batch_id);

alter table item_studio_photos enable row level security;

-- Plain household membership — Items have no per-record privacy model in
-- this app (unlike Finance accounts' owner_user_id split), so no
-- can_view_account()-style predicate is needed here either. Same "for
-- all" shape category_rules/category_budgets already use.
create policy "household member read/write" on item_studio_photos
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

-- No explicit grant needed — 0009's `alter default privileges` already
-- covers every new table automatically.

-- Realtime — same guarded pattern every other migration uses, safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'item_studio_photos'
  ) then
    execute 'alter publication supabase_realtime add table public.item_studio_photos';
  end if;
end $$;
