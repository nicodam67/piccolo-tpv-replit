---
name: Production infrastructure
description: Versioning, health panel, changelog, and production report added in v1.2.0
---

## What was built
- `VERSION` — semver at repo root (1.2.0)
- `CHANGELOG.md` — history from all 18 migrations + features by version
- `GET /admin/system/version` — version, changelog, migrationsApplied, uptime, nodeVersion (system-info.ts)
- `/admin/salud` — traffic-light health dashboard (admin-salud.tsx): DB, storage, printers, print queue, backups, offline queue, alerts, version changelog, events log, export JSON
- `replit.md` — fully documented: stack, repo map, modules, DB schema, API, arch decisions, security, tests, gotchas
- `PRODUCTION_REPORT.md` — 15-section report: 21 modules inventory, BD (162 tables, 18 migrations), security audit, performance, tests, maintenance schedule, versioning, 6 risks, 12 recommendations

## Existing monitoring (DO NOT rebuild)
- `GET /diagnostics/status` — DB, storage, printers, backups, offline_queue, alerts
- `GET /diagnostics/connectivity` — latency, uptime, node version
- `GET /diagnostics/events` — paginated tech events log
- `techEventsTable` — incidents log

## Known risks (documented)
- R1 HIGH: `xlsx` 0.18.5 has active CVEs — replace with exceljs
- R2 HIGH: no down-migrations — add rollback SQL before real production deploy

**Why:** Avoid rebuilding monitoring; always check diagnostics.ts before creating new health endpoints.
