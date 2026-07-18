/**
 * Tablet Fichaje Routes — dedicated endpoints for the tablet kiosk at /fichaje/tablet.
 *
 * Trust model:
 *   - Tablet self-registration requires a short-lived admin-generated pairing code.
 *     Anonymous clients cannot enrol a device — revocation is therefore final.
 *   - Clock and PIN-verify calls authenticate via the device token issued at enrolment.
 *   - mobileClockEnabled is intentionally NOT checked here; the tablet is a fixed
 *     trusted device, not an employee's personal phone.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  employeesTable,
  employeePinsTable,
  timeRecordsTable,
  breaksTable,
  fichajeAuditTable,
  tabletDevicesTable,
} from "@workspace/db";
import { eq, and, isNull, gte } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { idempotency } from "../middlewares/idempotency";
import * as bcrypt from "bcryptjs";
import * as crypto from "node:crypto";
import { z } from "zod";

const router: IRouter = Router();

// ─── Pairing codes (in-memory, admin-generated, single-use) ──────────────────
interface PairingCode {
  code: string;
  expiresAt: Date;
  used: boolean;
  createdByAdminId: string;
}
const pairingCodes = new Map<string, PairingCode>();
const PAIRING_TTL_MS = 10 * 60 * 1000; // 10 minutes

function isValidPairingCode(code: string): { ok: boolean; error?: string } {
  const record = pairingCodes.get(code);
  if (!record) return { ok: false, error: "Código inválido o ya utilizado" };
  if (record.used) return { ok: false, error: "Este código ya fue utilizado" };
  if (record.expiresAt < new Date()) return { ok: false, error: "El código ha caducado. Genera uno nuevo desde administración" };
  return { ok: true };
}

// ─── PIN attempt tracking (in-memory, per employee) ──────────────────────────
interface AttemptState { count: number; lockedUntil?: Date; }
const pinAttempts = new Map<string, AttemptState>();
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

function checkPinLock(employeeId: string): { locked: boolean; retryAfterSeconds?: number } {
  const state = pinAttempts.get(employeeId);
  if (!state) return { locked: false };
  // Check if lockout has expired — if so, reset fully
  if (state.lockedUntil && state.lockedUntil <= new Date()) {
    pinAttempts.delete(employeeId);
    return { locked: false };
  }
  if (state.lockedUntil) {
    return { locked: true, retryAfterSeconds: Math.ceil((state.lockedUntil.getTime() - Date.now()) / 1000) };
  }
  return { locked: false };
}

function recordPinFailure(employeeId: string): number {
  const state = pinAttempts.get(employeeId) ?? { count: 0 };
  // Reset count if a previous lockout just expired
  if (state.lockedUntil && state.lockedUntil <= new Date()) {
    state.count = 0;
    state.lockedUntil = undefined;
  }
  state.count++;
  if (state.count >= MAX_ATTEMPTS) {
    state.lockedUntil = new Date(Date.now() + LOCKOUT_MS);
  }
  pinAttempts.set(employeeId, state);
  return Math.max(0, MAX_ATTEMPTS - state.count);
}

function resetPinAttempts(employeeId: string) {
  pinAttempts.delete(employeeId);
}

// ─── Helper: validate device token ───────────────────────────────────────────
async function getDevice(token: string) {
  const devices = await db
    .select()
    .from(tabletDevicesTable)
    .where(eq(tabletDevicesTable.deviceToken, token))
    .limit(1);
  return devices[0] ?? null;
}

// ─── Helper: log audit ───────────────────────────────────────────────────────
async function logAudit(
  action: string,
  employeeId: string | null,
  entityType: string,
  entityId: string,
  details?: object
) {
  await db.insert(fichajeAuditTable).values({
    action,
    employeeId: employeeId ?? undefined,
    performedBy: employeeId ?? undefined,
    entityType,
    entityId,
    details: details ?? null,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS — require auth
// ════════════════════════════════════════════════════════════════════════════

// POST /api/tablet/devices/pairing-code — generate a short-lived enrolment code
// Must be called by an authenticated admin/manager; code is used once by the tablet.
router.post(
  "/tablet/devices/pairing-code",
  requireAuth,
  requireRole("admin", "manager"),
  async (req, res): Promise<void> => {
    // 6-digit numeric code, collision-safe for small fleets
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
    pairingCodes.set(code, {
      code,
      expiresAt,
      used: false,
      createdByAdminId: req.user!.id,
    });
    res.json({ code, expiresAt, expiresInSeconds: PAIRING_TTL_MS / 1000 });
  }
);

// GET /api/tablet/devices — list all registered tablets
router.get(
  "/tablet/devices",
  requireAuth,
  requireRole("admin", "manager"),
  async (_req, res): Promise<void> => {
    const devices = await db.select().from(tabletDevicesTable);
    res.json(devices);
  }
);

// PATCH /api/tablet/devices/:id — rename or change status
router.patch(
  "/tablet/devices/:id",
  requireAuth,
  requireRole("admin", "manager"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const { name, location, status } = req.body as Record<string, string>;
    const updates: Record<string, unknown> = {};
    if (name) updates.name = name;
    if (location) updates.location = location;
    if (status && ["active", "revoked"].includes(status)) {
      updates.status = status;
      if (status === "revoked") updates.revokedAt = new Date();
      if (status === "active") updates.revokedAt = null;
    }
    const [updated] = await db
      .update(tabletDevicesTable)
      .set(updates)
      .where(eq(tabletDevicesTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Dispositivo no encontrado" }); return; }
    await logAudit("tablet_updated", null, "tablet_device", id, updates);
    res.json(updated);
  }
);

// DELETE /api/tablet/devices/:id — revoke device (does not delete row, just sets status)
router.delete(
  "/tablet/devices/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const [updated] = await db
      .update(tabletDevicesTable)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(eq(tabletDevicesTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Dispositivo no encontrado" }); return; }
    await logAudit("tablet_revoked", null, "tablet_device", id, { name: updated.name });
    res.json({ success: true });
  }
);

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC TABLET ENDPOINTS — no JWT auth; protected by pairing code / device token
// All routes below are in PUBLIC_ALLOWLIST in scripts/audit-routes.ts
// ════════════════════════════════════════════════════════════════════════════

// POST /api/tablet/register — register a new tablet device (requires admin pairing code)
router.post("/tablet/register", async (req, res): Promise<void> => {
  const { name, location, pairingCode } = req.body as {
    name: string;
    location?: string;
    pairingCode: string;
  };

  if (!name?.trim()) {
    res.status(400).json({ error: "Se requiere el nombre del dispositivo" });
    return;
  }

  if (!pairingCode) {
    res.status(400).json({ error: "Se requiere un código de emparejamiento. Pídelo al administrador desde Fichaje → Dispositivos." });
    return;
  }

  const codeCheck = isValidPairingCode(pairingCode);
  if (!codeCheck.ok) {
    res.status(403).json({ error: codeCheck.error });
    return;
  }

  // Mark code as consumed (single-use)
  const codeRecord = pairingCodes.get(pairingCode)!;
  codeRecord.used = true;

  const deviceToken = crypto.randomBytes(32).toString("hex");

  const [device] = await db
    .insert(tabletDevicesTable)
    .values({
      name: name.trim(),
      location: location?.trim() ?? "Piccolo La Ràpita",
      deviceToken,
      status: "active",
    })
    .returning();

  await logAudit("tablet_registered", null, "tablet_device", device.id, {
    name,
    location,
    registeredBy: codeRecord.createdByAdminId,
  });

  res.status(201).json({ deviceToken, deviceId: device.id });
});

// GET /api/tablet/device/:token — validate device and get its status
router.get("/tablet/device/:token", async (req, res): Promise<void> => {
  const token = req.params.token as string;
  const device = await getDevice(token);
  if (!device) {
    res.status(404).json({ error: "Dispositivo no encontrado" });
    return;
  }

  // Update lastSeenAt
  await db
    .update(tabletDevicesTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(tabletDevicesTable.id, device.id));

  res.json({ id: device.id, name: device.name, status: device.status, location: device.location });
});

// POST /api/tablet/device/:token/ping — update lastSeen silently
router.post("/tablet/device/:token/ping", async (req, res): Promise<void> => {
  const token = req.params.token as string;
  const appVersion = (req.body as { appVersion?: string })?.appVersion;
  await db
    .update(tabletDevicesTable)
    .set({ lastSeenAt: new Date(), ...(appVersion ? { appVersion } : {}) })
    .where(eq(tabletDevicesTable.deviceToken, token));
  res.json({ ok: true });
});

// POST /api/tablet/verify-pin — verify employee PIN with rate limiting
const VerifyPinBody = z.object({
  employeeId: z.string().uuid(),
  pin: z.string().min(1).max(8),
  deviceToken: z.string().min(1),
});

router.post("/tablet/verify-pin", async (req, res): Promise<void> => {
  const parsed = VerifyPinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  const { employeeId, pin, deviceToken } = parsed.data;

  // Validate device (revoked devices cannot verify PINs)
  const device = await getDevice(deviceToken);
  if (!device || device.status === "revoked") {
    res.status(403).json({ error: "Dispositivo no autorizado" });
    return;
  }

  // Check lockout — also resets state if expired
  const lockState = checkPinLock(employeeId);
  if (lockState.locked) {
    await logAudit("pin_locked", employeeId, "tablet_device", device.id, {
      deviceName: device.name,
      retryAfterSeconds: lockState.retryAfterSeconds,
    });
    res.status(429).json({ locked: true, retryAfterSeconds: lockState.retryAfterSeconds });
    return;
  }

  // Get PIN hash
  const pinRecord = await db
    .select()
    .from(employeePinsTable)
    .where(eq(employeePinsTable.employeeId, employeeId))
    .limit(1);

  if (!pinRecord[0]) {
    res.status(404).json({ error: "Este empleado no tiene PIN configurado. Contacte con el administrador." });
    return;
  }

  const valid = await bcrypt.compare(pin, pinRecord[0].pinHash);
  if (!valid) {
    const attemptsLeft = recordPinFailure(employeeId);
    await logAudit("pin_failed", employeeId, "tablet_device", device.id, {
      deviceName: device.name,
      attemptsLeft,
    });

    if (attemptsLeft === 0) {
      const lockNew = checkPinLock(employeeId);
      res.status(401).json({
        error: "PIN incorrecto",
        attemptsLeft: 0,
        locked: true,
        retryAfterSeconds: lockNew.retryAfterSeconds,
      });
    } else {
      res.status(401).json({ error: "PIN incorrecto", attemptsLeft });
    }
    return;
  }

  // Success — reset failure counter
  resetPinAttempts(employeeId);
  await logAudit("pin_verified", employeeId, "tablet_device", device.id, { deviceName: device.name });
  res.json({ ok: true, serverTime: new Date().toISOString() });
});

// POST /api/tablet/clock — clock action from tablet (bypasses mobileClockEnabled)
const TabletClockBody = z.object({
  employeeId: z.string().uuid(),
  action: z.enum(["clock_in", "clock_out", "break_start", "break_end"]),
  deviceToken: z.string().min(1),
});

router.post("/tablet/clock", idempotency, async (req, res): Promise<void> => {
  const parsed = TabletClockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  const { employeeId, action, deviceToken } = parsed.data;

  // Validate device — revoked devices cannot submit clock actions
  const device = await getDevice(deviceToken);
  if (!device || device.status === "revoked") {
    res.status(403).json({ error: "Dispositivo revocado o no autorizado" });
    return;
  }

  // Update lastSeen
  await db.update(tabletDevicesTable).set({ lastSeenAt: new Date() }).where(eq(tabletDevicesTable.id, device.id));

  // Validate employee
  const employee = await db
    .select()
    .from(employeesTable)
    .where(and(eq(employeesTable.id, employeeId), eq(employeesTable.active, true)))
    .limit(1);

  if (!employee[0]) {
    res.status(404).json({ error: "Empleado no encontrado o inactivo" });
    return;
  }

  const now = new Date();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  if (action === "clock_in") {
    const existing = await db.select().from(timeRecordsTable).where(
      and(eq(timeRecordsTable.employeeId, employeeId), isNull(timeRecordsTable.clockOut), gte(timeRecordsTable.clockIn, today))
    ).limit(1);

    if (existing[0]) {
      res.status(409).json({ error: "Ya hay una entrada abierta" });
      return;
    }

    const [record] = await db.insert(timeRecordsTable).values({
      employeeId, clockIn: now, source: "pin", deviceId: device.id,
    }).returning();

    await logAudit("clock_in", employeeId, "time_record", record.id, { deviceName: device.name, method: "pin" });
    res.json({ success: true, record, serverTime: now.toISOString() });
    return;
  }

  // Find open record
  const openRecord = await db.select().from(timeRecordsTable).where(
    and(eq(timeRecordsTable.employeeId, employeeId), isNull(timeRecordsTable.clockOut), gte(timeRecordsTable.clockIn, today))
  ).limit(1);

  if (!openRecord[0]) {
    res.status(404).json({ error: "No hay entrada abierta hoy" });
    return;
  }

  if (action === "clock_out") {
    await db.update(breaksTable).set({ breakEnd: now })
      .where(and(eq(breaksTable.recordId, openRecord[0].id), isNull(breaksTable.breakEnd)));

    const [updated] = await db.update(timeRecordsTable)
      .set({ clockOut: now, updatedAt: now })
      .where(eq(timeRecordsTable.id, openRecord[0].id))
      .returning();

    await logAudit("clock_out", employeeId, "time_record", updated.id, { deviceName: device.name, method: "pin" });
    res.json({ success: true, record: updated, serverTime: now.toISOString() });
    return;
  }

  if (action === "break_start") {
    const existingBreak = await db.select().from(breaksTable)
      .where(and(eq(breaksTable.recordId, openRecord[0].id), isNull(breaksTable.breakEnd))).limit(1);

    if (existingBreak[0]) {
      res.status(409).json({ error: "Ya hay un descanso en curso" });
      return;
    }

    const [brk] = await db.insert(breaksTable).values({
      recordId: openRecord[0].id, breakStart: now,
    }).returning();

    await logAudit("break_start", employeeId, "break", brk.id, { deviceName: device.name, method: "pin" });
    res.json({ success: true, break: brk, serverTime: now.toISOString() });
    return;
  }

  if (action === "break_end") {
    const openBreak = await db.select().from(breaksTable)
      .where(and(eq(breaksTable.recordId, openRecord[0].id), isNull(breaksTable.breakEnd))).limit(1);

    if (!openBreak[0]) {
      res.status(404).json({ error: "No hay descanso abierto" });
      return;
    }

    const [updated] = await db.update(breaksTable)
      .set({ breakEnd: now }).where(eq(breaksTable.id, openBreak[0].id)).returning();

    await logAudit("break_end", employeeId, "break", updated.id, { deviceName: device.name, method: "pin" });
    res.json({ success: true, break: updated, serverTime: now.toISOString() });
    return;
  }

  res.status(400).json({ error: "Acción no válida" });
});

export default router;
