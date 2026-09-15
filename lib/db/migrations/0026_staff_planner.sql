-- Automatic staff planner. Existing employees, positions, absences and shifts
-- remain authoritative; all additions are nullable or isolated.

CREATE TABLE IF NOT EXISTS planning_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  work_center_id uuid REFERENCES hr_work_centers(id) ON DELETE SET NULL,
  generation_source text NOT NULL DEFAULT 'manual',
  generated_at timestamptz,
  generated_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  published_at timestamptz,
  published_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from)
);

CREATE TABLE IF NOT EXISTS staffing_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES planning_schedules(id) ON DELETE CASCADE,
  requirement_date date NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  position_id uuid NOT NULL REFERENCES hr_positions(id) ON DELETE RESTRICT,
  required_count integer NOT NULL CHECK (required_count > 0),
  source text NOT NULL DEFAULT 'manual',
  source_metadata jsonb,
  created_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, requirement_date, start_time, end_time, position_id)
);

CREATE TABLE IF NOT EXISTS employee_planning_profiles (
  employee_id uuid PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  max_weekly_minutes integer CHECK (max_weekly_minutes IS NULL OR max_weekly_minutes > 0),
  min_rest_minutes integer NOT NULL DEFAULT 720 CHECK (min_rest_minutes >= 0),
  allows_split_shift boolean NOT NULL DEFAULT false,
  working_days jsonb NOT NULL DEFAULT '[1,2,3,4,5,6,0]'::jsonb,
  preferred_windows jsonb NOT NULL DEFAULT '[]'::jsonb,
  restrictions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  availability_type text NOT NULL CHECK (availability_type IN ('AVAILABLE', 'UNAVAILABLE', 'PREFERRED')),
  availability_date date,
  day_of_week integer CHECK (day_of_week BETWEEN 0 AND 6),
  start_time text,
  end_time text,
  reason text,
  valid_from date,
  valid_to date,
  created_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (availability_date IS NOT NULL OR day_of_week IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS planning_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES planning_schedules(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES shifts(id) ON DELETE CASCADE,
  requirement_id uuid REFERENCES staffing_requirements(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  code text NOT NULL,
  severity text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  details jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES planning_schedules(id) ON DELETE CASCADE;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES hr_positions(id) ON DELETE SET NULL;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS requirement_id uuid REFERENCES staffing_requirements(id) ON DELETE SET NULL;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE time_records ADD COLUMN IF NOT EXISTS planned_shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS planning_schedules_dates_idx ON planning_schedules(date_from, date_to);
CREATE INDEX IF NOT EXISTS planning_schedules_status_idx ON planning_schedules(status);
CREATE INDEX IF NOT EXISTS staffing_requirements_schedule_idx ON staffing_requirements(schedule_id);
CREATE INDEX IF NOT EXISTS employee_availability_employee_date_idx ON employee_availability(employee_id, availability_date);
CREATE INDEX IF NOT EXISTS shifts_schedule_idx ON shifts(schedule_id);
CREATE INDEX IF NOT EXISTS shifts_employee_date_idx ON shifts(employee_id, shift_date);
CREATE INDEX IF NOT EXISTS time_records_planned_shift_idx ON time_records(planned_shift_id);
CREATE INDEX IF NOT EXISTS planning_issues_schedule_idx ON planning_issues(schedule_id);
