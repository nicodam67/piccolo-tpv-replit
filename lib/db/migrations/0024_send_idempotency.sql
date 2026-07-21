-- Send-to-kitchen deduplication invariants.
-- The migration intentionally fails if historical duplicates exist so operators
-- must reconcile stock before adding constraints; silently deleting movements
-- would make physical stock unverifiable.

CREATE UNIQUE INDEX IF NOT EXISTS kitchen_tasks_order_item_unique
  ON kitchen_tasks (order_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS stock_sale_order_item_ingredient_unique
  ON stock_movements (order_item_id, ingredient_id, movement_type)
  WHERE movement_type = 'sale' AND order_item_id IS NOT NULL;
