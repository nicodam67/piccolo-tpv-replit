-- Down migration: 0006_delivery_v2
-- CAUTION: data in these tables and columns will be permanently lost.

DROP INDEX IF EXISTS idx_cs_created_at;
DROP INDEX IF EXISTS idx_cs_courier_id;
DROP INDEX IF EXISTS idx_dosh_created_at;
DROP INDEX IF EXISTS idx_dosh_order_id;

DROP TABLE IF EXISTS courier_settlements CASCADE;
DROP TABLE IF EXISTS delivery_order_status_history CASCADE;

ALTER TABLE couriers
  DROP COLUMN IF EXISTS vehicle_type,
  DROP COLUMN IF EXISTS plate,
  DROP COLUMN IF EXISTS zona_habitual,
  DROP COLUMN IF EXISTS turno,
  DROP COLUMN IF EXISTS earned_cash_pending,
  DROP COLUMN IF EXISTS earned_card_pending,
  DROP COLUMN IF EXISTS total_deliveries,
  DROP COLUMN IF EXISTS avg_delivery_minutes;
