-- Migration 0019: Granular role-permission overrides
-- Allows admins to grant or deny specific (module, action) pairs per role,
-- overriding the default blanket role-based access.
-- All statements use IF NOT EXISTS — safe to re-run.

CREATE TABLE IF NOT EXISTS role_permissions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  role        text        NOT NULL,    -- 'admin'|'manager'|'encargado'|'waiter'|'cashier'
  module      text        NOT NULL,    -- e.g. 'orders', 'payments', 'discounts'
  action      text        NOT NULL,    -- e.g. 'create', 'edit', 'delete', 'apply_discount'
  allowed     boolean     NOT NULL DEFAULT true,
  updated_by  uuid        REFERENCES employees(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, module, action)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role   ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_module ON role_permissions(module);
