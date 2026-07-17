-- Down migration: 0007_online_v2
-- CAUTION: data in these tables and columns will be permanently lost.

DROP INDEX IF EXISTS idx_par_category_id;
DROP INDEX IF EXISTS idx_par_product_id;
DROP INDEX IF EXISTS idx_pa_external_id;
DROP INDEX IF EXISTS idx_pa_order_id;
DROP INDEX IF EXISTS idx_oc_updated_at;
DROP INDEX IF EXISTS idx_oc_session_token;
DROP INDEX IF EXISTS idx_ts_created_at;
DROP INDEX IF EXISTS idx_ts_table_id;
DROP INDEX IF EXISTS idx_ts_token;
DROP INDEX IF EXISTS idx_orders_idempotency_key;

DROP TABLE IF EXISTS product_availability_rules CASCADE;
DROP TABLE IF EXISTS payment_attempts CASCADE;
DROP TABLE IF EXISTS online_carts CASCADE;
DROP TABLE IF EXISTS table_sessions CASCADE;

ALTER TABLE products
  DROP COLUMN IF EXISTS name_en,
  DROP COLUMN IF EXISTS description_en,
  DROP COLUMN IF EXISTS name_es,
  DROP COLUMN IF EXISTS description_es;

ALTER TABLE categories
  DROP COLUMN IF EXISTS name_en;

ALTER TABLE online_orders_config
  DROP COLUMN IF EXISTS tip_enabled,
  DROP COLUMN IF EXISTS tip_percentages,
  DROP COLUMN IF EXISTS table_ordering_enabled,
  DROP COLUMN IF EXISTS stripe_publishable_key,
  DROP COLUMN IF EXISTS stripe_secret_key,
  DROP COLUMN IF EXISTS stripe_webhook_secret;

ALTER TABLE orders
  DROP COLUMN IF EXISTS scheduled_for,
  DROP COLUMN IF EXISTS tip_amount,
  DROP COLUMN IF EXISTS idempotency_key,
  DROP COLUMN IF EXISTS table_session_id;
