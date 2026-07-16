-- ═══════════════════════════════════════════════════════════════════════════════
-- 0012_setup_wizard.sql
-- Asistente de configuración inicial y puesta en marcha
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Extend business_config with onboarding fields ────────────────────────
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS moneda          text NOT NULL DEFAULT 'EUR';
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS idioma          text NOT NULL DEFAULT 'es';
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS regimen_fiscal  text NOT NULL DEFAULT 'general';
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS setup_completed boolean NOT NULL DEFAULT false;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS go_live_at      timestamptz;

-- ─── 2. Setup Wizard Sessions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS setup_wizard_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'full'|'quick'|'review'|'add_device'|'add_printer'|'add_kds'|'add_zone'|'add_user'|'change_venue'|'recover'
  mode            text        NOT NULL DEFAULT 'full',
  current_step    text        NOT NULL DEFAULT 'identidad',
  -- JSON array of step ids that have been completed
  completed_steps jsonb       NOT NULL DEFAULT '[]',
  -- JSON array of step ids that were explicitly skipped
  skipped_steps   jsonb       NOT NULL DEFAULT '[]',
  -- Per-step form data preserved across sessions
  data            jsonb       NOT NULL DEFAULT '{}',
  started_by      uuid        REFERENCES employees(id) ON DELETE SET NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  resumed_at      timestamptz,
  completed_at    timestamptz,
  go_live_at      timestamptz,
  -- true → session uses simulation/demo data, never activates production mode
  is_demo         boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS setup_wizard_sessions_mode_idx ON setup_wizard_sessions(mode);
CREATE INDEX IF NOT EXISTS setup_wizard_sessions_started_by_idx ON setup_wizard_sessions(started_by);

-- ─── 3. Setup Audit Log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS setup_audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid        REFERENCES setup_wizard_sessions(id) ON DELETE SET NULL,
  step         text        NOT NULL,
  -- 'step_completed'|'step_skipped'|'test_run'|'simulation_started'|'simulation_cleaned'|'go_live'|'error_dismissed'
  action       text        NOT NULL,
  data         jsonb       NOT NULL DEFAULT '{}',
  performed_by uuid        REFERENCES employees(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS setup_audit_log_session_id_idx ON setup_audit_log(session_id);
CREATE INDEX IF NOT EXISTS setup_audit_log_step_idx ON setup_audit_log(step);
CREATE INDEX IF NOT EXISTS setup_audit_log_created_at_idx ON setup_audit_log(created_at DESC);
