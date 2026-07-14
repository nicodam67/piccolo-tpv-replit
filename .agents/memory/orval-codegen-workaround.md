---
name: Orval codegen broken workaround
description: orval v8.21 CLI fails to load config in this Node/pnpm environment; manual edit + dist rebuild is the correct flow.
---

## Rule
Never try to run `pnpm run codegen` or `orval --config`. Both fail silently or with "Failed to resolve input" in this environment.

## Correct flow when API schema changes
1. Edit `lib/api-spec/openapi.yaml`
2. Manually update `lib/api-client-react/src/generated/api.schemas.ts` (add/update types)
3. Manually update or append to `lib/api-client-react/src/generated/api.ts` (add hooks following the existing pattern)
4. Run `tsc --build lib/api-client-react` to emit updated dist/ declarations
5. If lib/db schema also changed, run `tsc --build lib/db` first

**Why:** orval's config loader can't execute `.ts` or `.js` configs in Node 24 + pnpm workspace. The root cause is unresolved. Rebuilding dist is mandatory because the frontend and api-server both reference lib packages via TypeScript project references which read from dist/.

**How to apply:** Any time "add a new endpoint" or "add a new schema field" is requested.
