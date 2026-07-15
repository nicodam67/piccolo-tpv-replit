---
name: Fichaje integration
description: Key decisions and gotchas from integrating the Fichaje Empleados app into Piccolo TPV as a module.
---

## Rule
The fichaje module lives entirely inside the TPV monorepo. Clerk auth was dropped; the TPV JWT/PIN system is used instead. Employee IDs are UUIDs (TPV's format). The original app used integer IDs — `legacy_fichaje_id` column on `employees` tracks the migration mapping.

## Why
The fichaje app was a separate Replit project with its own PostgreSQL and Clerk authentication. To unify session, DB, and employee entity, it was ported as a TPV module rather than kept federated.

## How to apply
- New fichaje tables: `time_records`, `breaks`, `shifts`, `absences`, `time_corrections`, `csv_imports`, `fichaje_audit`, `fichaje_settings` — all in `lib/db/src/schema/fichaje.ts`
- API routes: `artifacts/api-server/src/routes/fichaje.ts` — all under `/api/fichaje/*`
- Public (no-auth) endpoints for mobile clock: `/api/fichaje/public/*`
- Frontend pages: `artifacts/piccolo-tpv/src/pages/fichaje/*.tsx`
- Mobile clock screen at `/fichaje` (no sidebar, light theme, optimized for mobile)
- Admin pages at `/admin/fichaje/*` — 7 sections in the dashboard under "Personal"
- `mobileClockEnabled` setting in `fichaje_settings` (default false) gates the public clock
- `zod` must be listed explicitly in `api-server/package.json` deps — it's not pulled in transitively by the build
- This project uses `wouter` NOT `react-router-dom` — use `useLocation` from wouter, not `useNavigate`
- Roles: `encargado` added as valid role value alongside `admin`, `manager`, `employee`
- `anviz_id` column on `employees` links records imported from CSV to the employee UUID
