-- Email receipts (Bugs & Features backlog, item 8): purchases with no
-- physical receipt, or no time to log manually, forwarded to a per-
-- household inbox address instead. Each household gets a short, opaque
-- token — not the household's own uuid — used as the local part of its
-- forwarding address (token@receipts.<domain>, wired up in the inbound
-- webhook route, not here). Opaque so the address itself doesn't leak the
-- household's real id if it ever gets typed into a public form/CC'd
-- somewhere by mistake.

alter table households add column receipts_token text;

-- Backfill every existing household before locking the column down —
-- can't add a not-null/unique constraint against a column that's still
-- null on every existing row.
update households
set receipts_token = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
where receipts_token is null;

alter table households alter column receipts_token set not null;
alter table households alter column receipts_token set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
alter table households add constraint households_receipts_token_key unique (receipts_token);

-- No new RLS policy needed: households already has a household-membership
-- select policy, so this column is exactly as protected as the rest of
-- the row for real signed-in users. The inbound webhook route (no user
-- session — it's Resend calling in) looks this column up via the
-- service-role key instead, which bypasses RLS by design, same as every
-- other server-only administrative path in this app.

-- Receipts arriving by email have no physical scan — the existing
-- receipt_scan_batches/scanned_transaction_drafts pipeline (0011) already
-- supports this without new tables: source_image_paths can be empty, and
-- a new 'source' column distinguishes how a batch originated (shown in
-- the review UI so "how did this get here" is never a mystery) without
-- touching any existing row's meaning — default 'scan' preserves it.
alter table receipt_scan_batches add column source text not null default 'scan' check (source in ('scan', 'email'));

-- The webhook has no signed-in user to attribute a batch to
-- (created_by_user_id is not-null, referencing auth.users) — email-
-- sourced batches attribute to the household's owner instead, resolved
-- by the webhook route itself at insert time, not by relaxing this
-- constraint for every batch.
