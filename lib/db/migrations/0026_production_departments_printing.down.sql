DROP INDEX IF EXISTS print_queue_dedupe_active_idx;
DROP INDEX IF EXISTS print_queue_worker_idx;
ALTER TABLE print_queue
  DROP COLUMN IF EXISTS priority,
  DROP COLUMN IF EXISTS dedupe_key,
  DROP COLUMN IF EXISTS lease_expires_at,
  DROP COLUMN IF EXISTS next_attempt_at;

ALTER TABLE printers
  DROP CONSTRAINT IF EXISTS printers_write_timeout_chk,
  DROP CONSTRAINT IF EXISTS printers_connect_timeout_chk,
  DROP CONSTRAINT IF EXISTS printers_code_page_chk,
  DROP CONSTRAINT IF EXISTS printers_connector_mode_chk,
  DROP COLUMN IF EXISTS write_timeout_ms,
  DROP COLUMN IF EXISTS connect_timeout_ms,
  DROP COLUMN IF EXISTS drawer_enabled,
  DROP COLUMN IF EXISTS cut_enabled,
  DROP COLUMN IF EXISTS code_page,
  DROP COLUMN IF EXISTS connector_mode;

ALTER TABLE kitchen_tasks
  DROP COLUMN IF EXISTS resend_count,
  DROP COLUMN IF EXISTS resent_reason,
  DROP COLUMN IF EXISTS resent_by,
  DROP COLUMN IF EXISTS resent_at;

DROP INDEX IF EXISTS kds_stations_department_id_idx;
ALTER TABLE kds_stations DROP COLUMN IF EXISTS department_id;
DROP TABLE IF EXISTS production_departments;
