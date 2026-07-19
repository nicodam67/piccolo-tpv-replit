/**
 * Auth configuration for the QR Menú Convex deployment.
 *
 * @convex-dev/auth@0.0.83 does NOT export `authConfig` — that was added in
 * a later version.  In 0.0.83 the auth.config.ts file must export the
 * Convex-native JWKS provider descriptor directly.
 *
 * CONVEX_SITE_URL is injected automatically by the Convex runtime and equals
 * the deployment's HTTP-actions URL (e.g. https://basic-rook-96.eu-west-1.convex.site).
 * applicationID "convex" tells the runtime that tokens are self-issued.
 */
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
