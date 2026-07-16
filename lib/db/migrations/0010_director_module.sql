-- ─── Migration 0010: Director/Management Module ─────────────────────────────
-- Adds 5 tables for the management dashboard (goals, alerts, overhead costs,
-- daily snapshots for performance, custom report templates).
-- Does NOT duplicate any existing sales/employee/stock/reservation data.

-- ─── 1. Objetivos configurables ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS director_goals (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type            text        NOT NULL,  -- 'sales_daily','sales_weekly','sales_monthly','avg_ticket','avg_per_guest','gross_margin_pct','cogs_pct','labor_pct','kitchen_time_avg','occupancy_pct','table_rotation','waste_reduction'
  label           text,                  -- nombre legible opcional
  target_value    numeric(14,4) NOT NULL,
  period          text        NOT NULL DEFAULT 'monthly', -- 'daily','weekly','monthly','yearly','custom'
  period_start    date,
  period_end      date,
  zone_id         uuid        REFERENCES room_zones(id) ON DELETE SET NULL,
  channel         text,                  -- 'dine_in','delivery','takeaway','online' o NULL=todos
  notes           text,
  active          boolean     NOT NULL DEFAULT true,
  created_by      uuid        NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Centro de alertas ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS director_alerts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  priority        text        NOT NULL DEFAULT 'medium', -- 'info','low','medium','high','critical'
  source          text        NOT NULL,   -- 'cash_diff','low_sales','high_cogs','low_stock','incomplete_fichaje','fiscal_error','backup_fail','printer_down','kds_down'
  title           text        NOT NULL,
  detail          text,
  status          text        NOT NULL DEFAULT 'open', -- 'open','reviewed','resolved','snoozed'
  assigned_to     uuid        REFERENCES employees(id) ON DELETE SET NULL,
  assigned_at     timestamptz,
  resolved_by     uuid        REFERENCES employees(id) ON DELETE SET NULL,
  resolved_at     timestamptz,
  action_taken    text,
  snooze_until    timestamptz,
  comments        jsonb,                  -- [{employeeId, text, at}]
  origin_module   text,                   -- 'caja','stock','hr','kds','fiscal'
  origin_ref      text,                   -- ID del objeto relacionado
  is_demo         boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS director_alerts_status_idx   ON director_alerts(status);
CREATE INDEX IF NOT EXISTS director_alerts_priority_idx ON director_alerts(priority);
CREATE INDEX IF NOT EXISTS director_alerts_created_idx  ON director_alerts(created_at DESC);

-- ─── 3. Costes overhead configurables ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS director_costs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category        text        NOT NULL,  -- 'rent','electricity','gas','water','insurance','accounting','maintenance','software','phone','cleaning','advertising','commissions','repairs','other'
  name            text        NOT NULL,
  amount          numeric(14,2) NOT NULL,
  currency        text        NOT NULL DEFAULT 'EUR',
  periodicity     text        NOT NULL DEFAULT 'monthly', -- 'once','daily','weekly','monthly','quarterly','yearly'
  effective_date  date        NOT NULL,
  end_date        date,
  provider        text,
  cost_center     text,
  document_ref    text,                  -- referencia al doc adjunto si existe
  notes           text,
  paid_status     text        NOT NULL DEFAULT 'pending', -- 'paid','pending','cancelled'
  payment_date    date,
  is_demo         boolean     NOT NULL DEFAULT false,
  created_by      uuid        NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS director_costs_effective_idx ON director_costs(effective_date);

-- ─── 4. Snapshots diarios pre-agregados (rendimiento histórico) ───────────────
CREATE TABLE IF NOT EXISTS director_daily_snapshots (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date       date        NOT NULL UNIQUE,
  -- Ventas
  sales_gross         numeric(14,2) NOT NULL DEFAULT 0,
  sales_net           numeric(14,2) NOT NULL DEFAULT 0,
  tax_total           numeric(14,2) NOT NULL DEFAULT 0,
  discount_total      numeric(14,2) NOT NULL DEFAULT 0,
  invitation_total    numeric(14,2) NOT NULL DEFAULT 0,
  ticket_count        integer      NOT NULL DEFAULT 0,
  guest_count         integer      NOT NULL DEFAULT 0,
  avg_ticket          numeric(10,2) NOT NULL DEFAULT 0,
  avg_per_guest       numeric(10,2) NOT NULL DEFAULT 0,
  -- Por canal
  sales_dine_in       numeric(14,2) NOT NULL DEFAULT 0,
  sales_delivery      numeric(14,2) NOT NULL DEFAULT 0,
  sales_takeaway      numeric(14,2) NOT NULL DEFAULT 0,
  sales_online        numeric(14,2) NOT NULL DEFAULT 0,
  orders_delivery     integer      NOT NULL DEFAULT 0,
  orders_takeaway     integer      NOT NULL DEFAULT 0,
  -- Costes estimados
  labor_cost_est      numeric(14,2) NOT NULL DEFAULT 0,
  cogs_est            numeric(14,2) NOT NULL DEFAULT 0,
  -- Reservas
  reservations_total  integer      NOT NULL DEFAULT 0,
  reservations_kept   integer      NOT NULL DEFAULT 0,
  -- KDS
  avg_prep_minutes    numeric(6,2),
  -- Metadatos
  generated_at        timestamptz  NOT NULL DEFAULT now(),
  is_partial          boolean      NOT NULL DEFAULT false  -- true si el día aún no cerró
);
CREATE INDEX IF NOT EXISTS director_snapshots_date_idx ON director_daily_snapshots(snapshot_date DESC);

-- ─── 5. Plantillas de informes personalizados ─────────────────────────────────
CREATE TABLE IF NOT EXISTS director_custom_reports (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  description     text,
  config          jsonb       NOT NULL,  -- {period, metrics[], filters{}, groupBy, orderBy, comparison}
  is_shared       boolean     NOT NULL DEFAULT false,
  created_by      uuid        NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
