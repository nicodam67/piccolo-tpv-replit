import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { revokedTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hasPermission } from "../lib/permissions";

export interface AuthenticatedUser {
  id: string;
  name: string;
  role: string;
  /** JWT ID — used for session invalidation (revoked_tokens table). */
  jti?: string;
  /** JWT issued-at (seconds since epoch) — present after jwt.verify */
  iat?: number;
  /** JWT expiry (seconds since epoch) — present after jwt.verify */
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  let decoded: AuthenticatedUser;
  try {
    const secret = process.env["SESSION_SECRET"];
    if (!secret) throw new Error("SESSION_SECRET not configured");
    decoded = jwt.verify(token, secret) as AuthenticatedUser;
  } catch {
    res.status(401).json({ error: "Sesión no válida" });
    return;
  }

  // ── Revocation check (fail-closed) ──────────────────────────────────────────
  // If the token carries a jti claim, verify it has not been revoked on logout.
  // We fail CLOSED: if the revocation table cannot be reached, we reject the
  // request with 503 rather than silently accepting a potentially revoked token.
  if (decoded.jti) {
    try {
      const [revoked] = await db
        .select({ jti: revokedTokensTable.jti })
        .from(revokedTokensTable)
        .where(eq(revokedTokensTable.jti, decoded.jti))
        .limit(1);

      if (revoked) {
        res.status(401).json({ error: "Sesión cerrada. Por favor inicia sesión de nuevo." });
        return;
      }
    } catch {
      // Any DB error during revocation check — fail CLOSED (503).
      // This includes the case where the revoked_tokens table is missing (42P01):
      // if revocation state cannot be verified for any reason, the request is
      // denied rather than silently accepted. The table is guaranteed at startup
      // by ensureAuthTables(); if it fails there, the process exits.
      res.status(503).json({ error: "Servicio temporalmente no disponible. Inténtalo de nuevo." });
      return;
    }
  }

  req.user = decoded;
  next();
}

/**
 * Middleware factory that enforces role-based access control.
 * Must be used after requireAuth so that req.user is already populated.
 *
 * @param allowedRoles - one or more role strings permitted to access the route
 */
export function requireRole(...allowedRoles: string[]) {
  return function (req: Request, res: Response, next: NextFunction): void {
    const role = req.user?.role;
    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({ error: "No tienes permisos para realizar esta acción" });
      return;
    }
    next();
  };
}

/**
 * Middleware factory that enforces permission-based access control.
 * Must be used after requireAuth so that req.user is already populated.
 *
 * @param permission - a permission string in the format "module.action"
 */
export function requirePermission(permission: string) {
  return function (req: Request, res: Response, next: NextFunction): void {
    const role = req.user?.role;
    if (!hasPermission(role, permission)) {
      res.status(403).json({ error: `Permiso requerido: ${permission}` });
      return;
    }
    next();
  };
}

/**
 * Verifies a short-lived manager-authorization token embedded in the request.
 * Checks `req.body.managerToken` and `X-Manager-Token` header.
 *
 * Returns the decoded payload on success or `null` on failure/absence.
 */
export function verifyManagerToken(req: Request, operation: string): { managerId: string; managerRole: string; authorizedBy: string } | null {
  const token = (req.body?.managerToken ?? req.headers?.['x-manager-token']) as string | undefined;
  if (!token) return null;
  try {
    const secret = process.env["SESSION_SECRET"];
    if (!secret) return null;
    const decoded = jwt.verify(token, secret) as Record<string, unknown>;
    if (decoded["type"] !== "manager_auth") return null;
    if (operation && decoded["operation"] !== operation) return null;
    return {
      managerId: decoded["managerId"] as string,
      managerRole: decoded["managerRole"] as string,
      authorizedBy: decoded["authorizedBy"] as string,
    };
  } catch {
    return null;
  }
}
