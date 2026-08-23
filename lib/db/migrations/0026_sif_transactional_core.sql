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
  IF EXISTS (
    SELECT 1 FROM invoices
     WHERE order_id IS NOT NULL AND serie = 'F'
     GROUP BY order_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SIF migration blocked: more than one full invoice exists for an order';
  END IF;
  IF EXISTS (
    SELECT 1 FROM verifactu_records GROUP BY huella HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SIF migration blocked: duplicate fiscal hashes';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM verifactu_records
     WHERE registro_tipo = 'alta'
       AND invoice_id IS NULL
  ) THEN
    RAISE EXCEPTION 'SIF migration blocked: historical alta record without invoice source';
  END IF;
  IF (SELECT count(*) FROM verifactu_config) > 1 THEN
    RAISE EXCEPTION 'SIF migration blocked: multiple VERI*FACTU config rows require reconciliation';
  END IF;
END
$$;

ALTER TABLE verifactu_config
  ADD COLUMN IF NOT EXISTS singleton_key integer;
UPDATE verifactu_config SET singleton_key = 1 WHERE singleton_key IS NULL;
ALTER TABLE verifactu_config
  ALTER COLUMN singleton_key SET DEFAULT 1,
  ALTER COLUMN singleton_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS verifactu_config_singleton_key_unique
  ON verifactu_config (singleton_key);
ALTER TABLE verifactu_config
  DROP CONSTRAINT IF EXISTS verifactu_config_singleton_key_check;
ALTER TABLE verifactu_config
  ADD CONSTRAINT verifactu_config_singleton_key_check CHECK (singleton_key = 1);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS product_name_snapshot text NOT NULL DEFAULT '';
UPDATE order_items AS item
   SET product_name_snapshot = product.name
  FROM products AS product
 WHERE item.product_id = product.id
   AND item.product_name_snapshot = '';

CREATE OR REPLACE FUNCTION sif_snapshot_order_item_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.product_name_snapshot = '' THEN
    SELECT name INTO NEW.product_name_snapshot
      FROM products
     WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS order_items_snapshot_product_name ON order_items;
CREATE TRIGGER order_items_snapshot_product_name
BEFORE INSERT ON order_items
FOR EACH ROW EXECUTE FUNCTION sif_snapshot_order_item_name();

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

DO $$
BEGIN
  IF EXISTS (
    WITH ordered AS (
      SELECT huella_anterior,
             coalesce(
               lag(huella) OVER (
                 PARTITION BY chain_key ORDER BY chain_sequence
               ),
               ''
             ) AS expected_previous
        FROM verifactu_records
    )
    SELECT 1 FROM ordered WHERE huella_anterior <> expected_previous
  ) THEN
    RAISE EXCEPTION 'SIF migration blocked: historical fiscal chain links are inconsistent; document and reconcile the cut before issuing new records';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM verifactu_records
     WHERE huella <> upper(encode(digest(convert_to(
       CASE
         WHEN registro_tipo = 'anulacion' THEN
           'IDEmisorFacturaAnulada=' || btrim(emisor_nif)
           || '&NumSerieFacturaAnulada=' || btrim(num_serie_factura)
           || '&FechaExpedicionFacturaAnulada=' || btrim(fecha_expedicion)
           || '&Huella=' || btrim(huella_anterior)
           || '&FechaHoraHusoGenRegistro=' || btrim(fecha_hora_generacion)
         ELSE
           'IDEmisorFactura=' || btrim(emisor_nif)
           || '&NumSerieFactura=' || btrim(num_serie_factura)
           || '&FechaExpedicionFactura=' || btrim(fecha_expedicion)
           || '&TipoFactura=' || btrim(tipo_factura)
           || '&CuotaTotal=' || btrim(cuota_total::text)
           || '&ImporteTotal=' || btrim(importe_total::text)
           || '&Huella=' || btrim(huella_anterior)
           || '&FechaHoraHusoGenRegistro=' || btrim(fecha_hora_generacion)
       END,
       'UTF8'
     ), 'sha256'), 'hex'))
  ) THEN
    RAISE EXCEPTION 'SIF migration blocked: historical fiscal hashes do not match the official algorithm; preserve evidence and complete a documented remediation before retrying';
  END IF;
END
$$;

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

ALTER TABLE verifactu_records
  DROP CONSTRAINT IF EXISTS verifactu_records_alta_source_check;
ALTER TABLE verifactu_records
  ADD CONSTRAINT verifactu_records_alta_source_check
  CHECK (
    registro_tipo <> 'alta'
    OR ((invoice_id IS NULL) <> (ticket_id IS NULL))
  );

-- Move the transactional counters forward before switching existing
-- installations away from ticket bigserial/default allocation.
INSERT INTO invoice_series (id, serie, document_type, current_number, prefix, updated_at)
SELECT gen_random_uuid(), serie, 'ticket', max(ticket_number)::integer, '', now()
  FROM tickets
 GROUP BY serie
ON CONFLICT (serie, document_type)
DO UPDATE SET
  current_number = greatest(invoice_series.current_number, EXCLUDED.current_number),
  updated_at = now();

