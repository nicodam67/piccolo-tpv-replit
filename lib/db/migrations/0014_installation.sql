-- ═══════════════════════════════════════════════════════════════════════════════
-- 0014_installation.sql
-- Hardware inventory, network registry, and installation test logs
-- All statements use IF NOT EXISTS — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. installation_devices ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS installation_devices (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text        NOT NULL,
  tablet_number           integer,
  device_category         text        NOT NULL DEFAULT 'tablet',
  brand                   text        NOT NULL DEFAULT '',
  model                   text        NOT NULL DEFAULT '',
  os                      text        NOT NULL DEFAULT '',
  browser                 text        NOT NULL DEFAULT '',
  ram                     text        NOT NULL DEFAULT '',
  processor               text        NOT NULL DEFAULT '',
  disk_space              text        NOT NULL DEFAULT '',
  app_version             text        NOT NULL DEFAULT '',
  ip_local                text        NOT NULL DEFAULT '',
  connection_type         text        NOT NULL DEFAULT 'wifi',
  usual_employee_name     text        NOT NULL DEFAULT '',
  usual_zone              text        NOT NULL DEFAULT '',
  payment_allowed         boolean     NOT NULL DEFAULT false,
  offline_authorized      boolean     NOT NULL DEFAULT true,
  default_printer_id      uuid        REFERENCES printers(id) ON DELETE SET NULL,
  main_printer_associated text        NOT NULL DEFAULT '',
  cash_associated         text        NOT NULL DEFAULT '',
  status                  text        NOT NULL DEFAULT 'pending',
  notes                   text        NOT NULL DEFAULT '',
  last_sync_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. network_registry ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS network_registry (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,
  ip                  text        NOT NULL,
  mac                 text        NOT NULL DEFAULT '',
  device_type         text        NOT NULL DEFAULT 'other',
  zone                text        NOT NULL DEFAULT '',
  status              text        NOT NULL DEFAULT 'unknown',
  last_connection_at  timestamptz,
  notes               text        NOT NULL DEFAULT '',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. installation_tests ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS installation_tests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_type     text        NOT NULL,
  device_id     uuid,
  device_name   text        NOT NULL DEFAULT '',
  result        text        NOT NULL DEFAULT 'pending',
  notes         text        NOT NULL DEFAULT '',
  performed_by  text        NOT NULL DEFAULT '',
  metadata      jsonb,
  performed_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
