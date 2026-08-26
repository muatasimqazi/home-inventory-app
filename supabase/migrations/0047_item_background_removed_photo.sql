-- Automatic background removal for every AI-detected item during capture
-- (user request; the earlier per-item-cost deferral no longer applies —
-- @imgly/background-removal-node runs local segmentation, not a paid
-- generative API call). A single nullable column, not a history table
-- like item_studio_photos (0043) — this is one automatic, deterministic
-- result per item with no user-chosen styles, retries, or batches, so a
-- second row-per-attempt table would model something that doesn't exist
-- here. No RLS/realtime changes needed: it's just another column on
-- items, already covered by that table's existing policies.
alter table items add column background_removed_photo_path text;
