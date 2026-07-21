CREATE TABLE IF NOT EXISTS clock_authorizations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_hash      text        NOT NULL UNIQUE,
  employee_id     uuid        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  device_id       uuid        NOT NULL REFERENCES tablet_devices(id) ON DELETE CASCADE,
  allowed_action  text        NOT NULL CHECK (
    allowed_action IN ('clock_in', 'clock_out', 'break_start', 'break_end')
  ),
  method          text        NOT NULL DEFAULT 'pin' CHECK (method IN ('pin', 'nfc')),
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clock_authorizations_lookup_idx
  ON clock_authorizations (proof_hash, consumed_at, expires_at);

CREATE INDEX IF NOT EXISTS clock_authorizations_employee_idx
  ON clock_authorizations (employee_id, created_at DESC);
