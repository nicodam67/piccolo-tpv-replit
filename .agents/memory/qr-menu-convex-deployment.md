---
name: QR Menú Convex deployment mismatch
description: Root cause of "Server Error" on menuItems queries in browser; fix and prevention.
---

# Convex deployment URL mismatch in QR Menú

## The rule
**Always verify `VITE_CONVEX_URL` shell env matches the deployment targeted by `CONVEX_DEPLOY_KEY`.**

**Why:** Vite's `isDemoMode` check in `vite.config.ts` uses `process.env.VITE_CONVEX_URL` (shell env, NOT `.env.local`). If the shell env pointed to an old deployment while `CONVEX_DEPLOY_KEY` pointed to a new one, all code was deployed to the new deployment but the browser connected to the old one. Old deployment had the original `listAvailableItems` with `resolveItemImages` + `ctx.storage.getUrl()` which threw "Server Error" consistently in the browser WebSocket context.

**How to apply:** After any `convex deploy`, run `printenv VITE_CONVEX_URL` and compare with the URL in `CONVEX_DEPLOY_KEY`. They must match. The fix was to set `VITE_CONVEX_URL=https://basic-rook-96.eu-west-1.convex.cloud` via `setEnvVars({ environment: "shared", values: { VITE_CONVEX_URL: "..." } })`.

## Key facts
- Active deployment: `https://basic-rook-96.eu-west-1.convex.cloud`
- CONVEX_DEPLOY_KEY points to `basic-rook-96`
- Old stale shell env pointed to `kindhearted-viper-426.convex.cloud` (different deployment)
- `.env.local` values are injected into `import.meta.env.*` by Vite but do NOT set `process.env.*` at config time

## What changed in menu.ts
- `listAvailableItems` simplified: no `resolveItemImages`, accepts `v.optional(v.string())` (not `v.id()`), full table scan
- `getItemsByCategoryId` added: takes `catId: v.string()`, used by CategoriaPage via `useQuery`
- CategoriaPage uses `useQuery(api.menu.getItemsByCategoryId, { catId })` where `catId = categoryId ?? ""`
