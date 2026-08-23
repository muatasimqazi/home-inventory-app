-- AI item detection now also suggests a factual description and a rough
-- estimated replacement value (USD) per item, alongside the name/category/
-- quantity it already suggested — both editable during review like every
-- other AI suggestion, and persisted here so they're a real part of the
-- item's record afterward (insurance/net-worth use, not just capture-time
-- flavor text). Manual add/edit can set them too, same as every other item
-- field — this isn't gated to AI-detected items specifically.

alter table items add column description text not null default '';
comment on column items.description is
  'A factual description (material, color, distinguishing features) — separate from notes (open-ended, anything), usually AI-suggested at capture time but editable like any other field. Empty string, not null, matching notes'' own shape.';

alter table items add column estimated_value numeric(12,2) check (estimated_value is null or estimated_value >= 0);
comment on column items.estimated_value is
  'Rough estimated replacement value in USD — null (default) = not estimated. AI-suggested at capture time when it has enough basis to guess; always editable afterward.';
