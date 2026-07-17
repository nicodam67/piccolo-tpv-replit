import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import {
  employeesTable, employeePinsTable, revokedTokensTable, auditLogTable,
} from "@workspace/db";
import { eq, and, count, lt } from "drizzle-orm";
import { AuthWithPinBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// ── Rate limiters ─────────────────────────────────────────────────────────────

// Max 10 PIN attempts per IP per 15 minutes
const pinLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Inténtelo de nuevo más tarde." },
});

// Max 30 requests/minute for employee list (prevents enumeration)
const loginListLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones. Inténtelo de nuevo en un momento." },
});

// Manager-authorize rate limiter — 5 attempts per IP per 15 minutes.
// Combined with a per-target limiter (keyed on managerId from request body) to
// prevent targeted brute-force on a specific manager's PIN.
const managerAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de autorización. Inténtelo más tarde." },
});

// Per-target limiter — 3 attempts per managerId per 15 minutes.
// Uses managerId from the body so each manager account gets its own lockout window.
const managerTargetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const managerId = (req.body?.managerId as string | undefined) ?? "unknown";
    return `manager-target:${managerId}`;
  },
  message: { error: "Demasiados intentos para este encargado. Inténtelo más tarde." },
});

// ── Employee login list ───────────────────────────────────────────────────────
router.get("/employees/login-list", loginListLimiter, async (_req, res): Promise<void> => {
  // role intentionally omitted — leaking it lets attackers target admin accounts
  const employees = await db
    .select({ id: employeesTable.id, name: employeesTable.name })
    .from(employeesTable)
    .where(eq(employeesTable.active, true))
    .orderBy(employeesTable.name);

  res.json(employees);
});

// ── PIN login ─────────────────────────────────────────────────────────────────
router.post("/auth/pin", pinLoginLimiter, async (req, res): Promise<void> => {
  const parsed = AuthWithPinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Empleado y PIN son obligatorios" });
    return;
  }

  const { employeeId, pin } = parsed.data;

  const rows = await db
    .select({
      id: employeesTable.id,
      name: employeesTable.name,
      role: employeesTable.role,
      pinHash: employeePinsTable.pinHash,
    })
    .from(employeesTable)
    .innerJoin(employeePinsTable, eq(employeePinsTable.employeeId, employeesTable.id))
    .where(and(eq(employeesTable.id, employeeId), eq(employeesTable.active, true)));

  const employee = rows[0];
  if (!employee || !(await bcrypt.compare(pin, employee.pinHash))) {
    res.status(401).json({ error: "PIN incorrecto" });
    return;
  }

  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    res.status(500).json({ error: "Configuración de servidor incompleta" });
    return;
  }

  // Include jti (JWT ID) so this token can be individually revoked on logout
  const jti = randomUUID();
  const token = jwt.sign(
    { id: employee.id, name: employee.name, role: employee.role, jti },
    secret,
    { expiresIn: "12h" }
  );

  res.json({
    token,
    employee: { id: employee.id, name: employee.name, role: employee.role },
  });
});

// ── Session info ──────────────────────────────────────────────────────────────
router.get("/auth/me", requireAuth, (req, res): void => {
  const user = req.user!;
  const expiresAt = user.exp ? new Date(user.exp * 1000).toISOString() : null;
  res.json({ id: user.id, name: user.name, role: user.role, expiresAt });
});

// ── Logout ────────────────────────────────────────────────────────────────────
// Inserts the token's jti into revoked_tokens so requireAuth will reject it.
// AUTHORITATIVE: if the revocation INSERT fails, we return 503 so the client
// knows the token was NOT invalidated server-side and can retry.  Client-side
// localStorage should only be cleared after receiving a 200 from this endpoint.
router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;

  // Tokens without jti cannot be individually revoked — treat as logged out.
  if (!user.jti || !user.exp) {
    res.json({ ok: true });
    return;
  }

  const expiresAt = new Date(user.exp * 1000);
  try {
    await db
      .insert(revokedTokensTable)
      .values({ jti: user.jti, expiresAt })
      .onConflictDoNothing();
  } catch {
    // Revocation write failed — server-side invalidation did NOT happen.
    // Return 503 so the client can retry; do NOT claim a successful logout.
    res.status(503).json({ error: "No se pudo cerrar la sesión. Inténtalo de nuevo." });
    return;
  }

  // Prune expired tokens asynchronously — purely housekeeping, failure is acceptable.
  db.delete(revokedTokensTable)
    .where(lt(revokedTokensTable.expiresAt, new Date()))
    .catch(() => {/* ignore cleanup errors */});

  res.json({ ok: true });
});

