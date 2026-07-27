-- Adds accept_invite_by_email(), needed once the app actually calls
-- Supabase for real (see src/lib/store.ts's hydrate()/acceptInvite()).
--
-- accept_invite(p_invite_id, ...) (0001_init.sql) assumes the caller
-- already knows the invite's id. But the "household member read" RLS
-- policy on invites means a brand-new invitee — not yet a member of
-- anything — can't SELECT the invites table to find their own pending
-- invite and get that id. Rather than redesign the join flow around a
-- shared invite link, this adds one more security-definer RPC in the same
-- style as create_household/accept_invite/transfer_ownership: it looks up
-- the caller's own pending invite via auth.email() (the verified JWT
-- claim, never a client-supplied string — same trust model accept_invite()
-- already uses for its own email check) and then does exactly what
-- accept_invite() does.

create function accept_invite_by_email(p_display_name text, p_avatar_url text default null)
returns households
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invite invites;
  joined_household households;
begin
  select * into target_invite
  from invites
  where status = 'pending' and lower(invited_email) = lower(auth.email())
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'No pending invite found for your email address.';
  end if;
  if target_invite.expires_at <= now() then
    update invites set status = 'expired' where id = target_invite.id;
    raise exception 'This invite has expired.';
  end if;

  insert into members (household_id, user_id, role, display_name, email, avatar_url)
  values (target_invite.household_id, auth.uid(), 'member', p_display_name, auth.email(), p_avatar_url)
  on conflict (household_id, user_id) do nothing;

  update invites set status = 'accepted' where id = target_invite.id;

  select * into joined_household from households where id = target_invite.household_id;
  return joined_household;
end;
$$;
