import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { revokedTokensTable, rolePermissionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
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

export class SessionAuthError extends Error {
  constructor(
    public readonly unavailable = false,
    public readonly reason: "invalid" | "revoked" = "invalid",
  ) {
    super(unavailable ? "session_verification_unavailable" : reason);
  }
}

export async function authenticateSessionToken(token: string): Promise<AuthenticatedUser> {
  let decoded: AuthenticatedUser;
  try {
    const secret = process.env["SESSION_SECRET"];
    if (!secret) throw new Error("SESSION_SECRET not configured");
    decoded = jwt.verify(token, secret) as AuthenticatedUser;
  } catch {
    throw new SessionAuthError(false);
  }

  if (decoded.jti) {
    try {
      const [revoked] = await db
        .select({ jti: revokedTokensTable.jti })
        .from(revokedTokensTable)
        .where(eq(revokedTokensTable.jti, decoded.jti))
        .limit(1);
      if (revoked) throw new SessionAuthError(false, "revoked");
    } catch (error) {
      if (error instanceof SessionAuthError) throw error;
      throw new SessionAuthError(true);
    }
  }

  return decoded;
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
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const cookieToken = typeof req.cookies?.piccolo_session === "string"
    ? req.cookies.piccolo_session
    : "";
  const token = bearerToken || cookieToken;

  if (!token) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  try {
    req.user = await authenticateSessionToken(token);
    next();
  } catch (error) {
    if (error instanceof SessionAuthError && error.unavailable) {
      res.status(503).json({ error: "Servicio temporalmente no disponible. Inténtalo de nuevo." });
      return;
    }
    if (error instanceof SessionAuthError && error.reason === "revoked") {
      res.status(401).json({ error: "Sesión cerrada. Por favor inicia sesión de nuevo." });
      return;
    }
    res.status(401).json({ error: "Sesión no válida" });
  }
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
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    const role = req.user?.role;
    if (!role) {
      res.status(403).json({ error: `Permiso requerido: ${permission}` });
      return;
    }

    const [module, action] = permission.split(".", 2);
    try {
      const [override] = await db
        .select({ allowed: rolePermissionsTable.allowed })
        .from(rolePermissionsTable)
        .where(and(
          eq(rolePermissionsTable.role, role),
          eq(rolePermissionsTable.module, module),
          eq(rolePermissionsTable.action, action),
        ))
        .limit(1);
      if (override ? !override.allowed : !hasPermission(role, permission)) {
        res.status(403).json({ error: `Permiso requerido: ${permission}` });
        return;
      }
      next();
    } catch {
      res.status(503).json({ error: "No se pudo verificar el permiso" });
    }
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
