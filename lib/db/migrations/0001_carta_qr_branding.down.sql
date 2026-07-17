-- Down migration: 0001_carta_qr_branding
-- Reverses QR carta branding fields on products and business_config.
-- CAUTION: data in these columns will be permanently lost.

ALTER TABLE products
  DROP COLUMN IF EXISTS half_portion_price,
  DROP COLUMN IF EXISTS quantity,
  DROP COLUMN IF EXISTS is_vegetariano,
  DROP COLUMN IF EXISTS is_vegano,
  DROP COLUMN IF EXISTS is_sin_gluten,
  DROP COLUMN IF EXISTS is_picante;

ALTER TABLE business_config
  DROP COLUMN IF EXISTS hero_image_url,
  DROP COLUMN IF EXISTS hero_video_url,
  DROP COLUMN IF EXISTS tagline,
  DROP COLUMN IF EXISTS founded_year,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS opening_hours,
  DROP COLUMN IF EXISTS card_layout,
  DROP COLUMN IF EXISTS accent_color;
