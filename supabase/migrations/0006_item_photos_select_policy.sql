-- 0005 deliberately skipped a select policy on the item-photos bucket,
-- reasoning that public: true makes one unnecessary — true for the
-- special /object/public/... URL path (what <img> tags actually use,
-- confirmed working), but NOT true for authenticated API operations
-- against storage.objects directly. remove()/list() work by first
-- SELECTing which rows match, and without a select policy that lookup
-- finds nothing — remove() was returning 200 with an empty deleted-list,
-- silently deleting zero objects, caught by live verification (a "removed
-- cover photo" DB update with no matching Storage cleanup).
create policy "household member select item photos" on storage.objects
  for select using (
    bucket_id = 'item-photos'
    and public.is_household_member((storage.foldername(name))[1]::uuid)
  );
