-- Certification fixes for center attribution. Historical tickets are
-- deliberately not backfilled because an employee may have changed center.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS work_center_id uuid
  REFERENCES hr_work_centers(id) ON DELETE SET NULL;

ALTER TABLE hr_work_centers
  ADD COLUMN IF NOT EXISTS timezone text;

-- 0028 temporarily inferred historical reservation centers from the creator.
-- Creation predates the migration for those rows, so this precisely removes
-- only that inferred attribution while retaining post-migration explicit data.
UPDATE reservations AS reservation
SET work_center_id = NULL
FROM employees AS employee, schema_migrations AS migration
WHERE migration.version = '0028_staffing_demand'
  AND reservation.created_at < migration.applied_at
  AND reservation.created_by = employee.id
  AND reservation.work_center_id = employee.work_center_id;

CREATE INDEX IF NOT EXISTS tickets_center_issued_real_idx
  ON tickets(work_center_id, issued_at)
  WHERE is_demo = false AND work_center_id IS NOT NULL;
