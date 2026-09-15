-- Deterministic staffing-demand proposals. Manual staffing requirements remain
-- authoritative and are never deleted by this migration.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS work_center_id uuid REFERENCES hr_work_centers(id) ON DELETE SET NULL;

UPDATE reservations AS reservation
SET work_center_id = employee.work_center_id
FROM employees AS employee
WHERE reservation.work_center_id IS NULL
  AND reservation.created_by = employee.id
  AND employee.work_center_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS staffing_demand_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_group_id uuid NOT NULL DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  name text NOT NULL,
  work_center_id uuid NOT NULL REFERENCES hr_work_centers(id) ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES hr_positions(id) ON DELETE RESTRICT,
  department_id uuid REFERENCES hr_departments(id) ON DELETE SET NULL,
  day_of_week integer CHECK (day_of_week BETWEEN 0 AND 6),
  start_time text NOT NULL,
  end_time text NOT NULL,
  valid_from date,
  valid_to date,
  base_count integer NOT NULL CHECK (base_count >= 0),
  historical_weeks integer NOT NULL CHECK (historical_weeks BETWEEN 1 AND 52),
  minimum_comparable_weeks integer NOT NULL CHECK (minimum_comparable_weeks BETWEEN 1 AND 52),
  historical_metric text CHECK (historical_metric IS NULL OR historical_metric IN ('TICKETS', 'REVENUE', 'GUESTS', 'UNITS')),
  historical_threshold numeric(12,2) CHECK (historical_threshold IS NULL OR historical_threshold > 0),
  historical_increment integer CHECK (historical_increment IS NULL OR historical_increment > 0),
  historical_rounding text CHECK (historical_rounding IS NULL OR historical_rounding IN ('PER_STARTED_BLOCK', 'PER_COMPLETE_BLOCK', 'ON_THRESHOLD')),
  reservation_guest_threshold integer CHECK (reservation_guest_threshold IS NULL OR reservation_guest_threshold > 0),
  reservation_increment integer CHECK (reservation_increment IS NULL OR reservation_increment > 0),
  reservation_rounding text CHECK (reservation_rounding IS NULL OR reservation_rounding IN ('PER_STARTED_BLOCK', 'PER_COMPLETE_BLOCK', 'ON_THRESHOLD')),
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  prep_zone text,
  active boolean NOT NULL DEFAULT true,
  supersedes_rule_id uuid REFERENCES staffing_demand_rules(id) ON DELETE SET NULL,
  created_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CHECK (start_time <> end_time),
  CHECK (minimum_comparable_weeks <= historical_weeks),
  CHECK (
    (historical_metric IS NULL AND historical_threshold IS NULL AND historical_increment IS NULL AND historical_rounding IS NULL)
    OR
    (historical_metric IS NOT NULL AND historical_threshold IS NOT NULL AND historical_increment IS NOT NULL AND historical_rounding IS NOT NULL)
  ),
  CHECK (
    (reservation_guest_threshold IS NULL AND reservation_increment IS NULL AND reservation_rounding IS NULL)
    OR
    (reservation_guest_threshold IS NOT NULL AND reservation_increment IS NOT NULL AND reservation_rounding IS NOT NULL)
  ),
  CHECK (historical_metric = 'UNITS' OR (category_id IS NULL AND prep_zone IS NULL)),
  UNIQUE (rule_group_id, version)
);

CREATE TABLE IF NOT EXISTS staffing_need_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES planning_schedules(id) ON DELETE CASCADE,
  work_center_id uuid NOT NULL REFERENCES hr_work_centers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PROPOSED'
    CHECK (status IN ('PROPOSED', 'REVIEWED', 'APPLIED', 'REJECTED')),
  date_from date NOT NULL,
  date_to date NOT NULL,
  historical_weeks_override integer
    CHECK (historical_weeks_override IS NULL OR historical_weeks_override BETWEEN 1 AND 52),
  timezone text NOT NULL,
  input_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  rules_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  applied_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  applied_at timestamptz,
  rejected_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from)
);

CREATE TABLE IF NOT EXISTS staffing_need_proposal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES staffing_need_proposals(id) ON DELETE CASCADE,
  requirement_date date NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  position_id uuid NOT NULL REFERENCES hr_positions(id) ON DELETE RESTRICT,
  suggested_count integer NOT NULL CHECK (suggested_count >= 0),
  final_count integer NOT NULL CHECK (final_count >= 0),
  assignable_count integer NOT NULL CHECK (assignable_count >= 0),
  difference integer NOT NULL,
  historical_value numeric(12,2),
  reservation_guests integer NOT NULL DEFAULT 0 CHECK (reservation_guests >= 0),
  comparable_weeks integer NOT NULL DEFAULT 0 CHECK (comparable_weeks >= 0),
  explanation jsonb NOT NULL,
  input_snapshot jsonb NOT NULL,
  rule_snapshot jsonb NOT NULL,
  edited_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, requirement_date, start_time, end_time, position_id)
);

CREATE INDEX IF NOT EXISTS staffing_demand_rules_scope_idx
  ON staffing_demand_rules(work_center_id, active, day_of_week);
CREATE INDEX IF NOT EXISTS staffing_need_proposals_schedule_idx
  ON staffing_need_proposals(schedule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staffing_need_proposal_items_proposal_idx
  ON staffing_need_proposal_items(proposal_id);
CREATE INDEX IF NOT EXISTS tickets_employee_issued_real_idx
  ON tickets(employee_id, issued_at) WHERE is_demo = false;
CREATE INDEX IF NOT EXISTS reservations_center_date_status_real_idx
  ON reservations(work_center_id, fecha, status) WHERE is_demo = false;
