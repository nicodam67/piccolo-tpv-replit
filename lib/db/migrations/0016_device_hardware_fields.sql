-- Migration 0016: Hardware fields for offline_devices + device audit log

-- ─── 1. Extend offline_devices ─────────────────────────────────────────────
ALTER TABLE offline_devices
  ADD COLUMN IF NOT EXISTS ip_address         TEXT,
  ADD COLUMN IF NOT EXISTS mac_address        TEXT,
  ADD COLUMN IF NOT EXISTS os                 TEXT,
  ADD COLUMN IF NOT EXISTS browser_version    TEXT,
  ADD COLUMN IF NOT EXISTS assigned_zone_id   UUID REFERENCES room_zones(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_printer_id UUID REFERENCES printers(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cobro_permitido    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS offline_autorizado BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS usuario_habitual   UUID REFERENCES employees(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS device_subtype     TEXT NOT NULL DEFAULT 'otro',
  ADD COLUMN IF NOT EXISTS notes              TEXT;

-- Index for fast IP duplicate detection
CREATE INDEX IF NOT EXISTS idx_offline_devices_ip ON offline_devices(ip_address)
  WHERE ip_address IS NOT NULL;

-- ─── 2. Create device_audit_log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     UUID REFERENCES offline_devices(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  performed_by  UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_audit_log_device ON device_audit_log(device_id);

-- ─── 3. Seed default device slots ──────────────────────────────────────────
-- Five tablet slots + main computer — created once, names are editable by admin

INSERT INTO offline_devices
  (id, name, device_type, device_subtype, fingerprint, cobro_permitido, offline_autorizado, status, offline_perms, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Tablet Sala 1',    'tablet', 'tablet_tpv',         'seed-tablet-sala-1',     TRUE, TRUE, 'pending', '[]', NOW(), NOW()),
  (gen_random_uuid(), 'Tablet Sala 2',    'tablet', 'tablet_tpv',         'seed-tablet-sala-2',     TRUE, TRUE, 'pending', '[]', NOW(), NOW()),
  (gen_random_uuid(), 'Tablet Sala 3',    'tablet', 'tablet_tpv',         'seed-tablet-sala-3',     TRUE, TRUE, 'pending', '[]', NOW(), NOW()),
  (gen_random_uuid(), 'Tablet Terraza 1', 'tablet', 'tablet_tpv',         'seed-tablet-terraza-1',  TRUE, TRUE, 'pending', '[]', NOW(), NOW()),
  (gen_random_uuid(), 'Tablet Encargado', 'tablet', 'tablet_tpv',         'seed-tablet-encargado',  TRUE, TRUE, 'pending', '[]', NOW(), NOW()),
  (gen_random_uuid(), 'Ordenador Principal', 'tpv', 'ordenador_principal','seed-ordenador-principal',TRUE, TRUE, 'pending', '["open_table","add_item","cash_payment","close_session","manage_products","manage_staff"]', NOW(), NOW())
ON CONFLICT (fingerprint) DO NOTHING;
