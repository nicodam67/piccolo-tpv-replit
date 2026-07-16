-- ═══════════════════════════════════════════════════════════════════════════════
-- 0009_hr_module.sql
-- RRHH: Puestos, departamentos, importación universal, solicitudes, periodos
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Puestos (posiciones de trabajo) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_positions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  code        text        NOT NULL DEFAULT '',
  department_id uuid,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Departamentos ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_departments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  code        text        NOT NULL DEFAULT '',
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Add FK from hr_positions to hr_departments (safe if already exists via IF NOT EXISTS pattern)
ALTER TABLE hr_positions
  ADD COLUMN IF NOT EXISTS department_id_fk uuid REFERENCES hr_departments(id) ON DELETE SET NULL;

-- ─── 3. Centros de trabajo ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_work_centers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  address     text        NOT NULL DEFAULT '',
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── 4. Extender tabla employees ─────────────────────────────────────────────
ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_name          text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_number    text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS email              text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address            text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hire_date          date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS termination_date   date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emp_status         text NOT NULL DEFAULT 'active';  -- 'active'|'inactive'|'suspended'
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position_id        uuid REFERENCES hr_positions(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id      uuid REFERENCES hr_departments(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_center_id     uuid REFERENCES hr_work_centers(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS monthly_salary     numeric(10,2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employer_cost_rate numeric(5,4) NOT NULL DEFAULT 1.35;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS external_code      text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url          text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact  jsonb;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emp_notes          text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_demo            boolean NOT NULL DEFAULT false;

-- Unique index on employee_number (nullable, so use partial index)
CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_number_idx
  ON employees(employee_number) WHERE employee_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employees_email_idx
  ON employees(email) WHERE email IS NOT NULL;

-- ─── 5. Multi-puesto por empleado ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_employee_positions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  position_id uuid        NOT NULL REFERENCES hr_positions(id) ON DELETE CASCADE,
  is_primary  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, position_id)
);

-- ─── 6. Identificadores externos por dispositivo ─────────────────────────────
CREATE TABLE IF NOT EXISTS hr_employee_external_ids (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid    NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  source        text    NOT NULL,   -- 'anviz' | 'zkteco' | 'hik' | 'custom' | etc.
  external_id   text    NOT NULL,   -- ID en el dispositivo
  device_id     text,               -- nombre/serie del dispositivo
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

-- ─── 7. Plantillas de importación (mapeo reutilizable) ───────────────────────
CREATE TABLE IF NOT EXISTS hr_import_templates (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text    NOT NULL,
  manufacturer  text    NOT NULL DEFAULT '',  -- nombre del fabricante/sistema
  file_format   text    NOT NULL DEFAULT 'csv',  -- 'csv'|'xlsx'|'xls'|'json'|'txt'
  config        jsonb   NOT NULL DEFAULT '{}',   -- mapping config
  active        boolean NOT NULL DEFAULT true,
  created_by    uuid    REFERENCES employees(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── 8. Historial de importaciones ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_import_history (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  filename        text    NOT NULL,
  file_hash       text    NOT NULL,         -- SHA-256 del archivo para detectar reimportaciones
  file_format     text    NOT NULL DEFAULT 'csv',
  template_id     uuid    REFERENCES hr_import_templates(id) ON DELETE SET NULL,
  status          text    NOT NULL DEFAULT 'pending',  -- 'pending'|'preview'|'confirmed'|'reverted'|'error'
  rows_total      integer NOT NULL DEFAULT 0,
  rows_imported   integer NOT NULL DEFAULT 0,
  rows_skipped    integer NOT NULL DEFAULT 0,
  rows_errors     integer NOT NULL DEFAULT 0,
  rows_pending    integer NOT NULL DEFAULT 0,  -- pendientes de asociar a empleado
  column_mapping  jsonb,                        -- mapeo columna→campo final
  errors          jsonb,                        -- array de {row, message}
  parsed_rows     jsonb,                        -- filas parseadas en servidor (XLSX/CSV) para confirm sin reenvío de cliente
  imported_by     uuid    NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  confirmed_at    timestamptz,
  reverted_at     timestamptz,
  revert_reason   text,
  reverted_by     uuid    REFERENCES employees(id) ON DELETE SET NULL,
  is_demo         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Unique on file_hash to prevent exact same file twice (only among confirmed imports)
CREATE UNIQUE INDEX IF NOT EXISTS hr_import_history_hash_idx
  ON hr_import_history(file_hash) WHERE status = 'confirmed';

-- ─── 9. Filas de importación (trazabilidad fila a fila) ──────────────────────
CREATE TABLE IF NOT EXISTS hr_import_rows (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id         uuid    NOT NULL REFERENCES hr_import_history(id) ON DELETE CASCADE,
  row_number        integer NOT NULL,
  employee_id       uuid    REFERENCES employees(id) ON DELETE SET NULL,  -- null si no se pudo asociar
  external_identifier text,           -- ID externo del dispositivo en la fila
  raw_data          jsonb   NOT NULL DEFAULT '{}',
  matched_by        text,             -- 'anviz_id'|'nfc_id'|'external_code'|'manual'|null
  status            text    NOT NULL DEFAULT 'pending',  -- 'imported'|'skipped'|'error'|'pending'|'reverted'
  error_message     text,
  time_record_id    uuid    REFERENCES time_records(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ─── 10. Trazabilidad en time_records ────────────────────────────────────────
ALTER TABLE time_records ADD COLUMN IF NOT EXISTS import_history_id uuid REFERENCES hr_import_history(id) ON DELETE SET NULL;
ALTER TABLE time_records ADD COLUMN IF NOT EXISTS import_row_id     uuid REFERENCES hr_import_rows(id) ON DELETE SET NULL;
ALTER TABLE time_records ADD COLUMN IF NOT EXISTS external_record_id text;
ALTER TABLE time_records ADD COLUMN IF NOT EXISTS device_id         text;

-- ─── 11. Periodos de cierre mensual ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_pay_periods (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  year              integer NOT NULL,
  month             integer NOT NULL,   -- 1-12
  status            text    NOT NULL DEFAULT 'open',  -- 'open'|'closed'|'locked'
  planned_hours     numeric(8,2),       -- horas planificadas en turnos
  actual_hours      numeric(8,2),       -- horas reales según time_records
  estimated_cost    numeric(10,2),      -- coste estimado de personal
  total_sales       numeric(12,2),      -- ventas del periodo (para referencia)
  notes             text,
  closed_by         uuid    REFERENCES employees(id) ON DELETE SET NULL,
  closed_at         timestamptz,
  reopened_by       uuid    REFERENCES employees(id) ON DELETE SET NULL,
  reopened_at       timestamptz,
  is_demo           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

-- ─── 12. Solicitudes de empleados ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_employee_requests (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid    NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  request_type    text    NOT NULL,  -- 'vacation'|'shift_swap'|'absence'|'correction'
  date_from       date    NOT NULL,
  date_to         date    NOT NULL,
  status          text    NOT NULL DEFAULT 'pending',  -- 'pending'|'approved'|'rejected'
  notes           text,
  reviewed_by     uuid    REFERENCES employees(id) ON DELETE SET NULL,
  review_notes    text,
  reviewed_at     timestamptz,
  is_demo         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── 13. Notificaciones HR ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_notifications (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid    NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type        text    NOT NULL,    -- 'request_approved'|'request_rejected'|'shift_change'|'reminder'
  title       text    NOT NULL,
  body        text    NOT NULL DEFAULT '',
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── 14. Índices de rendimiento ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS hr_import_rows_import_id_idx ON hr_import_rows(import_id);
CREATE INDEX IF NOT EXISTS hr_import_rows_employee_id_idx ON hr_import_rows(employee_id);
CREATE INDEX IF NOT EXISTS hr_employee_requests_employee_id_idx ON hr_employee_requests(employee_id);
CREATE INDEX IF NOT EXISTS hr_employee_requests_status_idx ON hr_employee_requests(status);
CREATE INDEX IF NOT EXISTS hr_notifications_employee_id_idx ON hr_notifications(employee_id);
CREATE INDEX IF NOT EXISTS time_records_import_history_id_idx ON time_records(import_history_id);
