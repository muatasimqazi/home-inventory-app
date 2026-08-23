-- Real API keys for external automations (Home Assistant, Apple
-- Shortcuts) — replaces the settings/api-keys page's previous pure UI
-- mock (local useState, Math.random() "keys" that were never persisted
-- or checked against anything). The full secret is generated server-side,
-- shown to the owner exactly once, and never stored — only a SHA-256
-- hash of it lives here, looked up by the new /api/v1/public/* routes on
-- every request (see src/lib/api-key-auth.ts).

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id),
  label text not null,
  -- Shown in the UI so an owner can tell keys apart without ever seeing
  -- the full secret again, e.g. "shz_8f3a2c1d…wXyz" — key_prefix is the
  -- first chars right after "shz_", last_four the tail.
  key_prefix text not null,
  last_four text not null,
  -- sha256(secret), hex-encoded. UNIQUE both guards against the
  -- astronomically unlikely hash collision and lets the auth lookup use a
  -- plain equality index instead of scanning every row.
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index api_keys_household_id_idx on api_keys(household_id);
-- Partial: only non-revoked keys are ever looked up by hash on the hot
-- path (every public API request); revoked/old keys don't need to be fast.
create index api_keys_key_hash_active_idx on api_keys(key_hash) where revoked_at is null;

alter table api_keys enable row level security;

-- Owner-only in every direction — same posture as invites/member removal
-- (0001_init.sql's is_household_owner comment: household admin actions
-- are gated at the database layer, not just hidden client-side). A key is
-- a standing credential to the household's whole inventory; unlike most
-- household-scoped tables, regular members don't even get read access
-- here, only the owner.
create policy "owner read" on api_keys
  for select using (is_household_owner(household_id));

create policy "owner insert" on api_keys
  for insert with check (is_household_owner(household_id) and created_by_user_id = auth.uid());

-- Revoke only ever sets revoked_at (checked in the route handler, not
-- re-enforced here via a column-level policy — Postgres RLS has no
-- "these columns only" clause short of a trigger, and the settings UI is
-- the only writer). No delete policy: revoked keys are kept, not removed,
-- so "when was this revoked and by implication who created it" stays a
-- real audit trail instead of disappearing.
create policy "owner revoke" on api_keys
  for update using (is_household_owner(household_id)) with check (is_household_owner(household_id));

-- Table-level grants are picked up automatically by 0009's
-- `alter default privileges` — nothing to add here.
