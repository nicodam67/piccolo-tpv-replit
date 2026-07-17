-- Migration 0015: Add is_demo flag to core operational tables
-- Purpose: allows simulation/demo data to be purged without touching real records
-- Affected tables: orders, tickets, payments, cash_sessions, stock_movements, reservations

ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

-- Indexes for efficient demo-data purge queries
CREATE INDEX IF NOT EXISTS idx_orders_is_demo ON orders(is_demo) WHERE is_demo = TRUE;
CREATE INDEX IF NOT EXISTS idx_tickets_is_demo ON tickets(is_demo) WHERE is_demo = TRUE;
CREATE INDEX IF NOT EXISTS idx_payments_is_demo ON payments(is_demo) WHERE is_demo = TRUE;
CREATE INDEX IF NOT EXISTS idx_cash_sessions_is_demo ON cash_sessions(is_demo) WHERE is_demo = TRUE;
CREATE INDEX IF NOT EXISTS idx_stock_movements_is_demo ON stock_movements(is_demo) WHERE is_demo = TRUE;
CREATE INDEX IF NOT EXISTS idx_reservations_is_demo ON reservations(is_demo) WHERE is_demo = TRUE;
