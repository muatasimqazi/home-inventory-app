-- Enables Supabase Realtime for every household-scoped table so store.ts
-- can subscribe to live changes (see subscribeRealtime()) instead of only
-- refreshing on the next hydrate(). Realtime is off by default per table —
-- a table only broadcasts postgres_changes once it's added to the
-- supabase_realtime publication. RLS still applies to what a subscriber
-- actually receives, exactly like a normal query; this migration only
-- controls which tables broadcast at all.
--
-- Guarded with a pg_publication_tables check (rather than a bare `alter
-- publication ... add table`) so this migration is safe to re-run —
-- adding an already-member table errors otherwise.
do $$
declare
  t text;
begin
  foreach t in array array[
    'households', 'members', 'invites', 'locations', 'containers', 'items',
    'tags', 'item_tags', 'favorites', 'activity_log', 'attachments',
    'label_batches', 'label_batch_entries', 'normalization_rules'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
