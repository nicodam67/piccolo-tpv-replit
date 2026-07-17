-- Migration 0017: KDS stations, print test results, prepZone remap
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Remap legacy prepZone values so every product routes to a valid KDS zone
--    frío/frio → ensalada | postres → barra | sala → sin_partida
UPDATE products
SET prep_zone = CASE
  WHEN prep_zone = 'frío'    THEN 'ensalada'
  WHEN prep_zone = 'frio'    THEN 'ensalada'
  WHEN prep_zone = 'postres' THEN 'barra'
  WHEN prep_zone = 'sala'    THEN 'sin_partida'
  ELSE prep_zone
END
WHERE prep_zone IN ('frío', 'frio', 'postres', 'sala');

-- 2. KDS stations — admin-managed display terminals
CREATE TABLE IF NOT EXISTS kds_stations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  zone_type     TEXT        NOT NULL DEFAULT 'cocina',   -- cocina|pizza|ensalada|barra|pase|sin_partida
  ip            TEXT        NOT NULL DEFAULT '',
  display_url   TEXT,
  notes         TEXT,
  last_ping_at  TIMESTAMPTZ,
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default stations (only if table is empty)
INSERT INTO kds_stations (name, zone_type, notes)
SELECT * FROM (VALUES
  ('KDS Cocina',     'cocina',   'Pantalla principal de cocina caliente'),
  ('KDS Pizza',      'pizza',    'Estación de horno y pizzas'),
  ('KDS Ensaladas',  'ensalada', 'Cuarto frío y ensaladas'),
  ('KDS Barra',      'barra',    'Barra y bebidas'),
  ('KDS Expedición', 'pase',     'Pantalla de pase / expedición')
) AS v(name, zone_type, notes)
WHERE NOT EXISTS (SELECT 1 FROM kds_stations LIMIT 1);

-- 3. Print test results — records from guided print test wizard
CREATE TABLE IF NOT EXISTS print_test_results (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  printer_id  UUID        NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  step_key    TEXT        NOT NULL,   -- zone_cocina | zone_pizza | special_chars | paper_cut | cash_drawer | fallback
  step_label  TEXT        NOT NULL,
  result      TEXT        NOT NULL DEFAULT 'pending',  -- pending | pass | fail
  notes       TEXT,
  tested_by   TEXT,
  session_id  TEXT,       -- groups all steps from one wizard run
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_print_test_results_session
  ON print_test_results (session_id, created_at DESC);
