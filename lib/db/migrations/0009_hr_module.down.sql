-- Down migration: 0009_hr_module
-- CAUTION: all HR/fichaje data will be permanently lost.

DROP INDEX IF EXISTS time_records_import_history_id_idx;
DROP INDEX IF EXISTS hr_notifications_employee_id_idx;
DROP INDEX IF EXISTS hr_employee_requests_status_idx;
DROP INDEX IF EXISTS hr_employee_requests_employee_id_idx;
DROP INDEX IF EXISTS hr_import_rows_employee_id_idx;
DROP INDEX IF EXISTS hr_import_rows_import_id_idx;
DROP INDEX IF EXISTS employees_email_idx;
DROP INDEX IF EXISTS employees_employee_number_idx;

DROP TABLE IF EXISTS hr_notifications CASCADE;
DROP TABLE IF EXISTS hr_employee_requests CASCADE;
DROP TABLE IF EXISTS hr_pay_periods CASCADE;
DROP TABLE IF EXISTS hr_import_rows CASCADE;
DROP TABLE IF EXISTS hr_import_history CASCADE;
DROP TABLE IF EXISTS hr_import_templates CASCADE;
DROP TABLE IF EXISTS hr_employee_external_ids CASCADE;
DROP TABLE IF EXISTS hr_employee_positions CASCADE;

ALTER TABLE employees
  DROP COLUMN IF EXISTS last_name,
  DROP COLUMN IF EXISTS employee_number,
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS hire_date,
  DROP COLUMN IF EXISTS termination_date,
  DROP COLUMN IF EXISTS emp_status,
  DROP COLUMN IF EXISTS position_id,
  DROP COLUMN IF EXISTS department_id,
  DROP COLUMN IF EXISTS work_center_id,
  DROP COLUMN IF EXISTS monthly_salary,
  DROP COLUMN IF EXISTS employer_cost_rate,
  DROP COLUMN IF EXISTS external_code,
  DROP COLUMN IF EXISTS photo_url,
  DROP COLUMN IF EXISTS emergency_contact,
  DROP COLUMN IF EXISTS emp_notes,
  DROP COLUMN IF EXISTS is_demo;

DROP TABLE IF EXISTS hr_work_centers CASCADE;
DROP TABLE IF EXISTS hr_departments CASCADE;
DROP TABLE IF EXISTS hr_positions CASCADE;
