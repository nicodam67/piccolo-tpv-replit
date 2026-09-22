ALTER TABLE kitchen_tasks
  DROP CONSTRAINT IF EXISTS kitchen_tasks_order_item_id_order_items_id_fk;
DELETE FROM kitchen_tasks WHERE order_item_id IS NULL;
ALTER TABLE kitchen_tasks ALTER COLUMN order_item_id SET NOT NULL;
ALTER TABLE kitchen_tasks
  ADD CONSTRAINT kitchen_tasks_order_item_id_order_items_id_fk
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE;
ALTER TABLE kitchen_tasks
  DROP COLUMN IF EXISTS resend_count,
  DROP COLUMN IF EXISTS last_resent_at,
  DROP COLUMN IF EXISTS last_resent_by;

DROP INDEX IF EXISTS print_queue_worker_idx;
DROP INDEX IF EXISTS print_queue_dedupe_key_unique;
UPDATE print_queue SET status = 'printed' WHERE status = 'delivered';
UPDATE print_queue SET status = 'error' WHERE status IN ('failed', 'delivery_unknown');
ALTER TABLE print_queue
  DROP COLUMN IF EXISTS dedupe_key,
  DROP COLUMN IF EXISTS available_at,
  DROP COLUMN IF EXISTS lease_until,
  DROP COLUMN IF EXISTS locked_by,
  DROP COLUMN IF EXISTS transport_acked_at,
  DROP COLUMN IF EXISTS confirmation_level,
  DROP COLUMN IF EXISTS updated_at;

ALTER TABLE printers
  DROP CONSTRAINT IF EXISTS printers_connection_type_check,
  DROP CONSTRAINT IF EXISTS printers_paper_width_check,
  DROP CONSTRAINT IF EXISTS printers_port_check;
ALTER TABLE printers
  DROP COLUMN IF EXISTS department_code,
  DROP COLUMN IF EXISTS connection_type,
  DROP COLUMN IF EXISTS agent_url,
  DROP COLUMN IF EXISTS character_set,
  DROP COLUMN IF EXISTS auto_cut,
  DROP COLUMN IF EXISTS open_cash_drawer;

DROP TABLE IF EXISTS production_departments;
