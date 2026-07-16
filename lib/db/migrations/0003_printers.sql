-- Migration: Printing module (printers, print_queue, print_routing, print_audit)
-- Applied: 2026-07-16
-- Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ── printers ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS printers (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,
  type                text        NOT NULL DEFAULT 'cocina',
  brand               text        NOT NULL DEFAULT '',
  model               text        NOT NULL DEFAULT '',
  ip                  text        NOT NULL DEFAULT '',
  port                integer     NOT NULL DEFAULT 9100,
  paper_width         integer     NOT NULL DEFAULT 80,
  copies              integer     NOT NULL DEFAULT 1,
  active              boolean     NOT NULL DEFAULT true,
  is_primary          boolean     NOT NULL DEFAULT true,
  fallback_printer_id uuid        REFERENCES printers(id) ON DELETE SET NULL,
  last_status         text        NOT NULL DEFAULT 'unknown',
  last_status_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── print_queue ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS print_queue (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  printer_id    uuid        NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  order_id      uuid,
  document_type text        NOT NULL,
  content       text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending',
  attempts      integer     NOT NULL DEFAULT 0,
  last_error    text,
  sent_at       timestamptz,
  printed_at    timestamptz,
  actor_id      text,
  actor_name    text,
  meta          jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── print_routing ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS print_routing (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text        NOT NULL,
  entity_id    uuid        NOT NULL,
  printer_ids  jsonb       NOT NULL DEFAULT '[]',
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

-- ── print_audit ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS print_audit (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  print_queue_id uuid,
  action         text        NOT NULL,
  actor_id       text,
  actor_name     text        NOT NULL DEFAULT 'sistema',
  detail         jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── business_config: print fields ─────────────────────────────────────────────
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS print_mode              text    NOT NULL DEFAULT 'kds_only',
  ADD COLUMN IF NOT EXISTS print_template_config   jsonb;
