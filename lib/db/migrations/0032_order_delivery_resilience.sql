-- Durable order delivery, configurable departments and honest printer state.

CREATE TABLE IF NOT EXISTS production_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'production',
  workflow text NOT NULL DEFAULT 'standard',
  kds_enabled boolean NOT NULL DEFAULT true,
  printer_enabled boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_departments_code_format
    CHECK (code ~ '^[a-z0-9][a-z0-9_-]{1,49}$'),
  CONSTRAINT production_departments_kind_check
    CHECK (kind IN ('production', 'pass', 'none')),
  CONSTRAINT production_departments_workflow_check
    CHECK (workflow IN ('standard', 'oven', 'pass'))
);

CREATE UNIQUE INDEX IF NOT EXISTS production_departments_code_unique
  ON production_departments(code);

WITH config AS (
  SELECT COALESCE(
    (SELECT print_mode FROM business_config ORDER BY updated_at DESC LIMIT 1),
    'kds_only'
  ) AS print_mode
)
INSERT INTO production_departments
  (code, name, kind, workflow, kds_enabled, printer_enabled, sort_order)
SELECT seed.code, seed.name, seed.kind, seed.workflow,
       CASE WHEN seed.kind = 'none' THEN false ELSE config.print_mode <> 'printers_only' END,
       CASE WHEN seed.kind = 'pass' THEN false ELSE config.print_mode <> 'kds_only' END,
       seed.sort_order
FROM config
CROSS JOIN (VALUES
  ('cocina', 'Cocina', 'production', 'standard', 10),
  ('pizza', 'Pizza', 'production', 'oven', 20),
  ('ensalada', 'Ensalada', 'production', 'standard', 30),
  ('barra', 'Barra', 'production', 'standard', 40),
  ('pase', 'Pase', 'pass', 'pass', 90),
  ('sin_partida', 'Sin partida', 'none', 'standard', 100)
) AS seed(code, name, kind, workflow, sort_order)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE printers
  ADD COLUMN IF NOT EXISTS department_code text,
  ADD COLUMN IF NOT EXISTS connection_type text NOT NULL DEFAULT 'simulation',
  ADD COLUMN IF NOT EXISTS agent_url text,
  ADD COLUMN IF NOT EXISTS character_set text NOT NULL DEFAULT 'cp858',
  ADD COLUMN IF NOT EXISTS auto_cut boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS open_cash_drawer boolean NOT NULL DEFAULT false;

UPDATE printers
SET department_code = type
WHERE department_code IS NULL
  AND type IN (SELECT code FROM production_departments);

ALTER TABLE printers
  DROP CONSTRAINT IF EXISTS printers_connection_type_check;
ALTER TABLE printers
  ADD CONSTRAINT printers_connection_type_check
    CHECK (connection_type IN ('simulation', 'tcp', 'windows_agent'));
ALTER TABLE printers
  DROP CONSTRAINT IF EXISTS printers_paper_width_check;
ALTER TABLE printers
  ADD CONSTRAINT printers_paper_width_check CHECK (paper_width IN (58, 80));
ALTER TABLE printers
  DROP CONSTRAINT IF EXISTS printers_port_check;
ALTER TABLE printers
  ADD CONSTRAINT printers_port_check CHECK (port BETWEEN 1 AND 65535);

ALTER TABLE print_queue
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS transport_acked_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_level text NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE print_queue SET status = 'delivered' WHERE status IN ('printed', 'reprinted');
UPDATE print_queue SET status = 'failed' WHERE status = 'error';

CREATE UNIQUE INDEX IF NOT EXISTS print_queue_dedupe_key_unique
  ON print_queue(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS print_queue_worker_idx
  ON print_queue(status, available_at, created_at);

ALTER TABLE kitchen_tasks
  DROP CONSTRAINT IF EXISTS kitchen_tasks_order_item_id_order_items_id_fk;
ALTER TABLE kitchen_tasks ALTER COLUMN order_item_id DROP NOT NULL;
ALTER TABLE kitchen_tasks
  ADD CONSTRAINT kitchen_tasks_order_item_id_order_items_id_fk
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE SET NULL;
ALTER TABLE kitchen_tasks
  ADD COLUMN IF NOT EXISTS resend_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_resent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_resent_by text;
