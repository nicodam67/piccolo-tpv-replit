---
name: Convex auth.config.ts for @convex-dev/auth@0.0.83
description: The correct auth.config.ts format for @convex-dev/auth v0.0.x — authConfig export was added in a later version.
---

## Rule

`@convex-dev/auth@0.0.83` does **not** export `authConfig` from `"@convex-dev/auth/server"`.
Attempting to import it causes a deploy-time bundle error: "No matching export … for import 'authConfig'".

**Correct auth.config.ts for v0.0.83:**

```ts
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
```

`CONVEX_SITE_URL` is injected automatically by the Convex runtime (equals the `.convex.site` HTTP-actions URL).
`applicationID: "convex"` tells the Convex auth system that tokens are self-issued.

**Why:** The `authConfig` named export was added after 0.0.83. In 0.0.x the JWKS provider descriptor is provided manually. Newer versions may differ — always check exported symbols before importing.

**How to apply:** Any time `@convex-dev/auth` is used in a project, check the installed version before writing `auth.config.ts`. If v0.0.x, use the manual descriptor above.
