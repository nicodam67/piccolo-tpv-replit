---
name: Comandas module schema
description: DB schema additions for the Comandas (ordering) module — all pushed to the database.
---

## Schema additions (all live in DB)

**ordersTable:** `guestCount integer default 1`, `notes text`

**orderItemsTable:** `formatId uuid references productFormatsTable`, `formatName text`, `isInvitation boolean default false`

**productFormatsTable** (new, in categories.ts schema file): `id, productId, name, price, sortOrder, active`

**auditLogTable** (new, lib/db/src/schema/audit-log.ts): `id, orderId, employeeId, employeeName, action, details, createdAt`

## Backend routes added (in api-server/src/routes/)
- `PATCH /orders/:orderId` — update guestCount, notes, or status (bill_requested)
- `PATCH /order-items/:itemId` — update quantity, notes, allergyNote, hasAllergy, isInvitation
- `POST /order-items/:itemId/duplicate` — clone an item
- `GET /orders/:orderId/audit` — audit log entries
- `GET /products/:productId/formats` — list active formats
- `POST /products/:productId/formats` — create format (admin)
- `PATCH /products/formats/:formatId` — update format (admin)
- `POST /tables/:tableId/open` now accepts `{ guestCount }` in body

**Why:** Needed for full ordering flow: guest count on open, format selection, modifier selection pre-add, quantity controls, bill request.
