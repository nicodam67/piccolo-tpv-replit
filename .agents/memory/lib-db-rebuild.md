---
name: lib/db dist rebuild
description: After any schema change in lib/db/src/, rebuild the dist declarations or api-server tsc won't see the new columns.
---

## Rule
After editing any file in `lib/db/src/schema/`, run:
```bash
tsc --build lib/db
```

Then, if `lib/api-client-react` also changed, run:
```bash
tsc --build lib/api-client-react
```

**Why:** Both lib/db and lib/api-client-react use `composite: true` TypeScript project references. Downstream packages (api-server, piccolo-tpv) read from `dist/` declarations, not source. Without rebuilding, new columns and tables are invisible to tsc and cause TS2769 "no overload matches" errors.

**How to apply:** Any time schema files change, before running typecheck on api-server or frontend.
