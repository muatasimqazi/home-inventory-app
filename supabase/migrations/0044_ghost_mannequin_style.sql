-- Adds "ghost mannequin" (docs/Wardrobe Inventory.md follow-up) to
-- item_studio_photos' allowed styles — a realistic invisible-mannequin
-- render, standard ecommerce apparel photography technique, showing a
-- garment's natural volume/drape as if worn without any visible
-- mannequin, model, or body.
alter table item_studio_photos drop constraint item_studio_photos_style_check;
alter table item_studio_photos add constraint item_studio_photos_style_check
  check (style in ('white_background','transparent_background','studio_shadow','boutique_flat_lay','neutral_lifestyle','ghost_mannequin'));
