-- SIF / VERI*FACTU Phase 1 transactional invariants.
-- This migration never deletes or rewrites historical fiscal content. It aborts
-- with a precise error if an incompatible duplicate must be reconciled first.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tickets GROUP BY serie, ticket_number HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SIF migration blocked: duplicate tickets (serie, ticket_number); reconcile without deleting history';
  END IF;
  IF EXISTS (
    SELECT 1 FROM invoices GROUP BY serie, invoice_number HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SIF migration blocked: duplicate invoices (serie, invoice_number); reconcile without deleting history';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM verifactu_records
     WHERE registro_tipo = 'alta' AND invoice_id IS NOT NULL
     GROUP BY invoice_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SIF migration blocked: more than one alta record for an invoice';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM verifactu_records
     WHERE registro_tipo = 'alta'
     GROUP BY emisor_nif, num_serie_factura, fecha_expedicion
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SIF migration blocked: duplicate fiscal identities; preserve and reconcile them before retrying';
  END IF;
END
$$;

ALTER TABLE verifactu_records
  ADD COLUMN IF NOT EXISTS ticket_id uuid,
  ADD COLUMN IF NOT EXISTS chain_key text,
  ADD COLUMN IF NOT EXISTS chain_sequence bigint;

UPDATE verifactu_records
   SET chain_key = concat(
     btrim(emisor_nif), '|',
     coalesce(nullif(id_sistema_informatico, ''), 'PICCOLO-TPV'), '|',
     coalesce(nullif(numero_instalacion, ''), 'DEFAULT')
   )
 WHERE chain_key IS NULL;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY chain_key
           ORDER BY created_at, id
         ) AS sequence
    FROM verifactu_records
)
UPDATE verifactu_records AS records
   SET chain_sequence = ranked.sequence
  FROM ranked
 WHERE records.id = ranked.id
   AND records.chain_sequence IS NULL;

