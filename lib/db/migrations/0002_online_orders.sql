-- Migration: Online Orders module
-- Applied: 2026-07-16
-- Safe to run multiple times (uses IF NOT EXISTS / CREATE TABLE IF NOT EXISTS).
-- All new columns are nullable or have defaults so existing rows are unaffected.

-- ── orders: online-order columns ─────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS channel                text         NOT NULL DEFAULT 'tpv',
  ADD COLUMN IF NOT EXISTS delivery_type          text         NOT NULL DEFAULT 'table',
  ADD COLUMN IF NOT EXISTS order_number           text,
  ADD COLUMN IF NOT EXISTS scheduled_at           timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_ready_at     timestamptz,
  ADD COLUMN IF NOT EXISTS client_phone           text         NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivery_address_id    uuid,
  ADD COLUMN IF NOT EXISTS courier_id             uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason       text,
  ADD COLUMN IF NOT EXISTS online_payment_ref     text,
  ADD COLUMN IF NOT EXISTS online_payment_status  text         NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS packaging_checked_by   uuid,
  ADD COLUMN IF NOT EXISTS packaging_checked_at   timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_fee           numeric(10,2) NOT NULL DEFAULT 0;

-- ── delivery_addresses ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_addresses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid,
  name        text        NOT NULL DEFAULT '',
  phone       text        NOT NULL DEFAULT '',
  street      text        NOT NULL DEFAULT '',
  number      text        NOT NULL DEFAULT '',
  floor       text        NOT NULL DEFAULT '',
  postal_code text        NOT NULL DEFAULT '',
  city        text        NOT NULL DEFAULT '',
  notes       text        NOT NULL DEFAULT '',
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── online_orders_config ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS online_orders_config (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  takeaway_enabled     boolean       NOT NULL DEFAULT false,
  delivery_enabled     boolean       NOT NULL DEFAULT false,
  schedule             jsonb,
  prep_time_minutes    integer       NOT NULL DEFAULT 30,
  min_order            numeric(10,2) NOT NULL DEFAULT 0,
  min_order_delivery   numeric(10,2) NOT NULL DEFAULT 15,
  delivery_fee         numeric(10,2) NOT NULL DEFAULT 3,
  free_delivery_from   numeric(10,2),
  max_advance_hours    integer       NOT NULL DEFAULT 48,
  max_orders_per_slot  integer       NOT NULL DEFAULT 10,
  paused               boolean       NOT NULL DEFAULT false,
  pause_reason         text          NOT NULL DEFAULT '',
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

-- Seed default config row if the table is empty
INSERT INTO online_orders_config (takeaway_enabled, delivery_enabled)
SELECT true, true
WHERE NOT EXISTS (SELECT 1 FROM online_orders_config);

-- ── delivery_zones ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_zones (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text          NOT NULL,
  type              text          NOT NULL DEFAULT 'postal_code',
  value             jsonb         NOT NULL DEFAULT '{}',
  delivery_fee      numeric(10,2) NOT NULL DEFAULT 0,
  min_order         numeric(10,2) NOT NULL DEFAULT 0,
  estimated_minutes integer       NOT NULL DEFAULT 45,
  active            boolean       NOT NULL DEFAULT true,
  sort_order        integer       NOT NULL DEFAULT 0,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

-- ── couriers ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS couriers (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  phone      text        NOT NULL DEFAULT '',
  status     text        NOT NULL DEFAULT 'available',
  active     boolean     NOT NULL DEFAULT true,
  token      text        NOT NULL DEFAULT gen_random_uuid()::text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add token column to existing installs that already have the couriers table
ALTER TABLE couriers
  ADD COLUMN IF NOT EXISTS token text NOT NULL DEFAULT gen_random_uuid()::text;

-- Backfill empty tokens on existing rows (idempotent)
UPDATE couriers SET token = gen_random_uuid()::text WHERE token = '' OR token IS NULL;

-- ── online_order_audit ────────────────────────────────────────────────────────
-- Columns match the Drizzle schema in lib/db/src/schema/online-orders.ts
CREATE TABLE IF NOT EXISTS online_order_audit (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid        NOT NULL REFERENCES orders(id),
  event      text        NOT NULL,
  user_id    uuid,
  user_name  text        NOT NULL DEFAULT '',
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── notification_log ──────────────────────────────────────────────────────────
-- Columns match the Drizzle schema in lib/db/src/schema/online-orders.ts
CREATE TABLE IF NOT EXISTS notification_log (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id  uuid        REFERENCES orders(id),
  type      text        NOT NULL,
  recipient text        NOT NULL DEFAULT '',
  payload   jsonb,
  sent_at   timestamptz NOT NULL DEFAULT now(),
  simulated boolean     NOT NULL DEFAULT true
);
