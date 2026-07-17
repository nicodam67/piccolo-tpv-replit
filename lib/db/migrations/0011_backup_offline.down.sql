-- Down migration: 0011_backup_offline
-- CAUTION: all backup, offline queue and tech events data will be permanently lost.

DROP INDEX IF EXISTS tech_events_created_at_idx;
DROP INDEX IF EXISTS tech_events_module_idx;
DROP INDEX IF EXISTS tech_events_level_idx;
DROP INDEX IF EXISTS offline_queue_idempotency_idx;
DROP INDEX IF EXISTS offline_queue_status_idx;
DROP INDEX IF EXISTS offline_queue_device_id_idx;

DROP TABLE IF EXISTS tech_events CASCADE;
DROP TABLE IF EXISTS offline_queue CASCADE;
DROP TABLE IF EXISTS offline_devices CASCADE;
DROP TABLE IF EXISTS backup_destinations CASCADE;
DROP TABLE IF EXISTS backup_schedules CASCADE;

ALTER TABLE backup_records
  DROP COLUMN IF EXISTS backup_type,
  DROP COLUMN IF EXISTS destination_id,
  DROP COLUMN IF EXISTS encryption_iv,
  DROP COLUMN IF EXISTS schedule_id,
  DROP COLUMN IF EXISTS pre_action,
  DROP COLUMN IF EXISTS verified,
  DROP COLUMN IF EXISTS protected,
  DROP COLUMN IF EXISTS is_demo;
