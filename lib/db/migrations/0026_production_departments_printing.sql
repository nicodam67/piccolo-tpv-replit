-- Entrega 66: canonical production departments and production print queue controls.
-- A new table is required because business_config.print_mode is global and cannot
-- represent independently configurable, runtime-created departments.

CREATE TABLE IF NOT EXISTS production_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  output_mode TEXT NOT NULL DEFAULT 'none',
  workflow_profile TEXT NOT NULL DEFAULT 'standard',
  printer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  show_in_kds_nav BOOLEAN NOT NULL DEFAULT TRUE,
  assignable_to_products BOOLEAN NOT NULL DEFAULT TRUE,
  is_pase_aggregator BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT production_departments_output_mode_chk
    CHECK (output_mode IN ('none', 'kds', 'printer', 'both')),
  CONSTRAINT production_departments_workflow_profile_chk
    CHECK (workflow_profile IN ('standard', 'pizza', 'bar', 'pase', 'none')),
  CONSTRAINT production_departments_code_format_chk
    CHECK (code ~ '^[a-z][a-z0-9_]*$')
);

CREATE INDEX IF NOT EXISTS production_departments_active_sort_idx
  ON production_departments (active, sort_order);

INSERT INTO production_departments
  (code, name, sort_order, output_mode, workflow_profile,
   show_in_kds_nav, assignable_to_products, is_pase_aggregator)
VALUES
  ('cocina', 'Cocina', 10, 'both', 'standard', TRUE, TRUE, FALSE),
  ('pizza', 'Pizza', 20, 'both', 'pizza', TRUE, TRUE, FALSE),
  ('ensalada', 'Ensaladas', 30, 'both', 'standard', TRUE, TRUE, FALSE),
  ('barra', 'Barra', 40, 'both', 'bar', TRUE, TRUE, FALSE),
  ('pase', 'Pase', 50, 'both', 'pase', TRUE, FALSE, TRUE),
  ('sin_partida', 'Sin partida', 999, 'both', 'standard', FALSE, TRUE, FALSE)
ON CONFLICT (code) DO NOTHING;

-- Preserve valid legacy custom prep zones as dynamic departments. Values that
-- cannot be safe URL slugs are moved to the explicit compatibility department.
UPDATE products
SET prep_zone = 'sin_partida'
WHERE prep_zone !~ '^[a-z][a-z0-9_]*$';

INSERT INTO production_departments
  (code, name, sort_order, output_mode, workflow_profile,
   show_in_kds_nav, assignable_to_products, is_pase_aggregator)
SELECT DISTINCT
  product.prep_zone,
  initcap(replace(product.prep_zone, '_', ' ')),
  100,
  'both',
  'standard',
  TRUE,
  TRUE,
  FALSE
FROM products AS product
WHERE product.prep_zone NOT IN (SELECT code FROM production_departments)
ON CONFLICT (code) DO NOTHING;

UPDATE production_departments AS department
SET printer_ids = COALESCE((
  SELECT jsonb_agg(printer.id ORDER BY printer.is_primary DESC, printer.name)
  FROM printers AS printer
  WHERE printer.active = TRUE
    AND printer.is_primary = TRUE
    AND printer.type = CASE WHEN department.code = 'pase' THEN 'cocina' ELSE department.code END
), '[]'::jsonb)
WHERE jsonb_array_length(department.printer_ids) = 0;

-- Before this migration, unknown/custom prep zones fell back to the primary
-- cocina printer. Preserve that behavior until the owner explicitly configures
-- the new department.
UPDATE production_departments AS department
SET printer_ids = COALESCE((
  SELECT jsonb_agg(printer.id ORDER BY printer.name)
  FROM printers AS printer
  WHERE printer.active = TRUE
    AND printer.is_primary = TRUE
    AND printer.type = 'cocina'
), '[]'::jsonb)
WHERE department.code NOT IN ('cocina', 'pizza', 'ensalada', 'barra', 'pase', 'sin_partida')
  AND jsonb_array_length(department.printer_ids) = 0;

ALTER TABLE kds_stations
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES production_departments(id);

UPDATE kds_stations AS station
SET department_id = department.id
FROM production_departments AS department
WHERE station.zone_type = department.code
  AND station.department_id IS NULL;

CREATE INDEX IF NOT EXISTS kds_stations_department_id_idx
  ON kds_stations (department_id);

ALTER TABLE kitchen_tasks
  ADD COLUMN IF NOT EXISTS resent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resent_by UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS resent_reason TEXT,
  ADD COLUMN IF NOT EXISTS resend_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE printers
  ADD COLUMN IF NOT EXISTS connector_mode TEXT NOT NULL DEFAULT 'simulator',
  ADD COLUMN IF NOT EXISTS code_page TEXT NOT NULL DEFAULT 'cp858',
  ADD COLUMN IF NOT EXISTS cut_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS drawer_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS connect_timeout_ms INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS write_timeout_ms INTEGER NOT NULL DEFAULT 10000,
  ADD CONSTRAINT printers_connector_mode_chk
    CHECK (connector_mode IN ('simulator', 'tcp')),
  ADD CONSTRAINT printers_code_page_chk
    CHECK (code_page IN ('cp858', 'cp437', 'windows1252')),
  ADD CONSTRAINT printers_connect_timeout_chk
    CHECK (connect_timeout_ms BETWEEN 250 AND 60000),
  ADD CONSTRAINT printers_write_timeout_chk
    CHECK (write_timeout_ms BETWEEN 250 AND 120000);

ALTER TABLE print_queue
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS print_queue_worker_idx
  ON print_queue (status, next_attempt_at, priority DESC, created_at)
  WHERE status IN ('pending', 'retrying', 'sending');

CREATE UNIQUE INDEX IF NOT EXISTS print_queue_dedupe_active_idx
  ON print_queue (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('pending', 'retrying', 'sending', 'printed');
