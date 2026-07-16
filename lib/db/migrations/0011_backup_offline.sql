-- ═══════════════════════════════════════════════════════════════════════════════
-- 0011_backup_offline.sql
-- Copias de seguridad, diagnóstico técnico y modo sin conexión
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Extend backup_records with new columns ───────────────────────────────
ALTER TABLE backup_records ADD COLUMN IF NOT EXISTS backup_type  text NOT NULL DEFAULT 'full';      -- 'full'|'incremental'|'config'|'docs'
ALTER TABLE backup_records ADD COLUMN IF NOT EXISTS destination_id uuid;
ALTER TABLE backup_records ADD COLUMN IF NOT EXISTS encryption_iv text;
ALTER TABLE backup_records ADD COLUMN IF NOT EXISTS schedule_id  uuid;
ALTER TABLE backup_records ADD COLUMN IF NOT EXISTS pre_action   text;        -- 'migration'|'restore'|'update'|'manual'
ALTER TABLE backup_records ADD COLUMN IF NOT EXISTS verified     boolean NOT NULL DEFAULT false;
ALTER TABLE backup_records ADD COLUMN IF NOT EXISTS protected    boolean NOT NULL DEFAULT false;
ALTER TABLE backup_records ADD COLUMN IF NOT EXISTS is_demo      boolean NOT NULL DEFAULT false;

-- ─── 2. Backup Schedules ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backup_schedules (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  -- 'hourly'|'daily'|'weekly'|'monthly'
  frequency     text        NOT NULL DEFAULT 'daily',
  -- Hour of day (0-23) for daily/weekly/monthly
  hour          integer     NOT NULL DEFAULT 3,
  -- Day of week (0=Sun..6=Sat) for weekly
  day_of_week   integer,
  -- Day of month (1-28) for monthly
  day_of_month  integer,
  backup_type   text        NOT NULL DEFAULT 'full',
  -- How many copies to keep
  retention     integer     NOT NULL DEFAULT 7,
  destination_id uuid,
  active        boolean     NOT NULL DEFAULT true,
  last_run_at   timestamptz,
  next_run_at   timestamptz,
  last_status   text        NOT NULL DEFAULT 'pending',  -- 'pending'|'running'|'ok'|'error'
  last_error    text,
  created_by    uuid        REFERENCES employees(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. Backup Destinations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backup_destinations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  -- 'internal'|'download'|'sftp' (driver pattern — sftp implemented in future)
  dest_type     text        NOT NULL DEFAULT 'internal',
  config        jsonb       NOT NULL DEFAULT '{}',  -- encrypted config per type
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── 4. Offline Devices ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offline_devices (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  -- 'tpv'|'kds'|'tablet'|'mobile'|'kiosk'
  device_type     text        NOT NULL DEFAULT 'tpv',
  fingerprint     text        NOT NULL UNIQUE,
  employee_id     uuid        REFERENCES employees(id) ON DELETE SET NULL,
  -- 'online'|'offline'|'syncing'|'blocked'|'revoked'
  status          text        NOT NULL DEFAULT 'offline',
  offline_perms   jsonb       NOT NULL DEFAULT '[]',  -- allowed offline operations
  last_seen_at    timestamptz,
  last_sync_at    timestamptz,
  pending_ops     integer     NOT NULL DEFAULT 0,
  is_demo         boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── 5. Offline Queue ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offline_queue (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id         uuid        REFERENCES offline_devices(id) ON DELETE SET NULL,
  employee_id       uuid        REFERENCES employees(id) ON DELETE SET NULL,
  -- 'open_table'|'add_item'|'remove_item'|'cash_payment'|'clock_in'|'clock_out'
  operation_type    text        NOT NULL,
  -- Unique key: device_id + operation_type + entity_id + client_timestamp
  idempotency_key   text        NOT NULL UNIQUE,
  payload           jsonb       NOT NULL DEFAULT '{}',
  -- 'pending'|'sending'|'synced'|'conflict'|'failed'|'skipped'
  status            text        NOT NULL DEFAULT 'pending',
  attempts          integer     NOT NULL DEFAULT 0,
  last_error        text,
  -- Result payload stored after successful sync (for idempotent retries)
  result_payload    jsonb,
  is_demo           boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  synced_at         timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offline_queue_device_id_idx   ON offline_queue(device_id);
CREATE INDEX IF NOT EXISTS offline_queue_status_idx      ON offline_queue(status);
CREATE INDEX IF NOT EXISTS offline_queue_idempotency_idx ON offline_queue(idempotency_key);

-- ─── 6. Tech Events ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tech_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'info'|'warning'|'error'|'critical'
  level       text        NOT NULL DEFAULT 'info',
  module      text        NOT NULL DEFAULT 'system',
  device_id   uuid        REFERENCES offline_devices(id) ON DELETE SET NULL,
  message     text        NOT NULL,
  code        text,
  data        jsonb       NOT NULL DEFAULT '{}',
  resolved    boolean     NOT NULL DEFAULT false,
  resolved_at timestamptz,
  is_demo     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tech_events_level_idx      ON tech_events(level);
CREATE INDEX IF NOT EXISTS tech_events_module_idx     ON tech_events(module);
CREATE INDEX IF NOT EXISTS tech_events_created_at_idx ON tech_events(created_at DESC);
