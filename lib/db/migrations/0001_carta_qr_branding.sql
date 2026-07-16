-- Migration: carta QR branding fields
-- Applied: 2026-07-16
-- Safe to run multiple times (uses IF NOT EXISTS / IF NOT EXISTS pattern).
-- Columns are nullable or have defaults so existing rows are unaffected.

-- ── products: QR carta extra fields ──────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS half_portion_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS quantity           text,
  ADD COLUMN IF NOT EXISTS is_vegetariano     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_vegano          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_sin_gluten      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_picante         boolean NOT NULL DEFAULT false;

-- ── business_config: QR carta branding fields ────────────────────────────────
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS hero_image_url text         NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hero_video_url text         NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tagline        text         NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS founded_year   integer,
  ADD COLUMN IF NOT EXISTS address        text         NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone          text         NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS opening_hours  jsonb,
  ADD COLUMN IF NOT EXISTS card_layout    text         NOT NULL DEFAULT 'grid',
  ADD COLUMN IF NOT EXISTS accent_color   text         NOT NULL DEFAULT '#ef4444';
