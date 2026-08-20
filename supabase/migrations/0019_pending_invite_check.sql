-- Fixes a real onboarding bug (Household Ledger Implementation Plan §9):
-- household-setup/page.tsx auto-creates a household for any zero-household
-- user with no way to first check whether they actually have a pending
-- invite waiting — a user who signed up specifically to redeem one got a
-- brand-new household auto-created and owned by them instead, since
-- nothing routes them to the join form before that auto-create effect
-- fires.
--
-- The reason the page couldn't just check for itself: the "household
-- member read" RLS policy on invites (0001_init.sql) means a brand-new
-- invitee — not yet a member of anything — can't SELECT the invites table
-- to find their own pending invite. accept_invite_by_email()
-- (0002_accept_invite_by_email.sql) already solves this for *accepting*
-- an invite (security definer, looks the caller up via auth.email()), but
-- it mutates state the moment it finds a match — not safe to call just to
-- check.
--
-- This is the same lookup, same security-definer trust model, but
-- read-only: enough information (household name, inviter's display name)
-- for the UI to show "You've been invited to join X" before the user
-- picks a path, without side effects either way.

create function find_pending_invite_by_email()
returns table (household_name text, invited_by_display_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select h.name, m.display_name
  from invites i
  join households h on h.id = i.household_id
  left join members m on m.household_id = i.household_id and m.user_id = i.invited_by_user_id
  where i.status = 'pending'
    and lower(i.invited_email) = lower(auth.email())
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;
end;
$$;
