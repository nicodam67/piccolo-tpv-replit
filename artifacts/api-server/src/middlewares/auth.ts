import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedUser {
  id: string;
  name: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  try {
    const secret = process.env["SESSION_SECRET"];
    if (!secret) throw new Error("SESSION_SECRET not configured");
    req.user = jwt.verify(token, secret) as AuthenticatedUser;
    next();
  } catch {
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
