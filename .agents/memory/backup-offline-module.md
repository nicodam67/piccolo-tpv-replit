---
name: Backup & Offline Module
description: Architecture decisions for backup system, offline queue, and service worker in Piccolo TPV
---

# Backup & Offline Module

## Backup implementation
- No pg_dump — uses JSON table export (all rows via `db.execute(sql.raw(...))`) encrypted with AES-256-CBC keyed from SESSION_SECRET
- Key derivation: `crypto.scryptSync(secret, "piccolo-backup-salt-v1", 32)` — salt is hardcoded, never change without a migration plan
- Payload stored in `backup_records.encrypted_payload` (base64) + `encryption_iv` (hex); integrity verified via SHA-256 of ciphertext
- Also written to `/tmp/piccolo-backups/` — this dir is ephemeral; production needs an external destination (task #198)

## DB tables (migration 0011)
- `backup_records` — created directly via SQL (was not in any prior migration)
- `backup_audit_log`, `backup_schedules`, `backup_destinations`, `offline_devices`, `offline_queue`, `tech_events`
- All live in `lib/db/src/schema/backups.ts` and `backup-offline.ts`

## Offline queue
- IndexedDB wrapper: `artifacts/piccolo-tpv/src/lib/offline-db.ts`
- Idempotency key: `deviceId.operationType.entityId.clientTimestamp`
- Sync endpoint: `POST /api/offline/sync` — handles batches of 10, returns per-op status
- Devices self-register via `POST /api/offline/devices` with a random fingerprint stored in localStorage

## Service worker
- File: `artifacts/piccolo-tpv/public/sw.js`
- Registered only in PROD (`import.meta.env.PROD`) to avoid Vite dev-server conflicts
- Cache scope uses `import.meta.env.BASE_URL` — must match the artifact's preview path prefix

## Backup worker
- `artifacts/api-server/src/lib/backup-worker.ts` — polls every 5 min
- Started in `artifacts/api-server/src/index.ts` alongside print-worker
- Alert checks: no verified backup in 24h → critical; printers down > 15min → warning; offline queue stuck > 2h → warning

**Why:** Real pg_dump binary is not guaranteed in the Replit NixOS container; JSON row export is portable and testable.
