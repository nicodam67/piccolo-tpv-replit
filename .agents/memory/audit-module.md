---
name: Audit module
description: Panel de diagnóstico y clasificación de módulos — DB tables, API routes, frontend page, and key findings.
---

## Routes (registered under /api prefix via app.ts)
- `GET /api/admin/audit/modules` — module catalog with effective status (base status overlaid by active findings)
- `POST /api/admin/audit/run` — runs all checks, archives old automated findings, inserts fresh ones
- `GET /api/admin/audit/findings` — list findings (filterable by module/severity/resolved)
- `PATCH /api/admin/audit/findings/:id/resolve` — mark resolved
- `GET /api/admin/audit/report?format=md|json` — downloadable report

## DB tables (migration 0013)
- `audit_findings` — module, severity, title, description, detectedAt, resolvedAt, runId, automated
- `audit_runs` — log of each POST /audit/run execution

## Module catalog key findings (as of initial audit)
- **56 modules** catalogued; **41 🟢 functional**, **10 🟡 with warnings**, **5 🟠/⚫ simulated or partial**
- Critical warnings: VeriFactu pending records have no background worker; payments lack idempotency key; stock deduction is fire-and-forget; online-orders v1+v2 both registered simultaneously
- KDS prepZone values on products don't match KDS zone constants
- Stripe payments simulated without STRIPE_SECRET_KEY

**Why:** This is the source-of-truth inventory for tasks #209 (stabilisation), #210 (security/IVA), #211 (tests/docs).

## Frontend page
- Route: `/admin/sistema`
- File: `artifacts/piccolo-tpv/src/pages/admin-sistema.tsx`
- Shows summary bar, duplications panel, filter by area/status, expandable module cards

