-- Migration: Online Orders v2 — QR table sessions, cart persistence,
-- payment attempts, product availability rules, translations, and new config columns.
-- Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ── orders: new columns ────────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS scheduled_for      timestamptz,
  ADD COLUMN IF NOT EXISTS tip_amount         numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idempotency_key    text,
  ADD COLUMN IF NOT EXISTS table_session_id   uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ── online_orders_config: new columns ─────────────────────────────────────────
ALTER TABLE online_orders_config
  ADD COLUMN IF NOT EXISTS tip_enabled         boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tip_percentages     jsonb    NOT NULL DEFAULT '[5,10,15,20]',
  ADD COLUMN IF NOT EXISTS table_ordering_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_publishable_key text   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stripe_secret_key   text     NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stripe_webhook_secret text   NOT NULL DEFAULT '';

-- ── categories: translation columns ───────────────────────────────────────────
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS name_en text NOT NULL DEFAULT '';

-- ── products: translation columns ─────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS name_en        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS name_es        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description_es text NOT NULL DEFAULT '';

-- ── table_sessions ─────────────────────────────────────────────────────────────
-- Created when a customer scans a QR code at a table.
CREATE TABLE IF NOT EXISTS table_sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id     uuid        REFERENCES tables(id) ON DELETE SET NULL,
  zone_id      uuid        REFERENCES zones(id) ON DELETE SET NULL,
  table_label  text        NOT NULL DEFAULT '',
  zone_label   text        NOT NULL DEFAULT '',
  token        text        NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  status       text        NOT NULL DEFAULT 'open',   -- open | closed | expired
  guest_name   text        NOT NULL DEFAULT '',
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '4 hours'),
  closed_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ts_token      ON table_sessions(token);
CREATE INDEX IF NOT EXISTS idx_ts_table_id   ON table_sessions(table_id);
CREATE INDEX IF NOT EXISTS idx_ts_created_at ON table_sessions(created_at);

-- ── online_carts ───────────────────────────────────────────────────────────────
-- Server-side cart for session persistence across page reloads.
CREATE TABLE IF NOT EXISTS online_carts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token   text        NOT NULL,   -- matches table_sessions.token or a cookie UUID
  delivery_type   text        NOT NULL DEFAULT 'takeaway',
  items           jsonb       NOT NULL DEFAULT '[]',
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oc_session_token ON online_carts(session_token);
CREATE INDEX IF NOT EXISTS idx_oc_updated_at ON online_carts(updated_at);

-- ── payment_attempts ───────────────────────────────────────────────────────────
-- Tracks every payment-gateway interaction for an order (real or simulated).
CREATE TABLE IF NOT EXISTS payment_attempts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid        REFERENCES orders(id) ON DELETE CASCADE,
  provider        text        NOT NULL DEFAULT 'stripe',  -- stripe | simulator
  external_id     text        NOT NULL DEFAULT '',        -- Stripe PaymentIntent id
  status          text        NOT NULL DEFAULT 'pending', -- pending | succeeded | failed | refunded
  amount_cents    integer     NOT NULL DEFAULT 0,
  currency        text        NOT NULL DEFAULT 'eur',
  error_message   text        NOT NULL DEFAULT '',
  raw_response    jsonb,
  refunded_at     timestamptz,
  refund_ref      text        NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pa_order_id    ON payment_attempts(order_id);
CREATE INDEX IF NOT EXISTS idx_pa_external_id ON payment_attempts(external_id);

-- ── product_availability_rules ─────────────────────────────────────────────────
-- Restrict product visibility by time-of-day / day-of-week on the public menu.
CREATE TABLE IF NOT EXISTS product_availability_rules (
  id           uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid     REFERENCES products(id) ON DELETE CASCADE,
  category_id  uuid     REFERENCES categories(id) ON DELETE CASCADE,
  label        text     NOT NULL DEFAULT '',
  days_of_week jsonb    NOT NULL DEFAULT '[0,1,2,3,4,5,6]',  -- 0=Sun...6=Sat
  time_from    text     NOT NULL DEFAULT '00:00',             -- HH:MM
  time_to      text     NOT NULL DEFAULT '23:59',
  active       boolean  NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_par_product_id  ON product_availability_rules(product_id);
CREATE INDEX IF NOT EXISTS idx_par_category_id ON product_availability_rules(category_id);
