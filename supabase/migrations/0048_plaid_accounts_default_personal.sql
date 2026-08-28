-- Plaid-linked accounts originally landed as joint/household accounts
-- (owner_user_id null), which made their synced transactions visible to
-- every household member. Treat existing linked-bank accounts the same way
-- new links are now created: personal to the member who connected the bank.
--
-- Users can still explicitly share or convert an account later from the
-- account detail screen. This only touches linked accounts where we know
-- who created them and where no owner has already been set.
update accounts
set owner_user_id = created_by_user_id
where plaid_item_id is not null
  and owner_user_id is null
  and created_by_user_id is not null;
