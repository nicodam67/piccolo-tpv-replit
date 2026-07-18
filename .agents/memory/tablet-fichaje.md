---
name: Tablet Fichaje kiosk
description: Architecture and key decisions for the /fichaje/tablet standalone PWA clock-in kiosk
---

# Tablet Fichaje — Kiosk Module

## Route separation
- `/fichaje/tablet` is a public route (no RequireRole) — standalone kiosk, no TPV nav
- Admin UI at `/admin/fichaje/dispositivos` (manager+ only)
- Mobile clock at `/fichaje` unchanged, still gated by `mobileClockEnabled`

## API separation
- `POST /api/tablet/clock` bypasses `mobileClockEnabled` — validates device token instead
- `POST /api/fichaje/public/clock` still requires `mobileClockEnabled` (mobile screen unchanged)
- New router: `artifacts/api-server/src/routes/tablet.ts`

**Why:** Tablet is a fixed trusted device; the mobileClockEnabled gate was for untrusted personal phones.

## Device token flow
- Token stored in `localStorage` key `piccolo_tablet_token` (64-char hex)
- On first load: registration modal → `POST /api/tablet/register` → save token
- On subsequent loads: `GET /api/tablet/device/:token` validates; revoked → show error + re-register option
- Ping on each load: `POST /api/tablet/device/:token/ping` (updates lastSeenAt, appVersion)

## PIN lockout (in-memory)
- Max 3 attempts, 5-minute lockout per employeeId
- State held in Map in `tablet.ts` process — resets on server restart (acceptable for now)
- All failures logged to `fichaje_audit` with deviceName

## DB
- `tablet_devices` table added via migration `0021_tablet_devices.sql`
- Schema in `lib/db/src/schema/fichaje.ts` (exported via `export * from "./schema"`)

## Screen state machine
home → pin → status → confirmation → (auto reset to home after 5 s)
Inactivity reset: 20 s of no touch/click/key → back to home (`useInactivityReset`)

## PWA
- `manifest.json` at `artifacts/piccolo-tpv/public/manifest.json`
- `<link rel="manifest">` added to `index.html`
- start_url: `/fichaje/tablet`, display: `standalone`, theme_color: `#0f766e`

## How to apply
When building NFC task (#263): endpoint `POST /api/tablet/clock` already accepts `source` field via `timeRecordsTable.source` column — extend it, do not create a separate clock endpoint.
