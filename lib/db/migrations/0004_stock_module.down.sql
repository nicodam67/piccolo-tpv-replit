-- Down migration: 0004_stock_module
-- CAUTION: data in these tables and columns will be permanently lost.

DROP TABLE IF EXISTS waste_records CASCADE;

ALTER TABLE ingredients
  DROP COLUMN IF EXISTS category_id,
  DROP COLUMN IF EXISTS location_id,
  DROP COLUMN IF EXISTS purchase_unit,
  DROP COLUMN IF EXISTS consumption_unit,
  DROP COLUMN IF EXISTS conversion_factor,
  DROP COLUMN IF EXISTS average_cost,
  DROP COLUMN IF EXISTS last_purchase_cost,
  DROP COLUMN IF EXISTS max_stock;

DROP TABLE IF EXISTS storage_locations CASCADE;
DROP TABLE IF EXISTS ingredient_categories CASCADE;
