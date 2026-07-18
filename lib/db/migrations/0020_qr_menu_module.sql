-- Migration 0020: QR Menu Module
-- Adds columns needed by the QR carta and admin QR-menu module.
-- All statements use IF NOT EXISTS — safe to re-run on already-upgraded DBs.

-- ── business_config: QR-menu extended branding columns ───────────────────────
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS qr_city        text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS qr_province    text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS qr_postal_code text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS qr_country     text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS theme_colors   jsonb,
  ADD COLUMN IF NOT EXISTS theme_fonts    jsonb,
  ADD COLUMN IF NOT EXISTS card_settings  jsonb,
  ADD COLUMN IF NOT EXISTS qr_schedule    jsonb;

-- ── categories: multi-language translations ───────────────────────────────────
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS translations   jsonb;

-- ── products: multi-language translations and legacy EN columns ───────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS name_en            text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description_en     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS name_es            text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description_es     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS qr_item_translations jsonb;
