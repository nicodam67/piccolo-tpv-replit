-- Down migration: 0016_device_hardware_fields
-- CAUTION: device audit log and hardware field data will be permanently lost.

DROP INDEX IF EXISTS idx_device_audit_log_device;
DROP INDEX IF EXISTS idx_offline_devices_ip;

DROP TABLE IF EXISTS device_audit_log CASCADE;

-- Remove seeded default device slots (only the seed rows, by fingerprint)
DELETE FROM offline_devices WHERE fingerprint IN (
  'seed-tablet-sala-1', 'seed-tablet-sala-2', 'seed-tablet-sala-3',
  'seed-tablet-terraza-1', 'seed-tablet-encargado', 'seed-ordenador-principal'
);

ALTER TABLE offline_devices
  DROP COLUMN IF EXISTS ip_address,
  DROP COLUMN IF EXISTS mac_address,
  DROP COLUMN IF EXISTS os,
  DROP COLUMN IF EXISTS browser_version,
  DROP COLUMN IF EXISTS assigned_zone_id,
  DROP COLUMN IF EXISTS default_printer_id,
  DROP COLUMN IF EXISTS cobro_permitido,
  DROP COLUMN IF EXISTS offline_autorizado,
  DROP COLUMN IF EXISTS usuario_habitual,
  DROP COLUMN IF EXISTS device_subtype,
  DROP COLUMN IF EXISTS notes;
