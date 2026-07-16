-- 0005_reservations_v2.sql
-- Extends the reservations system with full professional functionality:
-- new columns on reservations, 4 new tables, extended crm_clients, indexes.
-- All statements use IF NOT EXISTS / IF EXISTS so re-running is safe.

-- ── 1. service_shifts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_shifts (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre             TEXT        NOT NULL,
  tipo               TEXT        NOT NULL DEFAULT 'comida',  -- comida | cena | especial
  hora_inicio        TEXT        NOT NULL,                   -- HH:MM 24h
  hora_fin           TEXT        NOT NULL,                   -- HH:MM 24h
  intervalo_minutos  INTEGER     NOT NULL DEFAULT 15,
  capacidad_max      INTEGER     NOT NULL DEFAULT 50,
  max_reservas       INTEGER     NOT NULL DEFAULT 20,
  max_comensales     INTEGER     NOT NULL DEFAULT 50,
  duracion_default   INTEGER     NOT NULL DEFAULT 90,        -- minutes
  dias_activos       JSONB       NOT NULL DEFAULT '[0,1,2,3,4,5,6]', -- JS day numbers
  activo             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. reservation_status_history ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservation_status_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  UUID        NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  status_from     TEXT        NOT NULL,
  status_to       TEXT        NOT NULL,
  changed_by      UUID        REFERENCES employees(id) ON DELETE SET NULL,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT        NOT NULL DEFAULT ''
);

-- ── 3. waiting_list ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS waiting_list (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           TEXT        NOT NULL,
  telefono         TEXT        NOT NULL DEFAULT '',
  personas         INTEGER     NOT NULL DEFAULT 2,
  hora_llegada     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  zona_preferida   TEXT,
  tiempo_estimado  INTEGER,   -- minutes estimate
  status           TEXT        NOT NULL DEFAULT 'esperando',
  observaciones    TEXT        NOT NULL DEFAULT '',
  created_by       UUID        REFERENCES employees(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. reservation_deposits ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservation_deposits (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id      UUID        NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  importe_solicitado  NUMERIC(10,2) NOT NULL DEFAULT 0,
  importe_pagado      NUMERIC(10,2) NOT NULL DEFAULT 0,
  forma_pago          TEXT,
  status              TEXT        NOT NULL DEFAULT 'pendiente',
  devolucion_motivo   TEXT,
  devolucion_fecha    TIMESTAMPTZ,
  created_by          UUID        REFERENCES employees(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. Extend reservations ────────────────────────────────────────────────────
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS email               TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS client_id           UUID        REFERENCES crm_clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shift_id            UUID        REFERENCES service_shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duracion_minutos    INTEGER     NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS idioma              TEXT        NOT NULL DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS alergias            TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS trona               BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS accesibilidad       BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mascota             BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ocasion             TEXT,
  ADD COLUMN IF NOT EXISTS canal               TEXT        NOT NULL DEFAULT 'phone',
  ADD COLUMN IF NOT EXISTS recordatorio_enviado     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS confirmacion_requerida   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notas_internas      TEXT        NOT NULL DEFAULT '';

-- ── 6. Extend crm_clients ─────────────────────────────────────────────────────
ALTER TABLE crm_clients
  ADD COLUMN IF NOT EXISTS idioma              TEXT        NOT NULL DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS mesa_favorita_id    UUID        REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS zona_favorita       TEXT,
  ADD COLUMN IF NOT EXISTS rgpd_marketing      BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notas_internas      TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS flag_no_presentado  BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bloqueo_online      BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancelaciones       INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS no_presentados      INTEGER     NOT NULL DEFAULT 0;

-- ── 7. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reservations_fecha      ON reservations(fecha);
CREATE INDEX IF NOT EXISTS idx_reservations_status     ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_client_id  ON reservations(client_id);
CREATE INDEX IF NOT EXISTS idx_res_history_res_id      ON reservation_status_history(reservation_id);
CREATE INDEX IF NOT EXISTS idx_waiting_list_status     ON waiting_list(status);
CREATE INDEX IF NOT EXISTS idx_waiting_list_llegada    ON waiting_list(hora_llegada);
CREATE INDEX IF NOT EXISTS idx_res_deposits_res_id     ON reservation_deposits(reservation_id);