INSERT INTO invoice_series (id, serie, document_type, current_number, prefix, updated_at)
SELECT gen_random_uuid(), serie, 'factura', max(invoice_number), '', now()
  FROM invoices
 GROUP BY serie
ON CONFLICT (serie, document_type)
DO UPDATE SET
  current_number = greatest(invoice_series.current_number, EXCLUDED.current_number),
  updated_at = now();

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

CREATE TABLE IF NOT EXISTS sif_migration_findings (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  finding     text NOT NULL,
  row_count   bigint NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sif_migration_findings (finding, row_count)
SELECT 'historical_tickets_without_fiscal_record', count(*)
  FROM tickets AS source
 WHERE NOT EXISTS (
   SELECT 1 FROM verifactu_records AS record
    WHERE record.ticket_id = source.id AND record.registro_tipo = 'alta'
 )
HAVING count(*) > 0;

INSERT INTO sif_migration_findings (finding, row_count)
SELECT 'historical_issued_invoices_without_fiscal_record', count(*)
  FROM invoices AS source
 WHERE source.status <> 'draft'
   AND NOT EXISTS (
     SELECT 1 FROM verifactu_records AS record
      WHERE record.invoice_id = source.id AND record.registro_tipo = 'alta'
   )
HAVING count(*) > 0;

INSERT INTO sif_migration_findings (finding, row_count)
SELECT 'orders_with_both_simplified_and_full_invoice', count(*)
  FROM tickets
  JOIN invoices USING (order_id)
 WHERE invoices.serie = 'F'
HAVING count(*) > 0;

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

  IF NOT source_has_record
     AND TG_TABLE_NAME = 'invoices'
     AND OLD.status = 'draft' THEN
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
    IF OLD.status <> 'draft' AND NEW.status = 'draft' THEN
      RAISE EXCEPTION 'Una factura emitida no puede volver a borrador';
    END IF;
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

CREATE OR REPLACE FUNCTION sif_prevent_duplicate_invoice_document()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('sif-document:' || coalesce(NEW.order_id::text, ''))
  );
  IF TG_TABLE_NAME = 'tickets' THEN
    IF EXISTS (
      SELECT 1 FROM invoices
       WHERE order_id = NEW.order_id AND serie = 'F' AND status <> 'draft'
    ) THEN
      RAISE EXCEPTION 'El pedido ya tiene una factura completa emitida';
    END IF;
  ELSIF NEW.serie = 'F' AND NEW.status <> 'draft' THEN
    IF EXISTS (SELECT 1 FROM tickets WHERE order_id = NEW.order_id) THEN
      RAISE EXCEPTION 'El pedido ya tiene una factura simplificada emitida';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tickets_one_fiscal_document ON tickets;
CREATE TRIGGER tickets_one_fiscal_document
BEFORE INSERT ON tickets
FOR EACH ROW EXECUTE FUNCTION sif_prevent_duplicate_invoice_document();

DROP TRIGGER IF EXISTS invoices_one_fiscal_document ON invoices;
CREATE TRIGGER invoices_one_fiscal_document
BEFORE INSERT OR UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION sif_prevent_duplicate_invoice_document();

CREATE OR REPLACE FUNCTION sif_lock_order_financial_content()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_order_id uuid;
  old_order_id uuid;
  new_order_id uuid;
  order_status text;
BEGIN
  IF TG_TABLE_NAME = 'order_item_modifiers' THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT order_id INTO old_order_id FROM order_items WHERE id = OLD.order_item_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT order_id INTO new_order_id FROM order_items WHERE id = NEW.order_item_id;
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN old_order_id := OLD.order_id; END IF;
    IF TG_OP <> 'DELETE' THEN new_order_id := NEW.order_id; END IF;
  END IF;

  FOREACH target_order_id IN ARRAY ARRAY[old_order_id, new_order_id]
  LOOP
    IF target_order_id IS NULL THEN CONTINUE; END IF;
    SELECT status INTO order_status
      FROM orders
     WHERE id = target_order_id
     FOR UPDATE;

    IF order_status IN ('paid', 'completed')
       OR EXISTS (SELECT 1 FROM tickets WHERE order_id = target_order_id)
       OR EXISTS (
         SELECT 1 FROM invoices
          WHERE order_id = target_order_id AND status <> 'draft'
       ) THEN
      RAISE EXCEPTION 'El contenido económico de una factura emitida es inmutable';
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS order_items_lock_fiscal_content ON order_items;
CREATE TRIGGER order_items_lock_fiscal_content
BEFORE INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW EXECUTE FUNCTION sif_lock_order_financial_content();

DROP TRIGGER IF EXISTS discounts_lock_fiscal_content ON discounts;
CREATE TRIGGER discounts_lock_fiscal_content
BEFORE INSERT OR UPDATE OR DELETE ON discounts
FOR EACH ROW EXECUTE FUNCTION sif_lock_order_financial_content();

DROP TRIGGER IF EXISTS order_item_modifiers_lock_fiscal_content ON order_item_modifiers;
CREATE TRIGGER order_item_modifiers_lock_fiscal_content
BEFORE INSERT OR UPDATE OR DELETE ON order_item_modifiers
FOR EACH ROW EXECUTE FUNCTION sif_lock_order_financial_content();

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
    IF NEW.status <> 'draft'
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
