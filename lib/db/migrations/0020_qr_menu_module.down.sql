-- Rollback for migration 0020: QR Menu Module

ALTER TABLE products
  DROP COLUMN IF EXISTS qr_item_translations,
  DROP COLUMN IF EXISTS description_es,
  DROP COLUMN IF EXISTS name_es,
  DROP COLUMN IF EXISTS description_en,
  DROP COLUMN IF EXISTS name_en;

ALTER TABLE categories
  DROP COLUMN IF EXISTS translations;

ALTER TABLE business_config
  DROP COLUMN IF EXISTS qr_schedule,
  DROP COLUMN IF EXISTS card_settings,
  DROP COLUMN IF EXISTS theme_fonts,
  DROP COLUMN IF EXISTS theme_colors,
  DROP COLUMN IF EXISTS qr_country,
  DROP COLUMN IF EXISTS qr_postal_code,
  DROP COLUMN IF EXISTS qr_province,
  DROP COLUMN IF EXISTS qr_city;
