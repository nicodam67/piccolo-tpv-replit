import { AuthConfig } from "convex/server";

// ── Auth configuration ────────────────────────────────────────────────────────
//
// Phase 1 (this task): Hercules OIDC removed. Providers array is empty so
//   ctx.auth.getUserIdentity() returns null → admin mutations are locked.
//   The public QR menu (read-only queries) is unaffected.
//
// Phase 2 (Task #273): @convex-dev/auth Password provider will be wired here
//   to enable email + password login for the admin panel.
//
export default {
  providers: [],
} satisfies AuthConfig;
