/**
 * Centralized permissions catalog for Piccolo TPV.
 *
 * Format: `module.action`
 * Usage (frontend):
 *   import { PERMISSIONS, hasPermission } from '../lib/permissions';
 *   if (hasPermission(user.role, PERMISSIONS.discounts.apply)) { ... }
 *
 * The same catalog is mirrored in artifacts/api-server/src/lib/permissions.ts
 * so frontend and backend always agree on permission names.
 */

// ── Permission constants ──────────────────────────────────────────────────────
export const PERMISSIONS = {
  tables:    { view: 'tables.view',    manage: 'tables.manage'    },
  orders:    { create: 'orders.create', modify: 'orders.modify',
               cancel: 'orders.cancel', void: 'orders.void'       },
  kds:       { view: 'kds.view',       manage: 'kds.manage'       },
  payments:  { create: 'payments.create', refund: 'payments.refund' },
  cash:      { open: 'cash.open',      close: 'cash.close',
               view: 'cash.view'                                   },
  invoices:  { create: 'invoices.create', correct: 'invoices.correct' },
  fiscal:    { configure: 'fiscal.configure'                       },
  products:  { manage: 'products.manage'                           },
  stock:     { manage: 'stock.manage'                              },
  employees: { manage: 'employees.manage'                          },
  timeclock: { manage: 'timeclock.manage'                          },
  reports:   { view: 'reports.view'                                },
  settings:  { manage: 'settings.manage'                           },
  users:     { manage: 'users.manage'                              },
  devices:   { manage: 'devices.manage'                            },
  discounts: { apply: 'discounts.apply'                            },
  delivery:  { manage: 'delivery.manage'                           },
  crm:       { view: 'crm.view',       manage: 'crm.manage'       },
  backup:    { manage: 'backup.manage'                             },
} as const;

export type Permission = string;

// ── Role → permissions mapping ────────────────────────────────────────────────
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['*'],  // wildcard: grants every permission
  manager: [
    'tables.view', 'tables.manage',
    'orders.create', 'orders.modify', 'orders.cancel', 'orders.void',
    'kds.view', 'kds.manage',
    'payments.create', 'payments.refund',
    'cash.open', 'cash.close', 'cash.view',
    'invoices.create', 'invoices.correct',
    'products.manage',
    'stock.manage',
    'employees.manage',
    'timeclock.manage',
    'reports.view',
    'settings.manage',
    'discounts.apply',
    'delivery.manage',
    'crm.view', 'crm.manage',
    'backup.manage',
  ],
  encargado: [
    'tables.view', 'tables.manage',
    'orders.create', 'orders.modify', 'orders.cancel',
    'kds.view', 'kds.manage',
    'payments.create',
    'cash.open', 'cash.close', 'cash.view',
    'invoices.create',
    'reports.view',
    'discounts.apply',
    'crm.view',
  ],
  waiter: [
    'tables.view',
    'orders.create', 'orders.modify',
    'kds.view',
    'payments.create',
    'cash.view',
  ],
};

/**
 * Returns true if `role` has the given `permission`.
 * Admin role grants every permission via the '*' wildcard.
 */
export function hasPermission(role: string | undefined | null, permission: string): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes('*') || perms.includes(permission);
}

/**
 * Returns true if `role` is one of the `allowedRoles`.
 */
export function hasRole(role: string | undefined | null, ...allowedRoles: string[]): boolean {
  if (!role) return false;
  return allowedRoles.includes(role);
}
