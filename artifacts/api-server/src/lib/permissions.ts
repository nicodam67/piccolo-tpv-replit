/**
 * Centralized permissions catalog — backend mirror.
 * Keep in sync with artifacts/piccolo-tpv/src/lib/permissions.ts
 */

export const PERMISSIONS = {
  tables:    { view: 'tables.view',    manage: 'tables.manage'    },
  orders:    { create: 'orders.create', modify: 'orders.modify',
               cancel: 'orders.cancel', void: 'orders.void'       },
  kds:       { view: 'kds.view',       manage: 'kds.manage'       },
  payments:  { create: 'payments.create', refund: 'payments.refund',
               void: 'payments.void', split: 'payments.split' },
  cash:      { open: 'cash.open',      close: 'cash.close',
               view: 'cash.view'                                   },
  invoices:  { create: 'invoices.create', correct: 'invoices.correct' },
  fiscal:    { configure: 'fiscal.configure'                       },
  products:  { manage: 'products.manage'                           },
  stock:     { view: 'stock.view', manage: 'stock.manage'           },
  suppliers: { manage: 'suppliers.manage'                           },
  employees: { manage: 'employees.manage'                          },
  timeclock: { manage: 'timeclock.manage'                          },
  reports:   { view: 'reports.view'                                },
  settings:  { manage: 'settings.manage'                           },
  users:     { manage: 'users.manage'                              },
  devices:   { manage: 'devices.manage'                            },
  discounts: { apply: 'discounts.apply', delete: 'discounts.delete' },
  comps:     { apply: 'comps.apply'                                 },
  taxes:     { manage: 'taxes.manage'                               },
  delivery:  { manage: 'delivery.manage'                           },
  crm:       { view: 'crm.view',       manage: 'crm.manage'       },
  backup:    { manage: 'backup.manage'                             },
} as const;

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['*'],
  manager: [
    'tables.view', 'tables.manage',
    'orders.create', 'orders.modify', 'orders.cancel', 'orders.void',
    'kds.view', 'kds.manage',
    'payments.create', 'payments.refund',
    'payments.void', 'payments.split',
    'cash.open', 'cash.close', 'cash.view',
    'invoices.create', 'invoices.correct',
    'products.manage',
    'stock.manage',
    'stock.view', 'suppliers.manage',
    'employees.manage',
    'timeclock.manage',
    'reports.view',
    'settings.manage',
    'discounts.apply', 'discounts.delete', 'comps.apply', 'taxes.manage',
    'delivery.manage',
    'crm.view', 'crm.manage',
    'backup.manage',
  ],
  encargado: [
    'tables.view', 'tables.manage',
    'orders.create', 'orders.modify', 'orders.cancel',
    'kds.view', 'kds.manage',
    'payments.create', 'payments.split',
    'cash.open', 'cash.close', 'cash.view',
    'invoices.create',
    'stock.view',
    'timeclock.manage',
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
  cashier: [
    'tables.view',
    'orders.create', 'orders.modify',
    'payments.create', 'payments.split',
    'cash.open', 'cash.view',
  ],
  kitchen: [
    'kds.view', 'kds.manage',
  ],
};

export function hasPermission(role: string | undefined | null, permission: string): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes('*') || perms.includes(permission);
}

export function hasRole(role: string | undefined | null, ...allowedRoles: string[]): boolean {
  if (!role) return false;
  return allowedRoles.includes(role);
}
