-- Adds "ghost mannequin — profile" to item_studio_photos' allowed styles
-- (user follow-up on 0044's ghost_mannequin: the front-on ghost-mannequin
-- shot and every other style tended to read as near-duplicate front
-- views — this is a genuinely rotated three-quarter/side angle of the
-- same invisible-mannequin treatment, meant to pair with ghost_mannequin
-- as a second, complementary angle rather than another front view).
alter table item_studio_photos drop constraint item_studio_photos_style_check;
alter table item_studio_photos add constraint item_studio_photos_style_check
  check (style in ('white_background','transparent_background','studio_shadow','boutique_flat_lay','neutral_lifestyle','ghost_mannequin','ghost_mannequin_profile'));
