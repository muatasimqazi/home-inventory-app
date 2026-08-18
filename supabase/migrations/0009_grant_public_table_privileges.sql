-- Explicit table-level GRANTs for the public schema, for anon/authenticated/
-- service_role.
--
-- On a real Supabase Cloud project these are set automatically at project
-- creation (platform-level bootstrap, outside of user migrations) — which is
-- why prod works today and always has. A bare `supabase init && supabase
-- start` locally does not replicate that bootstrap step, so a fresh local
-- instance has RLS policies with no underlying table GRANT to even reach
-- them: every query fails with "permission denied for table X" regardless
-- of policy, because GRANT-level privilege is checked before RLS.
--
-- This was never a hidden prod bug — prod was never missing these grants.
-- It only ever showed up because this migration didn't exist yet, so a
-- from-scratch local instance couldn't reproduce prod's actual (implicit)
-- permission model. Making it explicit here is strictly additive on prod
-- (a GRANT that already holds is a no-op) and fixes every from-scratch
-- local instance going forward, including for the household_tasks and
-- finance tables landing in upcoming migrations.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

grant execute on all functions in schema public
  to anon, authenticated, service_role;

-- Apply the same grants to anything created by future migrations, so this
-- doesn't need repeating per new table.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
