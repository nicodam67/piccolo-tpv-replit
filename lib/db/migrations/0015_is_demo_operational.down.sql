-- Down migration: 0015_is_demo_operational
-- Removes is_demo flags and related indexes from core operational tables.

DROP INDEX IF EXISTS idx_reservations_is_demo;
DROP INDEX IF EXISTS idx_stock_movements_is_demo;
DROP INDEX IF EXISTS idx_cash_sessions_is_demo;
DROP INDEX IF EXISTS idx_payments_is_demo;
DROP INDEX IF EXISTS idx_tickets_is_demo;
DROP INDEX IF EXISTS idx_orders_is_demo;

ALTER TABLE reservations DROP COLUMN IF EXISTS is_demo;
ALTER TABLE stock_movements DROP COLUMN IF EXISTS is_demo;
ALTER TABLE cash_sessions DROP COLUMN IF EXISTS is_demo;
ALTER TABLE payments DROP COLUMN IF EXISTS is_demo;
ALTER TABLE tickets DROP COLUMN IF EXISTS is_demo;
ALTER TABLE orders DROP COLUMN IF EXISTS is_demo;
