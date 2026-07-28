-- Lets a member update their own profile fields (docs/bugs.md #10 — there
-- was no way to rename yourself; not just missing UI, no RLS policy on
-- `members` permitted an UPDATE at all, only owner-delete, self-leave-
-- delete, and the creation RPCs). Scoped to the caller's own row only —
-- the app itself only ever sends display_name/avatar_url in this update
-- (see store.ts's updateMyProfile()), the same "trust RLS row-scope +
-- the app's own column discipline" model already used for every other
-- full-table policy in this schema (no column-level grants here either).
create policy "member updates own row" on members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
