-- Real Supabase Storage backing for attachments (PRD v2 §5) — until now
-- Attachment.storagePath (0001_init.sql) was a real column pointing at
-- nothing: the app only ever stored a client-side blob: URL that died on
-- reload, since no bucket or Storage policy existed anywhere.
--
-- Private, not public: attachments can be receipts/warranties carrying
-- real personal information, so access is scoped by household membership
-- exactly like every table — not left open to anyone who guesses a URL.
-- Object paths are `${householdId}/${attachmentId}` (see store.ts's
-- addAttachment()); (storage.foldername(name))[1] pulls the household id
-- back out for the policy check, reusing is_household_member() from
-- 0001_init.sql rather than duplicating that logic here. Schema-qualified
-- as public.is_household_member(...) since these policies evaluate
-- against storage.objects, not public's own default search_path.
--
-- No update policy: attachments are created and deleted, never edited
-- in place.

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "household member read" on storage.objects
  for select using (
    bucket_id = 'attachments'
    and public.is_household_member((storage.foldername(name))[1]::uuid)
  );

create policy "household member insert" on storage.objects
  for insert with check (
    bucket_id = 'attachments'
    and public.is_household_member((storage.foldername(name))[1]::uuid)
  );

create policy "household member delete" on storage.objects
  for delete using (
    bucket_id = 'attachments'
    and public.is_household_member((storage.foldername(name))[1]::uuid)
  );