// ── Manager authorization ─────────────────────────────────────────────────────
// Validates a manager/admin PIN and returns a short-lived (60s) authorization
// token scoped to a specific operation. Logs to audit_log.
//
// Rate-limited on two axes:
//   - Per requester IP (managerAuthLimiter): 5 per 15 min
//   - Per target managerId (managerTargetLimiter): 3 per 15 min
// Error messages are intentionally normalized — the same generic text is returned
// regardless of whether the failure is "not a manager" or "wrong PIN" to prevent
// account-role oracle and PIN oracle attacks.
router.post(
  "/auth/manager-authorize",
  requireAuth,
  managerAuthLimiter,
  managerTargetLimiter,
  async (req, res): Promise<void> => {
  const { managerId, pin, operation } = req.body as {
    managerId?: string;
    pin?: string;
    operation?: string;
  };

  if (!managerId || !pin || !operation) {
    res.status(400).json({ error: "managerId, pin y operation son obligatorios" });
    return;
  }

  // Normalized error message — returned for BOTH "not a manager role" and "wrong PIN"
  // to prevent role oracle and PIN oracle timing/message attacks.
  const AUTH_DENIED = "Credenciales de encargado incorrectas";

  // Look up manager — include role in selection but do NOT reveal it in errors
  const rows = await db
    .select({
      id: employeesTable.id,
      name: employeesTable.name,
      role: employeesTable.role,
      pinHash: employeePinsTable.pinHash,
    })
    .from(employeesTable)
    .innerJoin(employeePinsTable, eq(employeePinsTable.employeeId, employeesTable.id))
    .where(
      and(
        eq(employeesTable.id, managerId),
        eq(employeesTable.active, true),
      )
    );

  const manager = rows[0];

  // Always run bcrypt to avoid timing oracle (constant-time regardless of role check)
  const dummyHash = "$2a$06$dummy.hash.for.constant.time.comparison.only";
  const pinOk = manager
    ? await bcrypt.compare(pin, manager.pinHash)
    : await bcrypt.compare(pin, dummyHash).then(() => false);

  if (!manager || !["admin", "manager", "encargado"].includes(manager.role) || !pinOk) {
    res.status(401).json({ error: AUTH_DENIED });
    return;
  }

  // Log to audit_log
  const requestingUser = req.user!;
  try {
    await db.insert(auditLogTable).values({
      employeeId: requestingUser.id,
      employeeName: `${requestingUser.name} (autorizado por ${manager.name})`,
      action: "manager_authorize",
      details: `Operación autorizada: ${operation}`,
    });
  } catch {/* non-critical */ }

  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    res.status(500).json({ error: "Configuración de servidor incompleta" });
    return;
  }

  // Short-lived token (60s), scoped to one operation
  const authToken = jwt.sign(
    {
      type: "manager_auth",
      managerId: manager.id,
      managerRole: manager.role,
      operation,
      authorizedBy: manager.name,
    },
    secret,
    { expiresIn: "60s" }
  );

  res.json({ authorized: true, token: authToken, managerName: manager.name });
});

// ── Bootstrap seed ────────────────────────────────────────────────────────────
router.post("/setup/seed-employees", async (_req, res): Promise<void> => {
  const [{ value: existing }] = await db.select({ value: count() }).from(employeesTable);
  if (Number(existing) > 0) {
    res.status(409).json({ error: "Ya existen empleados. Seed no aplicado." });
    return;
  }

  const [admin] = await db.insert(employeesTable).values({
    id: "5f78bf82-842d-4b42-b0e0-eb26c9687437",
    name: "Admin",
    role: "admin",
    active: true,
  }).returning();

  const [carmen] = await db.insert(employeesTable).values({
    id: "5ac8e169-90ed-4e6f-aa02-89d1cb4b19a2",
    name: "Carmen",
    role: "waiter",
    active: true,
  }).returning();

  await db.insert(employeePinsTable).values([
    { employeeId: admin.id,  pinHash: "$2a$06$wsZ.tTKkYlDQIDlJpo31BuRKhQYyTNu9c8b5x.74iu7LERWohilcG" },
    { employeeId: carmen.id, pinHash: "$2a$06$rD9WJftFkpppIo3nrkUQ4OSvAMX33Ao9628DR4OTuWQetpEbOKGju" },
  ]);

  res.json({ seeded: [admin.name, carmen.name] });
});

export default router;
