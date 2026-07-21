import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID, timingSafeEqual } from "crypto";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import {
  employeesTable, employeePinsTable, revokedTokensTable, auditLogTable,
} from "@workspace/db";
import { eq, and, count, lt, sql } from "drizzle-orm";
import { AuthWithPinBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
const DUMMY_PIN_HASH = bcrypt.hashSync(randomUUID(), 10);

function safeSecretEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

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

const bootstrapLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Bootstrap no autorizado" },
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
  const pinOk = await bcrypt.compare(pin, employee?.pinHash ?? DUMMY_PIN_HASH);
  if (!employee || !pinOk) {
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

// ── One-time bootstrap ────────────────────────────────────────────────────────
router.post("/setup/seed-employees", bootstrapLimiter, async (req, res): Promise<void> => {
  const configuredSecret = process.env["BOOTSTRAP_SECRET"] ?? "";
  const { bootstrapSecret, name, pin } = req.body as {
    bootstrapSecret?: string;
    name?: string;
    pin?: string;
  };

  if (
    configuredSecret.length < 32 ||
    !bootstrapSecret ||
    !safeSecretEqual(bootstrapSecret, configuredSecret)
  ) {
    res.status(401).json({ error: "Bootstrap no autorizado" });
    return;
  }

  const adminName = name?.trim() ?? "";
  if (adminName.length < 2 || adminName.length > 100 || !/^\d{4,12}$/.test(pin ?? "")) {
    res.status(400).json({ error: "Datos de bootstrap no válidos" });
    return;
  }

  try {
    const admin = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(26001)`);
      const [{ value: existing }] = await tx
        .select({ value: count() })
        .from(employeesTable);

      if (Number(existing) > 0) {
        throw new Error("BOOTSTRAP_CLOSED");
      }

      const [created] = await tx
        .insert(employeesTable)
        .values({ name: adminName, role: "admin", active: true })
        .returning();

      await tx.insert(employeePinsTable).values({
        employeeId: created.id,
        pinHash: await bcrypt.hash(pin!, 12),
      });
      await tx.insert(auditLogTable).values({
        employeeId: created.id,
        employeeName: created.name,
        action: "bootstrap_admin_created",
        details: "Primer administrador creado mediante bootstrap de un solo uso",
      });
      return created;
    });

    res.status(201).json({ created: true, admin: { id: admin.id, name: admin.name } });
  } catch (error) {
    if (error instanceof Error && error.message === "BOOTSTRAP_CLOSED") {
      res.status(409).json({ error: "Bootstrap cerrado" });
      return;
    }
    res.status(503).json({ error: "Bootstrap no disponible" });
  }
});

export default router;
