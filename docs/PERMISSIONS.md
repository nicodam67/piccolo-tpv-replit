# Permissions Catalog — Piccolo TPV

> Covers the `module.action` permission model, role→permission mapping, and how to protect both backend routes and frontend pages.

---

## Overview

Piccolo TPV uses a **hierarchical** permissions model:

1. **Roles** — assigned to employees (`admin`, `manager`, `encargado`, `waiter`, `cashier`, `kitchen`).
2. **Permissions** — `module.action` strings derived from an employee's role at runtime.
3. **Guards** — backend middleware (`requirePermission`) and frontend components (`<RequirePermission>`).

Neither the role nor the permission list is stored in the JWT — the JWT only carries `{ id, name, role }`. Permission checks are always computed from the current role at request time.

---

## Role Hierarchy

```
admin
  └─ manager
       └─ encargado (shift supervisor)
            └─ waiter  ←→  cashier
                              └─ kitchen
```

Higher roles inherit all permissions of lower roles, plus extras.

---

## Permission Catalog

### `orders.*`
| Permission | admin | manager | encargado | waiter | cashier | kitchen |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| `orders.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `orders.create` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `orders.send` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `orders.cancel` | ✓ | ✓ | ✓ | — | — | — |
| `orders.manage` | ✓ | ✓ | — | — | — | — |

### `payments.*`
| Permission | admin | manager | encargado | waiter | cashier | kitchen |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| `payments.process` | ✓ | ✓ | ✓ | — | ✓ | — |
| `payments.refund` | ✓ | ✓ | — | — | — | — |
| `payments.void` | ✓ | ✓ | — | — | — | — |

### `discounts.*`
| Permission | admin | manager | encargado | waiter | cashier | kitchen |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| `discounts.apply` | ✓ | ✓ | ✓ | ✓ | ✓ | — |

> Discounts >20% and invitations require **manager authorization** regardless of the employee's own `discounts.apply` permission.

### `cash.*`
| Permission | admin | manager | encargado | waiter | cashier | kitchen |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| `cash.manage` | ✓ | ✓ | ✓ | — | — | — |
| `cash.open` | ✓ | ✓ | ✓ | — | ✓ | — |
| `cash.close` | ✓ | ✓ | ✓ | — | — | — |

### `reports.*`
| Permission | admin | manager | encargado | waiter | cashier | kitchen |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| `reports.view` | ✓ | ✓ | ✓ | — | — | — |
| `reports.export` | ✓ | ✓ | — | — | — | — |

### `stock.*`
| Permission | admin | manager | encargado | waiter | cashier | kitchen |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| `stock.view` | ✓ | ✓ | ✓ | — | — | ✓ |
| `stock.manage` | ✓ | ✓ | — | — | — | — |

### `employees.*`
| Permission | admin | manager | encargado | waiter | cashier | kitchen |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| `employees.view` | ✓ | ✓ | ✓ | — | — | — |
| `employees.manage` | ✓ | ✓ | — | — | — | — |

### `crm.*`
| Permission | admin | manager | encargado | waiter | cashier | kitchen |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| `crm.view` | ✓ | ✓ | ✓ | — | — | — |
| `crm.manage` | ✓ | ✓ | — | — | — | — |

### `backup.*`
| Permission | admin | manager | encargado | waiter | cashier | kitchen |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| `backup.manage` | ✓ | — | — | — | — | — |

### `fiscal.*`
| Permission | admin | manager | encargado | waiter | cashier | kitchen |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| `fiscal.manage` | ✓ | — | — | — | — | — |

### `config.*`
| Permission | admin | manager | encargado | waiter | cashier | kitchen |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| `config.manage` | ✓ | — | — | — | — | — |

---

## Backend — Protecting a Route

```typescript
import { requireAuth, requirePermission } from "../middlewares/auth";

// Option 1: role-based (simpler, less granular)
router.get("/cash/close", requireAuth, requireRole("manager", "admin"), handler);

// Option 2: permission-based (preferred for cross-role actions)
router.post("/discounts", requireAuth, requirePermission("discounts.apply"), handler);
```

### Adding a new permission

1. Add the `module.action` constant to **both** `artifacts/api-server/src/lib/permissions.ts` **and** `artifacts/piccolo-tpv/src/lib/permissions.ts`.
2. Add it to the role's permission set in the `ROLE_PERMISSIONS` map in both files.
3. Apply it to the route with `requirePermission("module.action")`.
4. (Optional) Wrap the frontend page with `<RequirePermission permission="module.action">`.

The two files must be kept in sync manually — there is no code generation step.

---

## Frontend — Protecting a Page

```tsx
// Redirect to login if unauthenticated
<ProtectedRoute>
  <MyPage />
</ProtectedRoute>

// Show 403 screen if role doesn't match
<RequireRole role="admin">
  <AdminPage />
</RequireRole>

// Show 403 screen if permission is missing
<RequirePermission permission="stock.manage">
  <StockPage />
</RequirePermission>
```

All three components are in `artifacts/piccolo-tpv/src/components/auth/`.

---

## Manager Authorization (elevated actions)

Some actions require a manager to authorize even when performed by a role that has the base permission. The frontend shows a `<ManagerPinModal>` to collect manager credentials; the backend calls `verifyManagerToken(req, operation)` to validate the short-lived token.

```typescript
// Backend: require manager auth for large discounts
const needsManagerAuth = discountPercent > 20 || isInvitation;
if (needsManagerAuth) {
  const ok = await verifyManagerToken(req, "discount.apply");
  if (!ok) {
    res.status(403).json({ error: "Autorización de encargado requerida" });
    return;
  }
}
```

```tsx
// Frontend: trigger manager PIN modal
const { authRequest, requestAuth, closeAuth } = useManagerAuth();

if (needsManagerAuth) {
  return (
    <>
      <button onClick={() => requestAuth("discount.apply")}>
        Aplicar descuento
      </button>
      {authRequest && (
        <ManagerPinModal
          operation={authRequest.operation}
          onAuthorized={managerToken => applyDiscount({ managerToken })}
          onClose={closeAuth}
        />
      )}
    </>
  );
}
```
