DROP INDEX IF EXISTS price_change_proposals_product_created_idx;
DROP TABLE IF EXISTS price_change_proposals;
DROP INDEX IF EXISTS profitability_targets_unique_scope;
DROP TABLE IF EXISTS profitability_targets;
DROP INDEX IF EXISTS channel_commissions_channel_unique;
DROP TABLE IF EXISTS channel_commissions;
DROP TABLE IF EXISTS operating_expenses;
DROP TABLE IF EXISTS profitability_settings;
ALTER TABLE ingredient_cost_history
  DROP COLUMN IF EXISTS supplier_id,
  DROP COLUMN IF EXISTS source_reference,
  DROP COLUMN IF EXISTS source;
