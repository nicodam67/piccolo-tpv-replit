---
name: Stock module additions
description: Key decisions from the stock/recipe costing module build (migration 0004, new tables, runtime fixes).
---

## Migration
Run `psql $DATABASE_URL -f lib/db/migrations/0004_stock_module.sql` after schema changes. Always rebuild `lib/db` afterwards (`tsc --build lib/db`).

## ApiError export
`ApiError` lives in `lib/api-client-react/src/custom-fetch.ts` but was not re-exported from `index.ts`. It is now exported. If it disappears again, add `ApiError` to the named exports in `lib/api-client-react/src/index.ts`.

**Why:** driver-view.tsx imports it; missing export crashed the entire Vite dev overlay.

## fetch queryFn pattern — must throw on non-ok
Admin pages that use `useQuery` with `fetch().then(r => r.json())` will crash if the server returns a 401/4xx, because `.json()` resolves to `{error:"..."}` — an object, not an array — and the default value (`data = []`) only applies when data is `undefined`.

**Fix:** always throw on non-ok:
```ts
fetch(url, { credentials: 'include' })
  .then(async r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
```
This ensures react-query treats it as an error and the default `[]` is used.

## Demo seed
`artifacts/api-server/src/lib/seed-stock-demo.ts` seeds ingredient categories, storage locations, ingredients, and two subrecipes. It is idempotent (skips if any ingredients already exist). Called from `index.ts` startup.

## Orders stock deduction
Stock is now deducted at **send** time (`POST /orders/:orderId/send`), not at item-add time. Items deleted after send trigger a `sale_reversal` stock restore movement. Tests in `orders.test.ts` that assert stock deduction at add time need updating.
