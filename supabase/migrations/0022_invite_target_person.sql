-- Two things, found together while designing the managed-profile-to-
-- account conversion question (Household Ledger Implementation Plan §9):
--
-- 1. A real, previously-unknown bug: accept_invite_by_email() — the
--    function the app actually calls (src/lib/store.ts's acceptInvite())
--    — only ever inserted into `members`, never `people`. 0017's
--    people-row-creation logic was added to accept_invite(p_invite_id,
--    ...) (0001_init.sql) instead — a *different*, unused function the
--    app never calls. Confirmed directly: a real invite created and
--    accepted end-to-end via the actual RPC left a real `members` row but
--    no `people` row at all. Every member who has ever joined a household
--    via a real invite (not create_household()'s own path) has been
--    invisible on the People page and unable to own an item ever since
--    the People feature shipped. Fixed here, on the function that matters.
--
-- 2. The conversion feature itself: invites.target_person_id lets an
--    invite be scoped to convert one specific existing managed profile
--    (rather than always creating a fresh Person row) — chosen over a
--    separate claim-code mechanism specifically so the existing invite
--    flow (expiry, cancellation, RLS) doesn't need duplicating. When set,
--    acceptance updates that Person's linked_user_id in place instead of
--    inserting a new row, so every item, activity log entry, and future
--    association a managed profile has already accumulated stays attached
--    automatically — they all point at the person_id, never the user_id.

alter table invites add column target_person_id uuid references people(id) on delete set null;

-- Same-household check, same pattern as every other cross-table reference
-- in this schema (validate_item_purchase_household() etc.) — invites
-- INSERT is already owner-only at the RLS layer and the UI only ever
-- offers a person from the current household, but a wrong target_person_id
-- here would mean converting the wrong human's profile, not just a
-- cosmetic glitch, so it gets the same defense-in-depth treatment.
create function validate_invite_target_person()
returns trigger
language plpgsql
as $$
begin
  if new.target_person_id is not null and not exists (
    select 1 from people where id = new.target_person_id and household_id = new.household_id
  ) then
    raise exception 'invites.target_person_id must belong to the same household as the invite.';
  end if;
  return new;
end;
$$;

create trigger invites_validate_target_person
  before insert or update of target_person_id, household_id on invites
  for each row execute function validate_invite_target_person();

-- Both accept_invite_by_email() (what the app actually calls) and
-- accept_invite(p_invite_id, ...) (unused by the app today, but a real
-- callable RPC — kept consistent rather than left to silently diverge)
-- get the same two changes: create a Person row on a plain invite, or
-- convert the named one if the invite carries a target_person_id.

create or replace function accept_invite_by_email(p_display_name text, p_avatar_url text default null)
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

  if target_invite.target_person_id is not null then
    if not exists (
      select 1 from people
      where id = target_invite.target_person_id
        and household_id = target_invite.household_id
        and linked_user_id is null
    ) then
      -- The targeted profile was removed, already claimed, or somehow
      -- moved households since the invite was sent — fail closed rather
      -- than silently falling back to creating a duplicate Person row for
      -- the same human.
      raise exception 'The profile this invite was meant to convert is no longer available.';
    end if;
    update people set linked_user_id = auth.uid() where id = target_invite.target_person_id;
  else
    insert into people (household_id, display_name, avatar_path, linked_user_id, created_by_user_id)
    values (target_invite.household_id, p_display_name, p_avatar_url, auth.uid(), auth.uid())
    on conflict (household_id, linked_user_id) where linked_user_id is not null do nothing;
  end if;

  update invites set status = 'accepted' where id = target_invite.id;

  select * into joined_household from households where id = target_invite.household_id;
  return joined_household;
end;
$$;

create or replace function accept_invite(p_invite_id uuid, p_display_name text, p_avatar_url text default null)
returns households
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invite invites;
  joined_household households;
begin
  select * into target_invite from invites where id = p_invite_id;
  if not found then
    raise exception 'Invite not found.';
  end if;
  if target_invite.status <> 'pending' then
    raise exception 'This invite is no longer pending.';
  end if;
  if target_invite.expires_at <= now() then
    update invites set status = 'expired' where id = p_invite_id;
    raise exception 'This invite has expired.';
  end if;
  if lower(target_invite.invited_email) <> lower(auth.email()) then
    raise exception 'This invite was sent to a different email address.';
  end if;

  insert into members (household_id, user_id, role, display_name, email, avatar_url)
  values (target_invite.household_id, auth.uid(), 'member', p_display_name, auth.email(), p_avatar_url)
  on conflict (household_id, user_id) do nothing;

  if target_invite.target_person_id is not null then
    if not exists (
      select 1 from people
      where id = target_invite.target_person_id
        and household_id = target_invite.household_id
        and linked_user_id is null
    ) then
      raise exception 'The profile this invite was meant to convert is no longer available.';
    end if;
    update people set linked_user_id = auth.uid() where id = target_invite.target_person_id;
  else
    insert into people (household_id, display_name, avatar_path, linked_user_id, created_by_user_id)
    values (target_invite.household_id, p_display_name, p_avatar_url, auth.uid(), auth.uid())
    on conflict (household_id, linked_user_id) where linked_user_id is not null do nothing;
  end if;

  update invites set status = 'accepted' where id = p_invite_id;

  select * into joined_household from households where id = target_invite.household_id;
  return joined_household;
end;
$$;
