-- ═══════════════════════════════════════════════════════════════════════════════
-- 0013_audit_findings.sql
-- Panel de diagnóstico y clasificación de módulos
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Audit findings table ──────────────────────────────────────────────────
-- Persists findings so future runs can show trend (was red, now amber, etc.)

CREATE TABLE IF NOT EXISTS audit_findings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Logical module slug, e.g. 'verifactu', 'payments', 'online_orders'
  module          text        NOT NULL,
  -- 'ok' | 'warning' | 'partial' | 'critical' | 'simulated'
  severity        text        NOT NULL DEFAULT 'ok',
  -- Short title shown in the UI
  title           text        NOT NULL,
  -- Longer description / remediation hint
  description     text        NOT NULL DEFAULT '',
  -- ISO timestamp when the automated check detected this finding
  detected_at     timestamptz NOT NULL DEFAULT now(),
  -- Set when the finding is manually resolved (or a subsequent run clears it)
  resolved_at     timestamptz,
  resolved_by     text,
  -- Which run created this row (ISO timestamp of the run)
  run_id          text,
  -- Is this an automated finding (false = manually added)
  automated       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_findings_module_idx ON audit_findings (module);
CREATE INDEX IF NOT EXISTS audit_findings_severity_idx ON audit_findings (severity);
CREATE INDEX IF NOT EXISTS audit_findings_resolved_at_idx ON audit_findings (resolved_at);

-- ─── 2. Audit runs log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          text        NOT NULL UNIQUE,
  triggered_by    text,
  modules_checked integer     NOT NULL DEFAULT 0,
  findings_count  integer     NOT NULL DEFAULT 0,
  critical_count  integer     NOT NULL DEFAULT 0,
  warning_count   integer     NOT NULL DEFAULT 0,
  duration_ms     integer,
  summary         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
