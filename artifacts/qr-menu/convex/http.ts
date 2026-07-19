/**
 * Convex HTTP router.
 *
 * @convex-dev/auth needs its own HTTP routes for token exchange and
 * session refresh.  auth.addHttpRoutes() registers them here.
 */
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Register @convex-dev/auth endpoints (token, refresh, sign-out, etc.)
auth.addHttpRoutes(http);

export default http;
