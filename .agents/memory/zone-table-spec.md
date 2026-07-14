---
name: Zone & Table extended spec decisions
description: Key implementation decisions from Entrega 5+ spec for zone/table editor
---

## rotation column
- Added `rotation INTEGER NOT NULL DEFAULT 0` to `restaurant_tables` via executeSql.
- Drizzle schema: `rotation: integer("rotation").notNull().default(0)`.
- PATCH /tables/:tableId accepts rotation (0-359), normalises with `% 360`.
- Frontend: CSS `transform: rotate(${rotation}deg)` with `transformOrigin: center center` on both zone-editor and tables views.

## Extended table statuses
Valid statuses: free | occupied | waiting | bill_requested | out_of_service | reserved.
- PATCH /tables/:tableId accepts status if it is in VALID_STATUSES list.
- zone-editor sidebar has "Poner fuera de servicio" toggle.
- tables.tsx uses STATUS_STYLES map keyed by status string for bg/border/text/dot/glow.

## GET /zones/:zoneId/tables — order info JOIN
Uses raw SQL (db.execute(sql`...`)) for a LEFT JOIN with orders + employees + order_items.
Returns: currentOrderId, openedAt, employeeName, currentTotal (float).
These are nullable on Table schema in OpenAPI spec.
**Why:** Drizzle ORM chained joins with aggregates are complex; raw SQL is more explicit and maintainable here.

## Duplicate endpoints
- POST /tables/:tableId/duplicate — copies all props, clears mergeGroup, status='free', offsets x+40/y+40.
- POST /zones/:zoneId/duplicate — copies zone (name + " (copia)"), copies all active tables (mergeGroup=null, status=free).

## Zone delete guard
DELETE /zones/:zoneId returns 409 if any table in zone has status='open' order.
Frontend shows the server error message in a toast.

## Lock mode (zone-editor)
`locked` boolean state — when true, handleTablePointerDown returns early, tables show cursor:default.
Lock/Unlock button in toolbar uses amber styling when locked.
