---
name: Director Dashboard Module
description: Implementation notes for the Panel de Dirección — tables, routes, frontend conventions.
---

## Tables (migration 0010)
- `director_goals` — configurable targets with period/type/zone
- `director_alerts` — centralized alert center (priority, status, history)
- `director_costs` — overhead costs with periodicity and payment status
- `director_daily_snapshots` — pre-aggregated daily data (unique on snapshot_date)
- `director_custom_reports` — saved report templates as jsonb

## Backend routes
- `director.ts` — read-only metric endpoints: `/director/kpis`, `/director/sales`, `/director/profitability`, `/director/cash`, `/director/staff`, `/director/stock`, `/director/reservations`, `/director/kitchen`, `/director/delivery`, `/director/crm`, `/director/forecast`, `/director/daily-summary/:date`, `/director/snapshots/generate`, `/director/export`
- `director-management.ts` — CRUD + automation: goals, costs, alerts, custom-reports, demo-data, auto-generate alerts

## Frontend
- 15-tab page at `/admin/director` via `DirectorPage.tsx`
- All sub-pages in `artifacts/piccolo-tpv/src/pages/director/`

## Key conventions to remember
- This project uses **React**, not Preact — never use `from "preact/hooks"` in TPV pages
- SVG attributes must be camelCase in JSX: `strokeLinecap`, `strokeLinejoin`, `strokeWidth`, `className` (not `class`)
- `ordersTable.zoneId` does NOT exist as a Drizzle column — use raw `sql\`\`` for zone filtering on orders
- All metric endpoints are read-only aggregates; no data is duplicated in director tables
- Labor cost is estimated from time_records × hourlyRate × employerCostRate (default 1.35)
- COGS estimated from order_items × product.cost (or product_format.cost)

**Why:** The project switched from Preact to React early on; mixing the two causes Vite import resolution failures.
