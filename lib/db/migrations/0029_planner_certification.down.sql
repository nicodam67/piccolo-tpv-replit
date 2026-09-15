DROP INDEX IF EXISTS tickets_center_issued_real_idx;
ALTER TABLE hr_work_centers DROP COLUMN IF EXISTS timezone;
ALTER TABLE tickets DROP COLUMN IF EXISTS work_center_id;
