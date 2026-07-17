-- Down migration: 0003_printers
-- CAUTION: data in these tables and columns will be permanently lost.

DROP TABLE IF EXISTS print_audit CASCADE;
DROP TABLE IF EXISTS print_routing CASCADE;
DROP TABLE IF EXISTS print_queue CASCADE;
DROP TABLE IF EXISTS printers CASCADE;

ALTER TABLE business_config
  DROP COLUMN IF EXISTS print_mode,
  DROP COLUMN IF EXISTS print_template_config;
