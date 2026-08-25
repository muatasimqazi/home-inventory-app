-- Merchant icon for each transaction — Plaid's own transaction data
-- already includes a real 100x100 merchant logo PNG (logo_url) that the
-- app was discarding entirely. Forward-only by deliberate choice: only
-- ever set at sync time (handleAdded/handleModified in lib/plaid/sync.ts)
-- going forward, never backfilled for transactions already synced before
-- this existed — those, and every non-Plaid transaction (manual/
-- csv_import/receipt_scan, which have no logo source at all), fall back
-- to a first-letter avatar client-side instead.
alter table transactions
  add column merchant_logo_url text;
