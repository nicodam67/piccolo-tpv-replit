DROP INDEX IF EXISTS planning_issues_schedule_idx;
DROP INDEX IF EXISTS time_records_planned_shift_idx;
DROP INDEX IF EXISTS shifts_employee_date_idx;
DROP INDEX IF EXISTS shifts_schedule_idx;
DROP INDEX IF EXISTS employee_availability_employee_date_idx;
DROP INDEX IF EXISTS staffing_requirements_schedule_idx;
DROP INDEX IF EXISTS planning_schedules_status_idx;
DROP INDEX IF EXISTS planning_schedules_dates_idx;

ALTER TABLE time_records DROP COLUMN IF EXISTS planned_shift_id;
ALTER TABLE shifts DROP COLUMN IF EXISTS updated_at;
ALTER TABLE shifts DROP COLUMN IF EXISTS origin;
ALTER TABLE shifts DROP COLUMN IF EXISTS requirement_id;
ALTER TABLE shifts DROP COLUMN IF EXISTS position_id;
ALTER TABLE shifts DROP COLUMN IF EXISTS schedule_id;

DROP TABLE IF EXISTS planning_issues;
DROP TABLE IF EXISTS employee_availability;
DROP TABLE IF EXISTS employee_planning_profiles;
DROP TABLE IF EXISTS staffing_requirements;
DROP TABLE IF EXISTS planning_schedules;
