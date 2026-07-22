import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function configuredQrMenuApiToken(): string | null {
  const token = process.env["PICCOLO_QR_MENU_API_TOKEN"] ?? "";
  return token.length >= 32 ? token : null;
}

export function qrMenuBearerToken(req: Request): string {
  const authorization = req.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export function qrMenuTokenMatches(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function requireQrMenuApiToken(req: Request, res: Response, next: NextFunction): void {
  const expected = configuredQrMenuApiToken();
  if (!expected) {
    res.status(503).json({ error: "Integracion QR Menu deshabilitada" });
    return;
  }
  const actual = qrMenuBearerToken(req);
  if (!actual || !qrMenuTokenMatches(actual, expected)) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }
  next();
}
