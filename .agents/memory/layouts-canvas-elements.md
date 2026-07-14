---
name: Layouts & canvas elements
description: Decisions around multi-layout support, canvas_elements table, and api-zod conflict fix
---

## Layout system
- `active_layout TEXT DEFAULT 'normal'` column on `room_zones`; `layout TEXT DEFAULT 'normal'` on `restaurant_tables`
- Valid layouts: `normal | verano | invierno | eventos`
- `GET /zones/:id/tables?layout=xxx` — explicit layout for editor; if omitted and user is waiter, uses zone's `active_layout`
- `PATCH /zones/:id { activeLayout }` sets the live layout waiters see
- `GET /zones?all=true` (admin only) returns inactive zones too

## Canvas elements
- Table: `canvas_elements (id, zone_id FK, layout, type, x, y, width, height, rotation, color, label, active)`
- Types: `wall | door | bar | column`
- Routes: `GET/POST /zones/:zoneId/elements`, `PATCH/DELETE /elements/:id`
- All mutations require `requireRole("admin")`
- Elements are fetched via plain `fetch()` in the frontend (not via generated hook) because the hook wasn't available pre-codegen

## api-zod index conflict
**Problem:** Orval generates both Zod schemas (`api.ts`) and TypeScript types (`types/`) with the same names for query-param types. Exporting both causes TS2308.
**Fix:** `lib/api-zod/src/index.ts` must only export `./generated/api` — never `./generated/types`.
**Why:** The types directory lacks a barrel index AND collides by name with the Zod schemas in api.ts.
**How to apply:** After any codegen run, if this file gets regenerated with extra exports, trim it back to just `export * from "./generated/api"`. Also set `indexFiles: false` in orval.config.ts for the zod output.
