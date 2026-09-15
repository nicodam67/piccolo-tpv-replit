-- Published shift-change workflow. Additive and isolated from existing HR requests.

CREATE TABLE IF NOT EXISTS shift_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL
    CHECK (request_type IN ('SWAP', 'TRANSFER', 'TIME_CHANGE', 'OPEN_REQUEST')),
  status text NOT NULL DEFAULT 'PENDING_RECIPIENT'
    CHECK (status IN (
      'PENDING_RECIPIENT', 'PENDING_MANAGER', 'REJECTED_BY_RECIPIENT',
      'REJECTED_BY_MANAGER', 'APPROVED', 'CANCELLED', 'EXPIRED'
    )),
  schedule_id uuid NOT NULL REFERENCES planning_schedules(id) ON DELETE RESTRICT,
  requester_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  recipient_id uuid REFERENCES employees(id) ON DELETE RESTRICT,
  original_shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
  counterpart_shift_id uuid REFERENCES shifts(id) ON DELETE RESTRICT,
  original_shift_updated_at timestamptz NOT NULL,
  counterpart_shift_updated_at timestamptz,
  original_snapshot jsonb NOT NULL,
  counterpart_snapshot jsonb,
  proposal jsonb NOT NULL DEFAULT '{}'::jsonb,
  requester_comment text,
  manager_comment text,
  validation_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz,
  resolved_at timestamptz,
  approved_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id <> recipient_id OR recipient_id IS NULL),
  CHECK (
    (request_type = 'SWAP' AND recipient_id IS NOT NULL AND counterpart_shift_id IS NOT NULL)
    OR (request_type = 'TRANSFER' AND recipient_id IS NOT NULL AND counterpart_shift_id IS NULL)
    OR (request_type IN ('TIME_CHANGE', 'OPEN_REQUEST') AND counterpart_shift_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS shift_change_locks (
  request_id uuid NOT NULL REFERENCES shift_change_requests(id) ON DELETE CASCADE,
  shift_id uuid PRIMARY KEY REFERENCES shifts(id) ON DELETE CASCADE,
  expected_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shift_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES shift_change_requests(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  action text NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  comment text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shift_change_requests_requester_idx
  ON shift_change_requests(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shift_change_requests_recipient_idx
  ON shift_change_requests(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shift_change_requests_status_idx
  ON shift_change_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS shift_change_requests_schedule_idx
  ON shift_change_requests(schedule_id);
CREATE INDEX IF NOT EXISTS shift_change_events_request_idx
  ON shift_change_events(request_id, created_at);
