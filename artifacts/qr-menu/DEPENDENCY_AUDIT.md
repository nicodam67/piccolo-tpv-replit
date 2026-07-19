# Piccolo QR — Dependency Audit (Task #275)

Audit of all Hércules-related dependencies removed or replaced during
the migration to standalone Convex infrastructure.

---

## 1. npm packages removed

All packages below were removed from `package.json` in Task #273
(custom auth) and are confirmed absent in the current codebase:

| Package | Previous version | Replacement |
|---------|-----------------|-------------|
| `@usehercules/auth` | ^1.0.42 | `@convex-dev/auth` ^0.0.83 |
| `@usehercules/vite` | ^1.0.41 | _(removed — Vite plugin not needed)_ |
| `oidc-client-ts` | ^3.1.0 | _(removed — OIDC auth replaced)_ |
| `react-oidc-context` | ^3.3.0 | _(removed — OIDC auth replaced)_ |

---

## 2. Code files changed

### Task #273 (custom auth) — already done

| File | What changed |
|------|-------------|
| `convex/auth.ts` | New file: `@convex-dev/auth` Password provider, ADMIN_EMAIL gate |
| `convex/auth.config.ts` | Replaced Hércules OIDC config with `@convex-dev/auth` config |
| `convex/http.ts` | New file: `auth.addHttpRoutes(http)` |
| `convex/adminAuth.ts` | New file: seedAdminIfEmpty, changePassword, getMe |
| `convex/schema.ts` | Old OIDC `users` table → `...authTables` from `@convex-dev/auth` |
| `convex/users.ts` | Simplified: `getCurrentUser` via `getAuthUserId` |
| `src/components/providers/convex.tsx` | `HerculesConvexProvider` → `ConvexAuthProvider` |
| `src/components/providers/auth.tsx` | Removed `@usehercules/auth` usage |
| `src/components/ui/signin.tsx` | New: `AdminLoginForm`, `SignOutButton` |
| `src/hooks/use-auth.ts` | Re-exports `useConvexAuth` + `useAuthActions` |
| `src/lib/demo-hercules-convex.tsx` | **Deleted** |
| `src/pages/auth/Callback.tsx` | **Deleted** (OIDC callback no longer needed) |
| `src/App.tsx` | Removed `/auth/callback` route |
| `vite.config.ts` | Removed `hercules()` Vite plugin |

### Task #275 (this task) — done now

| File | What changed |
|------|-------------|
| `convex/translate.ts` | `baseURL` → standard OpenAI API; `HERCULES_API_KEY` → `OPENAI_API_KEY`; model `openai/gpt-5-mini` → `gpt-4o-mini` |
| `index.html` | Favicon: `hercules-cdn.com/…` → `/favicon-piccolo.png` (local) |
| `index.html` | `og:url`, `og:image`, `twitter:image`, JSON-LD URLs: `onhercules.app` → `piccolo-qr-menu.replit.app` |
| `index.html` | Font-face `@font-face` blocks: `hercules-cdn.com/…` → `/fonts/*.ttf` (local) |
| `src/index.css` | 5 `@font-face` `src:` URLs → `/fonts/*.ttf` (local) |
| `src/lib/theme.ts` | `CUSTOM_FONT_URLS` map → local `/fonts/*.ttf` paths |
| `src/pages/admin/_components/FontManager.tsx` | `cdnUrl` fields → local `/fonts/*.ttf` paths |
| `src/pages/print/page.tsx` | `CUSTOM_FONT_URLS` map → local `/fonts/*.ttf` paths |
| `src/i18n.ts` | Catalan flag `flagUrl` → `/flag-ca.svg` (local) |
| `convex/schema.ts` | Removed "Hercules" from code comments |
| `src/hooks/use-auth.ts` | Removed "Hercules" from code comment |
| `convex/shared.ts` | **New**: public `getMenuSnapshot` + `getCategoryWithItems` queries |

---

## 3. Environment variables no longer needed

| Variable | Previous purpose | Status |
|----------|-----------------|--------|
| `VITE_HERCULES_OIDC_AUTHORITY` | Hércules OIDC issuer URL | ✅ Removed — auth is now `@convex-dev/auth` |
| `VITE_HERCULES_OIDC_CLIENT_ID` | Hércules OIDC client ID | ✅ Removed |
| `VITE_HERCULES_WEBSITE_ID` | Hércules website tracking ID | ✅ Removed |
| `HERCULES_API_KEY` | Hércules AI gateway API key | ✅ Removed — replaced by `OPENAI_API_KEY` |

