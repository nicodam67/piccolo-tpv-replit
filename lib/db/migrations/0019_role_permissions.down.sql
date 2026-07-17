-- Down migration: 0019_role_permissions
DROP INDEX IF EXISTS idx_role_permissions_module;
DROP INDEX IF EXISTS idx_role_permissions_role;
DROP TABLE IF EXISTS role_permissions CASCADE;
