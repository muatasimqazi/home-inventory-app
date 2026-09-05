-- Household location (Overview weather widget, docs note: future
-- weather-aware suggestions like "it's going to rain, wear your jacket").
-- Lives on households, not members — this is "where the house is," a
-- single physical place the whole household shares, same reasoning as
-- Locations/Home Map already being household-scoped rather than per-member.
-- All three nullable: a household that never sets a location just doesn't
-- get the weather widget (see needsAttentionChips-style "omit, don't show
-- a broken state" precedent elsewhere in this app), not an error.
--
-- Editable the same way household name already is — "household owner
-- update" (0001_init.sql) already covers any column on this row, so no
-- new RLS policy is needed here.

alter table households add column latitude double precision;
alter table households add column longitude double precision;
-- Human-readable label for display ("Austin, TX") — resolved once at
-- set-time (either from the browser's reverse-geocode-free raw
-- coordinates, labeled generically, or from the geocoding search result's
-- own name) and stored alongside the coordinates rather than re-resolved
-- on every page load.
alter table households add column location_label text;

comment on column households.latitude is 'Household''s home location (Overview weather widget) — null until a household member sets one.';
comment on column households.longitude is 'See latitude.';
comment on column households.location_label is 'Human-readable label for latitude/longitude, e.g. "Austin, TX" — display only, not used for the weather lookup itself.';
