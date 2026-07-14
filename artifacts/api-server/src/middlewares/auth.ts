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
