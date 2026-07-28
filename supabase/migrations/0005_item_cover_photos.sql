-- Real item cover photos (docs/bugs.md #9/#11 — items only ever showed an
-- emoji; the captured photo was thrown away after AI detection, and no
-- schema/storage existed for a real one).
--
-- A NEW public bucket, not the existing private "attachments" one: a cover
-- photo needs to render cheaply in every item card/list (getPublicUrl(),
-- no network round trip), unlike attachments' occasional signed-URL-on-
-- click document views. This trades a little privacy (anyone with a
-- guessed URL can view a cover photo) for that — the judgment call is that
-- "a picture of a household item" is materially lower-sensitivity than
-- attachments' receipts/warranties, which correctly stay private.

alter table items add column cover_photo_path text;

insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

-- Writes are still membership-gated even though reads are public — same
-- (storage.foldername(name))[1] = household id convention as the
-- attachments bucket (0003_attachments_storage.sql), reusing
-- is_household_member() rather than duplicating the check. Policy names
-- must be unique per table (not per bucket_id condition), so these can't
-- reuse 0003's exact names even though the pattern is identical.
create policy "household member insert item photos" on storage.objects
  for insert with check (
    bucket_id = 'item-photos'
    and public.is_household_member((storage.foldername(name))[1]::uuid)
  );

create policy "household member delete item photos" on storage.objects
  for delete using (
    bucket_id = 'item-photos'
    and public.is_household_member((storage.foldername(name))[1]::uuid)
  );

-- A select policy is still needed despite the bucket being public — see
-- 0006_item_photos_select_policy.sql for why (public: true only bypasses
-- RLS for the special /object/public/... read path, not authenticated
-- operations like remove()/list() that look rows up via storage.objects
-- directly).
