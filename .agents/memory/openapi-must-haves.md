---
name: OpenAPI spec must-haves for Zone and UpdateZoneInput
description: Fields that must be in the spec or codegen omits them causing TS errors
---

## Zone schema
Must include `color` (string, nullable) and `active` (boolean).
Without them, any frontend code referencing zone.color causes TS error TS2339.

## UpdateZoneInput schema
Must include `color` (string, nullable) and `active` (boolean).
Without them, passing { color } to updateZone.mutate causes TS error TS2353.

**Why:** The backend PATCH /zones/:zoneId already accepts color and active, 
but unless they appear in the OpenAPI spec, Orval omits them from the generated type,
making the TS compiler reject existing working calls.

**How to apply:** Any time a new field is added to a backend route, add it to BOTH the
response schema (Zone/Table/etc.) AND the input schema (UpdateZoneInput/UpdateTableInput/etc.)
in lib/api-spec/openapi.yaml, then run `pnpm --filter @workspace/api-spec run codegen`.
