-- Migration: Stock module extensions
-- Applied: 2026-07-16
-- Adds: ingredient_categories, storage_locations, waste_records tables
-- Extends: ingredients with category, location, unit conversion, avg cost, max_stock columns
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ── ingredient_categories ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingredient_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  color       text        NOT NULL DEFAULT '#6366f1',
  icon        text        NOT NULL DEFAULT '📦',
  sort_order  integer     NOT NULL DEFAULT 0,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── storage_locations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS storage_locations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text,
  temperature text        NOT NULL DEFAULT 'ambient',
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── waste_records ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS waste_records (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id   uuid          NOT NULL REFERENCES ingredients(id),
  quantity        numeric(10,4) NOT NULL,
  unit            text          NOT NULL DEFAULT 'ud',
  unit_cost       numeric(10,4) NOT NULL DEFAULT 0,
  total_cost      numeric(10,4) NOT NULL DEFAULT 0,
  reason          text          NOT NULL DEFAULT '',
  waste_type      text          NOT NULL DEFAULT 'expired',
  lot_id          uuid          REFERENCES ingredient_lots(id) ON DELETE SET NULL,
  employee_id     uuid          REFERENCES employees(id) ON DELETE SET NULL,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- ── ingredients: new columns ──────────────────────────────────────────────────
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS category_id        uuid          REFERENCES ingredient_categories(id) ON DELETE SET NULL;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS location_id        uuid          REFERENCES storage_locations(id) ON DELETE SET NULL;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS purchase_unit      text          NOT NULL DEFAULT 'ud';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS consumption_unit   text          NOT NULL DEFAULT 'ud';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS conversion_factor  numeric(10,4) NOT NULL DEFAULT 1;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS average_cost       numeric(10,4) NOT NULL DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS last_purchase_cost numeric(10,4) NOT NULL DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS max_stock          numeric(10,4) NOT NULL DEFAULT 0;

-- Back-fill average_cost from purchase_cost for existing rows
UPDATE ingredients SET average_cost = purchase_cost WHERE average_cost = 0 AND purchase_cost > 0;
UPDATE ingredients SET last_purchase_cost = purchase_cost WHERE last_purchase_cost = 0 AND purchase_cost > 0;
UPDATE ingredients SET purchase_unit = unit WHERE purchase_unit = 'ud' AND unit != 'ud';
UPDATE ingredients SET consumption_unit = unit WHERE consumption_unit = 'ud' AND unit != 'ud';
