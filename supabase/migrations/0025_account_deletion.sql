-- Account deletion (Workstream 6, batch/account-deletion).
--
-- Design (confirmed with the user, implemented exactly, not improvised
-- beyond it) — three cases per household the deleting user belongs to:
--
--   1. Sole member of a household -> the whole household cascades away
--      (items, transactions, accounts, locations, containers,
--      attachments, everything with a household_id FK) via the existing
--      `households(id) on delete cascade` every table in the schema
--      already uses. The clear-cut "everything they own" case.
--   2. Owner of a household WITH other members -> BLOCKS the *entire*
--      account deletion (not just that one household) until ownership is
--      transferred to another member first, via the existing
--      transfer_ownership() RPC / People page UI. Never silently
--      reassigns or cascade-deletes a shared household out from under
--      other members.
--   3. Non-owner member of a shared household -> deletes only their
--      membership, their Person row, and any items where they are the
--      sole owner (items.owner_person_id, the only ownership field left
--      on `items` since 0021 dropped owner_user_id). Shared transactions/
--      accounts/locations/containers/attachments they merely *created*
--      (created_by_user_id) are deliberately left alone — real shared
--      household history other members still need.
--
-- One function, one transaction: every case-2 check across every
-- household the user belongs to must pass before anything is touched: an
-- exception here rolls back the whole thing untouched, so a deletion
-- attempt is never left half-applied.
--
-- ---------------------------------------------------------------------------
-- FLAGGED GAP — read before assuming this deletes the sign-in account too:
-- ---------------------------------------------------------------------------
-- This function deliberately does NOT touch auth.users. Actually removing
-- the account still requires a separate `supabase.auth.admin.deleteUser()`
-- call from the API route (the Admin API, not a raw SQL DELETE, so
-- GoTrue's own session/identity/refresh-token cleanup happens correctly),
-- issued *after* this function commits.
--
-- That final step can still fail even after this function succeeds. Most
-- `..._user_id` FKs to auth.users in this schema are `on delete cascade`
-- or `on delete set null` (members, push_subscriptions,
-- notification_preferences, favorites, accounts.owner_user_id,
-- recurring_bills.owner_user_id, people.linked_user_id, event_log.actor_user_id
-- all cascade/null cleanly) — but every `created_by_user_id` column
-- (locations, containers, items, attachments, label_batches, transactions,
-- csv_import_batches, receipt_scan_batches, transaction_attachments,
-- pinned_locations, plaid_items, people) plus invites.invited_by_user_id,
-- finance_account_shares/finance_bill_shares.shared_by_user_id, and
-- activity_log.actor_user_id are `not null references auth.users(id)`
-- with NO `on delete` clause (Postgres default NO ACTION). Those are
-- exactly the columns that record who created/acted on *shared* household
-- content this design says must survive — so for case 3, on any household
-- where the deleting user has ever created or acted on shared content
-- (essentially any household member with real activity history),
-- `auth.admin.deleteUser()` will fail with a foreign-key violation, by
-- Postgres design, not a bug in this function.
--
-- This was deliberately NOT "fixed" by making those columns nullable /
-- ON DELETE SET NULL here: that's a cross-cutting schema change touching
-- ~12 tables well outside this workstream's file scope, several of which
-- other in-flight workstreams also touch, and it would blur "who created
-- this shared record" (already user-facing history) for every household,
-- not just at account-deletion time. Flagged instead of guessed at, per
-- the workstream brief. The API route attempts `deleteUser()` last and
-- reports failure clearly rather than silently leaving the sign-in
-- account behind — see that route's own comment for the exact behavior
-- and the workstream report for the full writeup.
-- ---------------------------------------------------------------------------
create or replace function delete_account_data(p_user_id uuid)
returns jsonb
language plpgsql
as $$
declare
  blocking_household record;
  sole_household record;
  shared_membership record;
  target_person_id uuid;
  deleted_household_ids uuid[] := '{}';
  personal_item_photo_paths text[] := '{}';
  personal_item_attachment_paths text[] := '{}';
  person_avatar_paths text[] := '{}';
  collected_photo_paths text[];
  collected_attachment_paths text[];
  collected_avatar_path text;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required.';
  end if;

  -- Case 2, checked across every household FIRST: block the whole
  -- deletion if the user owns any household with other members in it.
  -- Nothing below runs unless every household clears this.
  select h.id, h.name into blocking_household
  from members m
  join households h on h.id = m.household_id
  where m.user_id = p_user_id
    and m.role = 'owner'
    and exists (
      select 1 from members m2
      where m2.household_id = m.household_id and m2.user_id <> p_user_id
    )
  limit 1;

  if blocking_household.id is not null then
    raise exception 'OWNER_OF_SHARED_HOUSEHOLD: Transfer ownership of "%" to another member before deleting your account.', blocking_household.name;
  end if;

  -- Case 1: sole-member households. Collect Storage paths first (the
  -- route sweeps everything under `${householdId}/` in both the
  -- "attachments" and "item-photos" buckets afterward — a full prefix
  -- sweep rather than reconstructing every path column here, since it's
  -- the whole household and every object under that prefix belongs to it
  -- by the schema's own path convention), then delete the household row;
  -- `households(id) on delete cascade` takes every item/location/
  -- container/transaction/account/attachment/member/person/activity row
  -- with it in the same statement.
  for sole_household in
    select m.household_id
    from members m
    where m.user_id = p_user_id
      and not exists (
        select 1 from members m2
        where m2.household_id = m.household_id and m2.user_id <> p_user_id
      )
  loop
    deleted_household_ids := deleted_household_ids || sole_household.household_id;
    delete from households where id = sole_household.household_id;
  end loop;

  -- Case 3: remaining (shared, non-owner) memberships. Only
  -- personally-owned items, the Person row, and the membership itself.
  for shared_membership in
    select m.household_id
    from members m
    where m.user_id = p_user_id
  loop
    select id, avatar_path into target_person_id, collected_avatar_path
    from people
    where household_id = shared_membership.household_id and linked_user_id = p_user_id;

    if target_person_id is not null then
      select array_agg(cover_photo_path) filter (where cover_photo_path is not null)
      into collected_photo_paths
      from items
      where household_id = shared_membership.household_id and owner_person_id = target_person_id;

      -- Attachments on those personally-owned items — attachments.item_id
      -- cascades on item delete, so their storage_path values must be
      -- collected before the items (and thus their attachment rows) go
      -- away below.
      select array_agg(a.storage_path)
      into collected_attachment_paths
      from attachments a
      join items it on it.id = a.item_id
      where it.household_id = shared_membership.household_id and it.owner_person_id = target_person_id;

      if collected_photo_paths is not null then
        personal_item_photo_paths := personal_item_photo_paths || collected_photo_paths;
      end if;
      if collected_attachment_paths is not null then
        personal_item_attachment_paths := personal_item_attachment_paths || collected_attachment_paths;
      end if;

      delete from items where household_id = shared_membership.household_id and owner_person_id = target_person_id;

      if collected_avatar_path is not null then
        person_avatar_paths := person_avatar_paths || collected_avatar_path;
      end if;

      delete from people where id = target_person_id;
    end if;

    -- Re-check the case-2 invariant immediately before this delete, not
    -- just once at the top of the function: the initial check and this
    -- loop are separate statements under READ COMMITTED (each sees the
    -- latest committed data as of its own start), so a concurrent
    -- membership change to this exact household between them — someone
    -- else accepting a pending invite, turning a sole-member household
    -- into a shared one after the top-level check already passed it —
    -- could otherwise let this statement remove the household's only
    -- owner. Raising here aborts and rolls back the whole transaction
    -- (this function's existing all-or-nothing contract), converting a
    -- silent invariant violation into a safe, retryable failure.
    if exists (
      select 1 from members m
      where m.household_id = shared_membership.household_id
        and m.user_id = p_user_id
        and m.role = 'owner'
        and exists (
          select 1 from members m2
          where m2.household_id = shared_membership.household_id and m2.user_id <> p_user_id
        )
    ) then
      raise exception 'OWNER_OF_SHARED_HOUSEHOLD: A household membership changed during deletion — please try again.';
    end if;

    delete from members where household_id = shared_membership.household_id and user_id = p_user_id;
  end loop;

  -- Global (not household-scoped) rows. Both already cascade on
  -- auth.users delete, but revoked immediately here rather than only once
  -- (if ever) the final deleteUser() call succeeds — a departing member's
  -- devices should stop getting push right away regardless of whether the
  -- sign-in account itself can be fully removed (see the flagged gap
  -- above).
  delete from push_subscriptions where user_id = p_user_id;
  delete from notification_preferences where user_id = p_user_id;

  return jsonb_build_object(
    'deletedHouseholdIds', to_jsonb(deleted_household_ids),
    'personalItemPhotoPaths', to_jsonb(personal_item_photo_paths),
    'personalItemAttachmentPaths', to_jsonb(personal_item_attachment_paths),
    'personAvatarPaths', to_jsonb(person_avatar_paths)
  );
end;
$$;

-- 0009_grant_public_table_privileges.sql's `alter default privileges`
-- auto-grants EXECUTE on every new public-schema function to anon and
-- authenticated. That default is exactly wrong for this one: it takes an
-- arbitrary p_user_id and is SECURITY INVOKER (no auth.uid() check of its
-- own — deliberately, since the API route already independently verifies
-- the caller's session and only ever passes the caller's own id), so
-- leaving it PUBLIC-executable would let any authenticated caller delete
-- any other user's account data. Only the admin route (service_role,
-- which bypasses RLS on every underlying statement above regardless of
-- this function's own security mode) may call it.
revoke execute on function delete_account_data(uuid) from public, anon, authenticated;
