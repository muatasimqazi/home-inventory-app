-- Stock location cover photos — a shared, non-household-scoped set of
-- AI-generated banner photos for the ~22 REFERENCE_LOCATIONS names (
-- lib/reference/starter-inventory.ts), so a household adding a "Kitchen"
-- or "Garage" gets a real photo immediately instead of the plain emoji,
-- with no per-request AI generation and no per-household Storage write.
--
-- A dedicated bucket, not a folder inside the existing "item-photos"
-- bucket: item-photos' own RLS policies key every path's first segment as
-- `(storage.foldername(name))[1]::uuid` = a household id (0005/0008) — a
-- flat, non-UUID-prefixed path like "kitchen.png" would fail that cast the
-- moment any policy evaluates it. This bucket's objects are global, not
-- household data, so they get their own bucket instead of a special-cased
-- folder in one that assumes every top-level folder is a household.
--
-- No insert/update/delete policies on purpose: the only writer is the
-- one-time seed script (scripts/seed-stock-location-photos.ts), which runs
-- with the service-role/admin client and so bypasses RLS entirely — with
-- no policy granting insert/update/delete to anon/authenticated, ordinary
-- app requests can never write here, which is exactly the intent (nothing
-- in the app itself ever uploads to this bucket). No select policy either,
-- same reasoning as item-photos (0006's own comment): public: true already
-- serves reads through the public /object/public/... URL path that
-- getPublicUrl()/coverPhotoUrl() actually use — this bucket is never
-- list()'d or remove()'d from client code, so that's genuinely all it
-- needs.
insert into storage.buckets (id, name, public)
values ('stock-photos', 'stock-photos', true)
on conflict (id) do nothing;
