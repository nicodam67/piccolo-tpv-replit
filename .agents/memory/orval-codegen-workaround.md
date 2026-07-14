---
name: Orval codegen broken workaround
description: orval v8.21 CLI fails to load config in this Node/pnpm environment; manual edit + dist rebuild is the correct flow.
---

## Rule
Never try to run `pnpm run codegen` or `orval --config`. Both fail with "Failed to resolve input" and **clean (delete) the generated directories** before erroring — leaving the project broken.

## Correct flow when API schema changes
1. Edit `lib/api-spec/openapi.yaml`
2. Manually update `lib/api-client-react/src/generated/api.schemas.ts` (add/update types)
3. Manually update or append to `lib/api-client-react/src/generated/api.ts` (add hooks following the existing pattern)
4. Run `tsc --build lib/api-client-react` to emit updated dist/ declarations
5. If lib/db schema also changed, run `tsc --build lib/db` first
6. Update the staleness stamp: `pnpm --filter @workspace/api-spec run codegen:stamp`
7. Commit `lib/api-spec/.codegen-stamp` alongside the generated files

**Why:** orval's config loader can't execute `.ts` or `.js` configs in Node 24 + pnpm workspace. The root cause is unresolved. Rebuilding dist is mandatory because the frontend and api-server both reference lib packages via TypeScript project references which read from dist/.

## Staleness check
A `check-codegen` validation step (`scripts/check-codegen.sh`) compares the SHA-256 of `openapi.yaml` against `lib/api-spec/.codegen-stamp`. It fails with a clear message if the spec has changed without a corresponding stamp update. Run it with the registered `check-codegen` validation command.

**How to apply:** Any time "add a new endpoint" or "add a new schema field" is requested.
