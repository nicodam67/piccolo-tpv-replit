-- Migration: Delivery module v2
-- Extends the online orders module with: extended courier profiles,
-- order status history, and courier settlements.
-- Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ── couriers: extended profile ────────────────────────────────────────────────
ALTER TABLE couriers
  ADD COLUMN IF NOT EXISTS vehicle_type        text          NOT NULL DEFAULT 'moto',
  ADD COLUMN IF NOT EXISTS plate               text          NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS zona_habitual       text          NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS turno               text          NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS earned_cash_pending numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS earned_card_pending numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_deliveries    integer       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_delivery_minutes integer      NOT NULL DEFAULT 0;

-- ── delivery_order_status_history ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_order_status_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status  text,
  to_status    text        NOT NULL,
  changed_by   uuid,
  changed_by_name text     NOT NULL DEFAULT '',
  device       text        NOT NULL DEFAULT '',
  note         text        NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dosh_order_id ON delivery_order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_dosh_created_at ON delivery_order_status_history(created_at);

-- ── courier_settlements ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courier_settlements (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id      uuid          NOT NULL REFERENCES couriers(id) ON DELETE CASCADE,
  period_start    timestamptz   NOT NULL,
  period_end      timestamptz   NOT NULL,
  orders_count    integer       NOT NULL DEFAULT 0,
  total_cash      numeric(10,2) NOT NULL DEFAULT 0,
  total_card      numeric(10,2) NOT NULL DEFAULT 0,
  total_online    numeric(10,2) NOT NULL DEFAULT 0,
  tips            numeric(10,2) NOT NULL DEFAULT 0,
  expenses        numeric(10,2) NOT NULL DEFAULT 0,
  differences     numeric(10,2) NOT NULL DEFAULT 0,
  closed_by       uuid,
  closed_by_name  text          NOT NULL DEFAULT '',
  notes           text          NOT NULL DEFAULT '',
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_courier_id ON courier_settlements(courier_id);
CREATE INDEX IF NOT EXISTS idx_cs_created_at ON courier_settlements(created_at);
