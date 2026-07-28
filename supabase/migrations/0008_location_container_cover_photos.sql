-- Real cover photos for locations and containers, matching what items
-- already got in 0005_item_cover_photos.sql (a nightstand or a shelf isn't
-- an emoji any more than an item is). Reuses the existing public
-- "item-photos" bucket instead of creating two more nearly-identical
-- buckets — its RLS policies only check the first path segment
-- ((storage.foldername(name))[1] = household id), so any object path
-- under a household's folder is covered regardless of which entity type
-- it belongs to. Object paths follow ${householdId}/${entityId} exactly
-- like items already do; there's no practical id collision risk across
-- entity types (all are random UUIDs) and no policy change is needed.

alter table locations add column cover_photo_path text;
alter table containers add column cover_photo_path text;
