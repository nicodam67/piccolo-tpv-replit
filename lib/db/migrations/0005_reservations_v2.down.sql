-- Down migration: 0005_reservations_v2
-- CAUTION: data in these tables and columns will be permanently lost.

DROP INDEX IF EXISTS idx_res_deposits_res_id;
DROP INDEX IF EXISTS idx_waiting_list_llegada;
DROP INDEX IF EXISTS idx_waiting_list_status;
DROP INDEX IF EXISTS idx_res_history_res_id;
DROP INDEX IF EXISTS idx_reservations_client_id;
DROP INDEX IF EXISTS idx_reservations_status;
DROP INDEX IF EXISTS idx_reservations_fecha;

ALTER TABLE crm_clients
  DROP COLUMN IF EXISTS idioma,
  DROP COLUMN IF EXISTS mesa_favorita_id,
  DROP COLUMN IF EXISTS zona_favorita,
  DROP COLUMN IF EXISTS rgpd_marketing,
  DROP COLUMN IF EXISTS notas_internas,
  DROP COLUMN IF EXISTS flag_no_presentado,
  DROP COLUMN IF EXISTS bloqueo_online,
  DROP COLUMN IF EXISTS cancelaciones,
  DROP COLUMN IF EXISTS no_presentados;

ALTER TABLE reservations
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS client_id,
  DROP COLUMN IF EXISTS shift_id,
  DROP COLUMN IF EXISTS duracion_minutos,
  DROP COLUMN IF EXISTS idioma,
  DROP COLUMN IF EXISTS alergias,
  DROP COLUMN IF EXISTS trona,
  DROP COLUMN IF EXISTS accesibilidad,
  DROP COLUMN IF EXISTS mascota,
  DROP COLUMN IF EXISTS ocasion,
  DROP COLUMN IF EXISTS canal,
  DROP COLUMN IF EXISTS recordatorio_enviado,
  DROP COLUMN IF EXISTS confirmacion_requerida,
  DROP COLUMN IF EXISTS notas_internas;

DROP TABLE IF EXISTS reservation_deposits CASCADE;
DROP TABLE IF EXISTS waiting_list CASCADE;
DROP TABLE IF EXISTS reservation_status_history CASCADE;
DROP TABLE IF EXISTS service_shifts CASCADE;
