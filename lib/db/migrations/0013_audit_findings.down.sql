-- Down migration: 0013_audit_findings
-- CAUTION: all audit findings and run history will be permanently lost.

DROP INDEX IF EXISTS audit_findings_resolved_at_idx;
DROP INDEX IF EXISTS audit_findings_severity_idx;
DROP INDEX IF EXISTS audit_findings_module_idx;

DROP TABLE IF EXISTS audit_runs CASCADE;
DROP TABLE IF EXISTS audit_findings CASCADE;
