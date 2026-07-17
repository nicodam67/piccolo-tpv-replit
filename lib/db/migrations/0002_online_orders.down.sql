-- Down migration: 0002_online_orders
-- CAUTION: data in these tables and columns will be permanently lost.

DROP TABLE IF EXISTS notification_log CASCADE;
DROP TABLE IF EXISTS online_order_audit CASCADE;
DROP TABLE IF EXISTS couriers CASCADE;
DROP TABLE IF EXISTS delivery_zones CASCADE;
DROP TABLE IF EXISTS online_orders_config CASCADE;
DROP TABLE IF EXISTS delivery_addresses CASCADE;

ALTER TABLE orders
  DROP COLUMN IF EXISTS channel,
  DROP COLUMN IF EXISTS delivery_type,
  DROP COLUMN IF EXISTS order_number,
  DROP COLUMN IF EXISTS scheduled_at,
  DROP COLUMN IF EXISTS estimated_ready_at,
  DROP COLUMN IF EXISTS client_phone,
  DROP COLUMN IF EXISTS delivery_address_id,
  DROP COLUMN IF EXISTS courier_id,
  DROP COLUMN IF EXISTS rejection_reason,
  DROP COLUMN IF EXISTS online_payment_ref,
  DROP COLUMN IF EXISTS online_payment_status,
  DROP COLUMN IF EXISTS packaging_checked_by,
  DROP COLUMN IF EXISTS packaging_checked_at,
  DROP COLUMN IF EXISTS delivery_fee;