---

## 4. New environment variables required

| Variable | Where to set | Purpose |
|----------|-------------|---------|
| `CONVEX_URL` | Vite / Replit env | URL of the new Convex project |
| `CONVEX_DEPLOY_KEY` | Replit secret | Deploy key for `npx convex deploy` |
| `ADMIN_EMAIL` | Convex dashboard env vars | Initial admin email |
| `ADMIN_PASSWORD` | Convex dashboard env vars | Initial admin password |
| `OPENAI_API_KEY` | Convex dashboard env vars | OpenAI key for auto-translation |

---

## 5. Asset files added

All files added to `public/` and `public/fonts/` — served by Vite, no external CDN:

| File | Origin | Purpose |
|------|--------|---------|
| `public/favicon-piccolo.png` | `hercules-cdn.com/file_5w7HKFxu1TK8XeIKb0GGcdpM` | Browser tab favicon |
| `public/flag-ca.svg` | `hercules-cdn.com/file_nx3rs7YcQUBsmDNpEzcqfLds` | Catalan locale flag |
| `public/fonts/ZapfChanMd.ttf` | `hercules-cdn.com/file_m7I6BY3ReSetMGf7AFZss0PC` | Menu body font |
| `public/fonts/ZapfChanDm.ttf` | `hercules-cdn.com/file_wcGGxdhmcY2DhGJwliFkA2Zk` | Menu serif font |
| `public/fonts/AvantGardeBk.ttf` | `hercules-cdn.com/file_uqU2VMlywYy4NMAsQ7WtxSwQ` | UI sans-serif font |
| `public/fonts/AmericanTextBT.ttf` | `hercules-cdn.com/file_gbeYYgRhfigXSrnw8dJ0hCA3` | Script/decorative font |
| `public/fonts/Algerian.ttf` | `hercules-cdn.com/file_XRcUszIICfe5N0l0B0EiHqeN` | Display font |
| `public/fonts/Algerian__custom.ttf` | `hercules-cdn.com/file_Up90gFAtg9wEAXyeMzwFEHgS` | Admin font picker variant |
| `public/fonts/AvantGardeBk__custom.ttf` | `hercules-cdn.com/file_89mHnxjgA9M4oKd6cCL5tH3G` | Admin font picker variant |
| `public/fonts/AmericanTextBT__custom.ttf` | `hercules-cdn.com/file_ZvU6mje17p5pww4n7ZuLTmNH` | Admin font picker variant |
| `public/fonts/ZapfChanDm__custom.ttf` | `hercules-cdn.com/file_H5zrJAiF1ZRToxIbF6PxUlIC` | Admin font picker variant |
| `public/fonts/ZapfChanMd__custom.ttf` | `hercules-cdn.com/file_46LrUGLTssadG0rlxFlWL1tR` | Admin font picker variant |

---

## 6. What remains pending

| Item | Why pending | Next action |
|------|-------------|-------------|
| `og:url` / `og:image` / JSON-LD URLs | Deployment URL not yet known | Update `index.html` with real production URL after first deploy |
| `OPENAI_API_KEY` | Must be set in Convex dashboard | Set under Settings → Environment Variables before using auto-translate |
| Full import pipeline | Needs `CONVEX_URL` + `CONVEX_IMPORT_SECRET` | Follow `scripts/README.md` once Convex project is deployed |
| Video asset import | Out of scope (Task #276) | Run `import-images.ts` once video import is added |

---

## 7. Remaining Hércules references

After this task, **zero** active Hércules references remain in production code or configuration:

```
grep -rn --include="*.ts" --include="*.tsx" --include="*.html" \
  --include="*.css" --include="*.json" \
  -i "hercules\|usehercules\|onhercules" \
  artifacts/qr-menu/src artifacts/qr-menu/convex artifacts/qr-menu/index.html \
  artifacts/qr-menu/package.json
  → (no results)
```

References that remain are only in:
- `MIGRATION_LOG.md` — historical record (intentional)
- `DEPENDENCY_AUDIT.md` — this document (intentional)
- Import script comments referencing the "original backup system"
