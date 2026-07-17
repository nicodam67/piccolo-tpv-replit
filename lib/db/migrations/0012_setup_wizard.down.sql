-- Down migration: 0012_setup_wizard
-- CAUTION: all setup wizard sessions and audit logs will be permanently lost.

DROP INDEX IF EXISTS setup_audit_log_created_at_idx;
DROP INDEX IF EXISTS setup_audit_log_step_idx;
DROP INDEX IF EXISTS setup_audit_log_session_id_idx;
DROP INDEX IF EXISTS setup_wizard_sessions_started_by_idx;
DROP INDEX IF EXISTS setup_wizard_sessions_mode_idx;

DROP TABLE IF EXISTS setup_audit_log CASCADE;
DROP TABLE IF EXISTS setup_wizard_sessions CASCADE;

ALTER TABLE business_config
  DROP COLUMN IF EXISTS moneda,
  DROP COLUMN IF EXISTS idioma,
  DROP COLUMN IF EXISTS regimen_fiscal,
  DROP COLUMN IF EXISTS setup_completed,
  DROP COLUMN IF EXISTS go_live_at;
