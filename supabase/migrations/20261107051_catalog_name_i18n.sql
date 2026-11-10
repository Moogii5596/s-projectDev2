ALTER TABLE camp_positions
  ADD COLUMN name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE camp_positions SET name_i18n = jsonb_build_object('mn', name);

ALTER TABLE camp_departments
  ADD COLUMN name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE camp_departments SET name_i18n = jsonb_build_object('mn', name);

ALTER TABLE camp_meal_locations
  ADD COLUMN name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE camp_meal_locations SET name_i18n = jsonb_build_object('mn', name);

ALTER TABLE camp_building_types
  ADD COLUMN name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE camp_building_types SET name_i18n = jsonb_build_object('mn', name);

ALTER TABLE camp_asset_categories
  ADD COLUMN name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE camp_asset_categories SET name_i18n = jsonb_build_object('mn', name);
