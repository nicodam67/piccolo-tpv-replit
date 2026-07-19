/**
 * Auth configuration for the QR Menú backend.
 *
 * Exported verbatim from @convex-dev/auth/server so that Convex picks
 * up the correct JWKS/token settings automatically from the project
 * environment.  No OIDC provider is configured here — authentication
 * is handled entirely by convex/auth.ts (Password provider).
 */
import { authConfig } from "@convex-dev/auth/server";
export default authConfig;