ALTER TABLE verifactu_records
  ALTER COLUMN chain_key SET DEFAULT 'legacy',
  ALTER COLUMN chain_key SET NOT NULL,
  ALTER COLUMN chain_sequence SET DEFAULT 0,
  ALTER COLUMN chain_sequence SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'verifactu_records_ticket_id_tickets_id_fk'
  ) THEN
    ALTER TABLE verifactu_records
      ADD CONSTRAINT verifactu_records_ticket_id_tickets_id_fk
      FOREIGN KEY (ticket_id) REFERENCES tickets(id);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS tickets_fiscal_number_unique
  ON tickets (serie, ticket_number);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_fiscal_number_unique
  ON invoices (serie, invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_full_per_order
  ON invoices (order_id)
  WHERE order_id IS NOT NULL AND serie = 'F';
CREATE UNIQUE INDEX IF NOT EXISTS verifactu_records_invoice_alta_unique
  ON verifactu_records (invoice_id)
  WHERE invoice_id IS NOT NULL AND registro_tipo = 'alta';
CREATE UNIQUE INDEX IF NOT EXISTS verifactu_records_ticket_alta_unique
  ON verifactu_records (ticket_id)
  WHERE ticket_id IS NOT NULL AND registro_tipo = 'alta';
CREATE UNIQUE INDEX IF NOT EXISTS verifactu_records_fiscal_identity_unique
  ON verifactu_records (emisor_nif, num_serie_factura, fecha_expedicion)
  WHERE registro_tipo = 'alta';
CREATE UNIQUE INDEX IF NOT EXISTS verifactu_records_chain_sequence_unique
  ON verifactu_records (chain_key, chain_sequence);
CREATE UNIQUE INDEX IF NOT EXISTS verifactu_records_huella_unique
  ON verifactu_records (huella);

CREATE TABLE IF NOT EXISTS fiscal_chain_state (
  chain_key        text PRIMARY KEY,
  current_sequence bigint NOT NULL DEFAULT 0,
  last_record_id   uuid REFERENCES verifactu_records(id),
  last_hash        text NOT NULL DEFAULT '',
  updated_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO fiscal_chain_state (
  chain_key, current_sequence, last_record_id, last_hash, updated_at
)
SELECT DISTINCT ON (chain_key)
       chain_key, chain_sequence, id, huella, created_at
  FROM verifactu_records
 ORDER BY chain_key, chain_sequence DESC
ON CONFLICT (chain_key) DO NOTHING;

CREATE OR REPLACE FUNCTION sif_prevent_fiscal_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los registros fiscales son inmutables; use anulación o rectificación';
  END IF;

  IF (
    to_jsonb(NEW) - ARRAY[
      'estado', 'aeat_fecha_envio', 'aeat_codigo', 'aeat_descripcion',
      'aeat_csv', 'aeat_response', 'reintentos', 'proximo_reintento',
      'xml_enviado', 'xml_respuesta', 'entorno_envio', 'updated_at'
    ]::text[]
  ) IS DISTINCT FROM (
    to_jsonb(OLD) - ARRAY[
      'estado', 'aeat_fecha_envio', 'aeat_codigo', 'aeat_descripcion',
      'aeat_csv', 'aeat_response', 'reintentos', 'proximo_reintento',
      'xml_enviado', 'xml_respuesta', 'entorno_envio', 'updated_at'
    ]::text[]
  ) THEN
    RAISE EXCEPTION 'No se puede modificar el contenido de un registro fiscal emitido';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS verifactu_records_immutable ON verifactu_records;
CREATE TRIGGER verifactu_records_immutable
BEFORE UPDATE OR DELETE ON verifactu_records
FOR EACH ROW EXECUTE FUNCTION sif_prevent_fiscal_record_mutation();

CREATE OR REPLACE FUNCTION sif_prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'La auditoría fiscal es append-only';
END
$$;

DROP TRIGGER IF EXISTS verifactu_audit_log_append_only ON verifactu_audit_log;
CREATE TRIGGER verifactu_audit_log_append_only
BEFORE UPDATE OR DELETE ON verifactu_audit_log
FOR EACH ROW EXECUTE FUNCTION sif_prevent_audit_mutation();

CREATE OR REPLACE FUNCTION sif_protect_issued_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_has_record boolean;
BEGIN
  IF TG_TABLE_NAME = 'tickets' THEN
    SELECT EXISTS (
      SELECT 1 FROM verifactu_records
       WHERE ticket_id = OLD.id AND registro_tipo = 'alta'
    ) INTO source_has_record;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM verifactu_records
       WHERE invoice_id = OLD.id AND registro_tipo = 'alta'
    ) INTO source_has_record;
  END IF;

  IF NOT source_has_record THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'No se puede eliminar una factura fiscal emitida';
  END IF;

  IF TG_TABLE_NAME = 'tickets' THEN
    IF (
      to_jsonb(NEW) - ARRAY['verifactu_status', 'verifactu_response']::text[]
    ) IS DISTINCT FROM (
      to_jsonb(OLD) - ARRAY['verifactu_status', 'verifactu_response']::text[]
    ) THEN
      RAISE EXCEPTION 'No se puede reescribir un ticket fiscal emitido';
    END IF;
  ELSE
    IF (
      to_jsonb(NEW) - ARRAY['status', 'verifactu_status', 'verifactu_response']::text[]
    ) IS DISTINCT FROM (
      to_jsonb(OLD) - ARRAY['status', 'verifactu_status', 'verifactu_response']::text[]
    ) THEN
      RAISE EXCEPTION 'No se puede reescribir una factura fiscal emitida';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tickets_protect_issued_source ON tickets;
CREATE TRIGGER tickets_protect_issued_source
BEFORE UPDATE OR DELETE ON tickets
FOR EACH ROW EXECUTE FUNCTION sif_protect_issued_source();

DROP TRIGGER IF EXISTS invoices_protect_issued_source ON invoices;
CREATE TRIGGER invoices_protect_issued_source
BEFORE UPDATE OR DELETE ON invoices
FOR EACH ROW EXECUTE FUNCTION sif_protect_issued_source();

CREATE OR REPLACE FUNCTION sif_require_fiscal_record()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'tickets' THEN
    IF NOT EXISTS (
      SELECT 1 FROM verifactu_records
       WHERE ticket_id = NEW.id AND registro_tipo = 'alta'
    ) THEN
      RAISE EXCEPTION 'Emisión atómica incumplida: ticket sin registro fiscal';
    END IF;
  ELSE
    IF TG_OP = 'UPDATE' AND NOT (OLD.status = 'draft' AND NEW.status <> 'draft') THEN
      RETURN NEW;
    END IF;
    IF NEW.status <> 'draft'
       AND NOT NEW.serie LIKE 'P%'
       AND NOT EXISTS (
         SELECT 1 FROM verifactu_records
          WHERE invoice_id = NEW.id AND registro_tipo = 'alta'
       ) THEN
      RAISE EXCEPTION 'Emisión atómica incumplida: factura sin registro fiscal';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tickets_require_fiscal_record ON tickets;
CREATE CONSTRAINT TRIGGER tickets_require_fiscal_record
AFTER INSERT ON tickets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sif_require_fiscal_record();

DROP TRIGGER IF EXISTS invoices_require_fiscal_record ON invoices;
CREATE CONSTRAINT TRIGGER invoices_require_fiscal_record
AFTER INSERT OR UPDATE ON invoices
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sif_require_fiscal_record();
