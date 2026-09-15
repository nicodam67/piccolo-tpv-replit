-- Certification fixes for center attribution. Historical tickets are
-- deliberately not backfilled because an employee may have changed center.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS work_center_id uuid
  REFERENCES hr_work_centers(id) ON DELETE SET NULL;

ALTER TABLE hr_work_centers
  ADD COLUMN IF NOT EXISTS timezone text;

CREATE INDEX IF NOT EXISTS tickets_center_issued_real_idx
  ON tickets(work_center_id, issued_at)
  WHERE is_demo = false AND work_center_id IS NOT NULL;
