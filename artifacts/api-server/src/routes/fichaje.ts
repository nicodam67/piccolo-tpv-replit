import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  employeesTable,
  timeRecordsTable,
  breaksTable,
  shiftsTable,
  absencesTable,
  timeCorrectionsTable,
  csvImportsTable,
  fichajeAuditTable,
  fichajeSettingsTable,
  nfcCardsTable,
  tabletDevicesTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, asc, isNull, isNotNull } from "drizzle-orm";
import * as crypto from "node:crypto";
import { requireAuth, requireRole } from "../middlewares/auth";
import { idempotency } from "../middlewares/idempotency";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import {
  auditClockAuthorizationFailure,
  CLOCK_AUTH_DENIED,
  ClockAuthorizationError,
  consumeClockProof,
  issueClockProofs,
} from "../lib/clock-authorization";

const router: IRouter = Router();
const publicClockLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: CLOCK_AUTH_DENIED },
});

async function getActivePublicDevice(deviceToken: string | undefined) {
  if (!deviceToken) return null;
  const [device] = await db
    .select({
      id: tabletDevicesTable.id,
      name: tabletDevicesTable.name,
      status: tabletDevicesTable.status,
    })
    .from(tabletDevicesTable)
    .where(eq(tabletDevicesTable.deviceToken, deviceToken))
    .limit(1);
  return device?.status === "active" ? device : null;
}

// ─── Helper: log audit ───────────────────────────────────────────────────────
async function logAudit(
  action: string,
  employeeId: string | null,
  performedBy: string | null,
  entityType: string,
  entityId: string | null,
  details?: object
) {
  await db.insert(fichajeAuditTable).values({
    action,
    employeeId: employeeId ?? undefined,
    performedBy: performedBy ?? undefined,
    entityType,
    entityId: entityId ?? undefined,
    details: details ?? null,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS — no auth (for mobile clock screen at /fichaje)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/fichaje/public/employees — list active employees for PIN selection
router.get("/fichaje/public/employees", async (req, res): Promise<void> => {
  const device = await getActivePublicDevice(req.query.deviceToken as string | undefined);
  if (!device) {
    res.status(401).json({ error: CLOCK_AUTH_DENIED });
    return;
  }
  const employees = await db
    .select({ id: employeesTable.id, name: employeesTable.name })
    .from(employeesTable)
    .where(eq(employeesTable.active, true))
    .orderBy(asc(employeesTable.name));
  res.json(employees);
});

// GET /api/fichaje/public/clock-status — is mobile clock enabled?
router.get("/fichaje/public/clock-status", async (_req, res): Promise<void> => {
  const settings = await db
    .select({ mobileClockEnabled: fichajeSettingsTable.mobileClockEnabled })
    .from(fichajeSettingsTable)
    .limit(1);
  res.json({
    mobileClockEnabled: false,
    configuredMobileClockEnabled: settings[0]?.mobileClockEnabled ?? false,
    reason: "El fichaje requiere un dispositivo registrado",
  });
});

// GET /api/fichaje/public/my-status/:employeeId — current clock state for employee
router.get("/fichaje/public/my-status/:employeeId", async (req, res): Promise<void> => {
  const device = await getActivePublicDevice(req.query.deviceToken as string | undefined);
  if (!device) {
    res.status(401).json({ error: CLOCK_AUTH_DENIED });
    return;
  }
  const employeeId = req.params.employeeId as string;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const openRecord = await db
    .select()
    .from(timeRecordsTable)
    .where(
      and(
        eq(timeRecordsTable.employeeId, employeeId),
        isNull(timeRecordsTable.clockOut),
        gte(timeRecordsTable.clockIn, today)
      )
    )
    .limit(1);

  if (!openRecord[0]) {
    res.json({ status: "out", record: null });
    return;
  }

  const openBreak = await db
    .select()
    .from(breaksTable)
    .where(
      and(
        eq(breaksTable.recordId, openRecord[0].id),
        isNull(breaksTable.breakEnd)
      )
    )
    .limit(1);

  res.json({
    status: openBreak[0] ? "break" : "in",
    record: openRecord[0],
    activeBreak: openBreak[0] ?? null,
  });
});

// POST /api/fichaje/public/clock — clock in/out/break (no auth, uses employeeId from body)
const PublicClockBody = z.object({
  employeeId: z.string().uuid(),
  action: z.enum(["clock_in", "clock_out", "break_start", "break_end"]),
  deviceToken: z.string().min(1),
  proof: z.string().min(32),
});

router.post("/fichaje/public/clock", publicClockLimiter, idempotency, async (req, res): Promise<void> => {
  const parsed = PublicClockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  const { employeeId, action, deviceToken, proof } = parsed.data;
  const device = await getActivePublicDevice(deviceToken);
  if (!device) {
    res.status(401).json({ error: CLOCK_AUTH_DENIED });
    return;
  }

  try {
    res.json(await consumeClockProof({
      proof,
      employeeId,
      deviceId: device.id,
      action,
      idempotencyKey: typeof req.headers["idempotency-key"] === "string"
        ? req.headers["idempotency-key"]
        : undefined,
      idempotencyUserId: req.user?.id ?? "anon",
    }));
  } catch (error) {
    const authError = error instanceof ClockAuthorizationError
      ? error
      : new ClockAuthorizationError(503, "clock_transaction_failed", "Fichaje no disponible");
    await auditClockAuthorizationFailure({
      employeeId,
      deviceId: device.id,
      action,
      reason: authError.reason,
    });
    res.status(authError.status).json({ error: authError.externalMessage });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PROTECTED ENDPOINTS — require JWT auth
// ════════════════════════════════════════════════════════════════════════════

// ─── Time Records ────────────────────────────────────────────────────────────

router.get("/fichaje/records", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const { from, to, employeeId } = req.query as Record<string, string>;

  const isManager = ["admin", "manager", "encargado"].includes(user.role);
  const targetId = isManager && employeeId ? employeeId : user.id;

  const conditions = [eq(timeRecordsTable.employeeId, targetId)];
  if (from) conditions.push(gte(timeRecordsTable.clockIn, new Date(from)));
  if (to) conditions.push(lte(timeRecordsTable.clockIn, new Date(to)));

  const records = await db
    .select({
      id: timeRecordsTable.id,
      employeeId: timeRecordsTable.employeeId,
      employeeName: employeesTable.name,
      clockIn: timeRecordsTable.clockIn,
      clockOut: timeRecordsTable.clockOut,
      source: timeRecordsTable.source,
      isManual: timeRecordsTable.isManual,
      notes: timeRecordsTable.notes,
      createdAt: timeRecordsTable.createdAt,
    })
    .from(timeRecordsTable)
    .innerJoin(employeesTable, eq(timeRecordsTable.employeeId, employeesTable.id))
    .where(and(...conditions))
    .orderBy(desc(timeRecordsTable.clockIn))
    .limit(500);

  res.json(records);
});

// GET /api/fichaje/records/today — all employees status today (managers)
router.get(
  "/fichaje/records/today",
  requireAuth,
  requireRole("admin", "manager", "encargado"),
  async (_req, res): Promise<void> => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const records = await db
      .select({
        id: timeRecordsTable.id,
        employeeId: timeRecordsTable.employeeId,
        employeeName: employeesTable.name,
        clockIn: timeRecordsTable.clockIn,
        clockOut: timeRecordsTable.clockOut,
        source: timeRecordsTable.source,
      })
      .from(timeRecordsTable)
      .innerJoin(employeesTable, eq(timeRecordsTable.employeeId, employeesTable.id))
      .where(
        and(
          gte(timeRecordsTable.clockIn, today),
          lte(timeRecordsTable.clockIn, tomorrow)
        )
      )
      .orderBy(asc(timeRecordsTable.clockIn));

    res.json(records);
  }
);

// POST /api/fichaje/records/manual — create manual record (managers)
const ManualRecordBody = z.object({
  employeeId: z.string().uuid(),
  clockIn: z.string(),
  clockOut: z.string().optional(),
  notes: z.string().optional(),
});

router.post(
  "/fichaje/records/manual",
  requireAuth,
  requireRole("admin", "manager", "encargado"),
  async (req, res): Promise<void> => {
    const parsed = ManualRecordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos inválidos" });
      return;
    }

    const { employeeId, clockIn, clockOut, notes } = parsed.data;
    const user = req.user!;

    const [record] = await db
      .insert(timeRecordsTable)
      .values({
        employeeId,
        clockIn: new Date(clockIn),
        clockOut: clockOut ? new Date(clockOut) : undefined,
        source: "manual",
        isManual: true,
        notes: notes ?? null,
        createdBy: user.id,
      })
      .returning();

    await logAudit("manual_record", employeeId, user.id, "time_record", record.id, { clockIn, clockOut });
    res.status(201).json(record);
  }
);

// PUT /api/fichaje/records/:id — update record (managers)
router.put(
  "/fichaje/records/:id",
  requireAuth,
  requireRole("admin", "manager", "encargado"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const user = req.user!;

    const existing = await db
      .select()
      .from(timeRecordsTable)
      .where(eq(timeRecordsTable.id, id))
      .limit(1);

    if (!existing[0]) {
      res.status(404).json({ error: "Registro no encontrado" });
      return;
    }

    const before = existing[0];
    const { clockIn, clockOut, notes } = req.body;

    const [updated] = await db
      .update(timeRecordsTable)
      .set({
        clockIn: clockIn ? new Date(clockIn) : before.clockIn,
        clockOut: clockOut ? new Date(clockOut) : before.clockOut,
        notes: notes ?? before.notes,
        updatedAt: new Date(),
      })
      .where(eq(timeRecordsTable.id, id))
      .returning();

    // Log correction
    await db.insert(timeCorrectionsTable).values({
      recordId: id,
      correctedBy: user.id,
      reason: req.body.reason ?? "Corrección manual",
      beforeData: before as object,
      afterData: updated as object,
    });

    await logAudit("correction", before.employeeId, user.id, "time_record", id);
    res.json(updated);
  }
);

// ─── Breaks ──────────────────────────────────────────────────────────────────

router.get("/fichaje/records/:id/breaks", requireAuth, async (req, res): Promise<void> => {
  const recordId = req.params.id as string;
  const breaks = await db
    .select()
    .from(breaksTable)
    .where(eq(breaksTable.recordId, recordId))
    .orderBy(asc(breaksTable.breakStart));
  res.json(breaks);
});

// ─── Shifts ──────────────────────────────────────────────────────────────────

router.get("/fichaje/shifts", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const { from, to, employeeId } = req.query as Record<string, string>;
  const isManager = ["admin", "manager", "encargado"].includes(user.role);
  const targetId = isManager && employeeId ? employeeId : user.id;

  const conditions = [eq(shiftsTable.employeeId, targetId)];
  if (from) conditions.push(gte(shiftsTable.shiftDate, from));
  if (to) conditions.push(lte(shiftsTable.shiftDate, to));

  const shifts = await db
    .select({
      id: shiftsTable.id,
      employeeId: shiftsTable.employeeId,
      employeeName: employeesTable.name,
      shiftDate: shiftsTable.shiftDate,
      startTime: shiftsTable.startTime,
      endTime: shiftsTable.endTime,
      isSplit: shiftsTable.isSplit,
      splitStartTime: shiftsTable.splitStartTime,
      splitEndTime: shiftsTable.splitEndTime,
      notes: shiftsTable.notes,
    })
    .from(shiftsTable)
    .innerJoin(employeesTable, eq(shiftsTable.employeeId, employeesTable.id))
    .where(and(...conditions))
    .orderBy(asc(shiftsTable.shiftDate));

  res.json(shifts);
});

const ShiftBody = z.object({
  employeeId: z.string().uuid(),
  shiftDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  isSplit: z.boolean().default(false),
  splitStartTime: z.string().optional(),
  splitEndTime: z.string().optional(),
  notes: z.string().optional(),
});

router.post(
  "/fichaje/shifts",
  requireAuth,
  requireRole("admin", "manager", "encargado"),
  async (req, res): Promise<void> => {
    const parsed = ShiftBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos inválidos" });
      return;
    }
    const [shift] = await db
      .insert(shiftsTable)
      .values({ ...parsed.data, createdBy: req.user!.id })
      .returning();
    await logAudit("shift_created", parsed.data.employeeId, req.user!.id, "shift", shift.id);
    res.status(201).json(shift);
  }
);

router.put(
  "/fichaje/shifts/:id",
  requireAuth,
  requireRole("admin", "manager", "encargado"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const [updated] = await db
      .update(shiftsTable)
      .set(req.body)
      .where(eq(shiftsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Turno no encontrado" }); return; }
    await logAudit("shift_updated", updated.employeeId, req.user!.id, "shift", id);
    res.json(updated);
  }
);

router.delete(
  "/fichaje/shifts/:id",
  requireAuth,
  requireRole("admin", "manager", "encargado"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const existing = await db.select().from(shiftsTable).where(eq(shiftsTable.id, id)).limit(1);
    if (!existing[0]) { res.status(404).json({ error: "Turno no encontrado" }); return; }
    await db.delete(shiftsTable).where(eq(shiftsTable.id, id));
    await logAudit("shift_deleted", existing[0].employeeId, req.user!.id, "shift", id);
    res.json({ success: true });
  }
);

// ─── Absences ────────────────────────────────────────────────────────────────

router.get("/fichaje/absences", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const { from, to, employeeId, status } = req.query as Record<string, string>;
  const isManager = ["admin", "manager", "encargado"].includes(user.role);
  const targetId = isManager && employeeId ? employeeId : user.id;

  const conditions = [eq(absencesTable.employeeId, targetId)];
  if (from) conditions.push(gte(absencesTable.absenceDate, from));
  if (to) conditions.push(lte(absencesTable.absenceDate, to));
  if (status) conditions.push(eq(absencesTable.status, status));

  const absences = await db
    .select({
      id: absencesTable.id,
      employeeId: absencesTable.employeeId,
      employeeName: employeesTable.name,
      absenceDate: absencesTable.absenceDate,
      absenceType: absencesTable.absenceType,
      status: absencesTable.status,
      reason: absencesTable.reason,
      approvedBy: absencesTable.approvedBy,
      approvedAt: absencesTable.approvedAt,
      createdAt: absencesTable.createdAt,
    })
    .from(absencesTable)
    .innerJoin(employeesTable, eq(absencesTable.employeeId, employeesTable.id))
    .where(and(...conditions))
    .orderBy(desc(absencesTable.absenceDate));

  res.json(absences);
});

const AbsenceBody = z.object({
  employeeId: z.string().uuid(),
  absenceDate: z.string(),
  absenceType: z.enum(["holiday", "sick_leave", "vacation", "presentation", "other"]),
  reason: z.string().optional(),
});

router.post("/fichaje/absences", requireAuth, async (req, res): Promise<void> => {
  const parsed = AbsenceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }
  const user = req.user!;
  const isManager = ["admin", "manager", "encargado"].includes(user.role);
  const employeeId = isManager ? parsed.data.employeeId : user.id;

  const [absence] = await db.insert(absencesTable).values({ ...parsed.data, employeeId }).returning();
  await logAudit("absence_created", employeeId, user.id, "absence", absence.id);
  res.status(201).json(absence);
});

router.put(
  "/fichaje/absences/:id/approve",
  requireAuth,
  requireRole("admin", "manager", "encargado"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const { status } = req.body; // 'approved' | 'rejected'
    const [updated] = await db
      .update(absencesTable)
      .set({ status, approvedBy: req.user!.id, approvedAt: new Date() })
      .where(eq(absencesTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Ausencia no encontrada" }); return; }
    await logAudit(`absence_${status}`, updated.employeeId, req.user!.id, "absence", id);
    res.json(updated);
  }
);

router.delete(
  "/fichaje/absences/:id",
  requireAuth,
  requireRole("admin", "manager", "encargado"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const existing = await db.select().from(absencesTable).where(eq(absencesTable.id, id)).limit(1);
    if (!existing[0]) { res.status(404).json({ error: "Ausencia no encontrada" }); return; }
    await db.delete(absencesTable).where(eq(absencesTable.id, id));
    res.json({ success: true });
  }
);

// ─── Reports ─────────────────────────────────────────────────────────────────

router.get(
  "/fichaje/reports/summary",
  requireAuth,
  requireRole("admin", "manager", "encargado"),
  async (req, res): Promise<void> => {
    const { from, to, employeeId } = req.query as Record<string, string>;

    const conditions: ReturnType<typeof eq>[] = [];
    if (employeeId) conditions.push(eq(timeRecordsTable.employeeId, employeeId));
    if (from) conditions.push(gte(timeRecordsTable.clockIn, new Date(from)));
    if (to) conditions.push(lte(timeRecordsTable.clockIn, new Date(to)));

    const records = await db
      .select({
        id: timeRecordsTable.id,
        employeeId: timeRecordsTable.employeeId,
        employeeName: employeesTable.name,
        clockIn: timeRecordsTable.clockIn,
        clockOut: timeRecordsTable.clockOut,
        isManual: timeRecordsTable.isManual,
      })
      .from(timeRecordsTable)
      .innerJoin(employeesTable, eq(timeRecordsTable.employeeId, employeesTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(timeRecordsTable.clockIn));

    // Compute totals per employee
    const totals: Record<string, { name: string; minutes: number; days: Set<string>; records: number }> = {};
    for (const r of records) {
      if (!totals[r.employeeId]) totals[r.employeeId] = { name: r.employeeName, minutes: 0, days: new Set(), records: 0 };
      totals[r.employeeId].records++;
      if (r.clockOut) {
        const mins = (new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / 60000;
        totals[r.employeeId].minutes += mins;
      }
      totals[r.employeeId].days.add(new Date(r.clockIn).toISOString().slice(0, 10));
    }

    const summary = Object.entries(totals).map(([id, t]) => ({
      employeeId: id,
      employeeName: t.name,
      totalMinutes: Math.round(t.minutes),
      totalHours: (t.minutes / 60).toFixed(2),
      totalDays: t.days.size,
      totalRecords: t.records,
    }));

    res.json(summary);
  }
);

// ─── CSV Import (Anviz) ───────────────────────────────────────────────────────

router.post(
  "/fichaje/import/anviz",
  requireAuth,
  requireRole("admin", "manager"),
  async (req, res): Promise<void> => {
    const { rows, filename } = req.body as { rows: Array<{ anvizId: string; clockIn: string; clockOut?: string }>; filename: string };

    if (!Array.isArray(rows) || !filename) {
      res.status(400).json({ error: "Se requieren 'rows' y 'filename'" });
      return;
    }

    let imported = 0;
    let skipped = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const employee = await db
          .select()
          .from(employeesTable)
          .where(eq(employeesTable.anvizId, row.anvizId))
          .limit(1);

        if (!employee[0]) {
          errors.push({ row: i + 1, message: `No se encontró empleado con anviz_id=${row.anvizId}` });
          skipped++;
          continue;
        }

        await db.insert(timeRecordsTable).values({
          employeeId: employee[0].id,
          clockIn: new Date(row.clockIn),
          clockOut: row.clockOut ? new Date(row.clockOut) : undefined,
          source: "anviz",
          isManual: false,
        });
        imported++;
      } catch (err) {
        errors.push({ row: i + 1, message: String(err) });
        skipped++;
      }
    }

    const [imp] = await db
      .insert(csvImportsTable)
      .values({
        filename,
        rowsTotal: rows.length,
        rowsImported: imported,
        rowsSkipped: skipped,
        rowsErrored: errors.length,
        errors: errors.length ? errors : null,
        importedBy: req.user!.id,
      })
      .returning();

    await logAudit("anviz_import", null, req.user!.id, "csv_import", imp.id, { filename, imported, skipped });
    res.json({ success: true, imported, skipped, errors });
  }
);

router.get(
  "/fichaje/import/history",
  requireAuth,
  requireRole("admin", "manager"),
  async (_req, res): Promise<void> => {
    const history = await db
      .select({
        id: csvImportsTable.id,
        filename: csvImportsTable.filename,
        rowsTotal: csvImportsTable.rowsTotal,
        rowsImported: csvImportsTable.rowsImported,
        rowsSkipped: csvImportsTable.rowsSkipped,
        rowsErrored: csvImportsTable.rowsErrored,
        importedByName: employeesTable.name,
        createdAt: csvImportsTable.createdAt,
      })
      .from(csvImportsTable)
      .innerJoin(employeesTable, eq(csvImportsTable.importedBy, employeesTable.id))
      .orderBy(desc(csvImportsTable.createdAt))
      .limit(100);
    res.json(history);
  }
);

// ─── Settings ────────────────────────────────────────────────────────────────

router.get("/fichaje/settings", requireAuth, requireRole("admin", "manager"), async (_req, res): Promise<void> => {
  const settings = await db.select().from(fichajeSettingsTable).limit(1);
  res.json(settings[0] ?? {});
});

router.put("/fichaje/settings", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const allowed = [
    "companyName", "locale", "timezone", "weekStart",
    "mobileClockEnabled", "reportEmail", "reportDayOfWeek",
  ];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in req.body) updates[k] = req.body[k];
  }
  updates["updatedAt"] = new Date();

  const [updated] = await db
    .update(fichajeSettingsTable)
    .set(updates)
    .where(eq(fichajeSettingsTable.id, 1))
    .returning();

  await logAudit("settings_updated", null, req.user!.id, "fichaje_settings", "1", updates);
  res.json(updated);
});

// ─── Audit log ───────────────────────────────────────────────────────────────

router.get(
  "/fichaje/audit",
  requireAuth,
  requireRole("admin", "manager"),
  async (req, res): Promise<void> => {
    const { limit = "100" } = req.query as Record<string, string>;
    const entries = await db
      .select({
        id: fichajeAuditTable.id,
        action: fichajeAuditTable.action,
        employeeId: fichajeAuditTable.employeeId,
        performedByName: employeesTable.name,
        entityType: fichajeAuditTable.entityType,
        entityId: fichajeAuditTable.entityId,
        details: fichajeAuditTable.details,
        createdAt: fichajeAuditTable.createdAt,
      })
      .from(fichajeAuditTable)
      .leftJoin(employeesTable, eq(fichajeAuditTable.performedBy, employeesTable.id))
      .orderBy(desc(fichajeAuditTable.createdAt))
      .limit(Math.min(parseInt(limit), 500));
    res.json(entries);
  }
);

// ════════════════════════════════════════════════════════════════════════════
// NFC CARD MANAGEMENT — require auth + manager/admin
// ════════════════════════════════════════════════════════════════════════════

function hashNfcToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken.toLowerCase().trim()).digest("hex");
}

// Anti-debounce store: key = hash:deviceToken, value = timestamp of last identify call
const nfcDebounce = new Map<string, number>();
const NFC_DEBOUNCE_MS = 5_000;

// POST /api/fichaje/nfc/cards — assign a new NFC card to an employee
router.post(
  "/fichaje/nfc/cards",
  requireAuth,
  requireRole("admin", "manager"),
  async (req, res): Promise<void> => {
    const { employeeId, rawToken, alias } = req.body as {
      employeeId?: string;
      rawToken?: string;
      alias?: string;
    };

    if (!employeeId || !rawToken) {
      res.status(400).json({ error: "Se requieren employeeId y rawToken" });
      return;
    }

    const cardTokenHash = hashNfcToken(rawToken);

    // Check employee exists
    const emp = await db
      .select({ id: employeesTable.id, name: employeesTable.name })
      .from(employeesTable)
      .where(eq(employeesTable.id, employeeId))
      .limit(1);
    if (!emp[0]) { res.status(404).json({ error: "Empleado no encontrado" }); return; }

    // Check hash uniqueness
    const existing = await db
      .select({ id: nfcCardsTable.id, employeeId: nfcCardsTable.employeeId })
      .from(nfcCardsTable)
      .where(eq(nfcCardsTable.cardTokenHash, cardTokenHash))
      .limit(1);

    if (existing[0]) {
      if (existing[0].employeeId === employeeId) {
        res.status(409).json({ error: "Esta tarjeta ya está asignada a este empleado" });
      } else {
        res.status(409).json({ error: "Esta tarjeta ya está asignada a otro empleado" });
      }
      return;
    }

    const [card] = await db
      .insert(nfcCardsTable)
      .values({
        employeeId,
        cardTokenHash,
        alias: alias?.trim() || null,
        assignedBy: req.user!.id,
        status: "active",
      })
      .returning();

    await logAudit("nfc_assigned", employeeId, req.user!.id, "nfc_card", card.id, {
      alias: card.alias,
      assignedTo: emp[0].name,
    });

    res.status(201).json({ id: card.id, alias: card.alias, status: card.status, assignedAt: card.assignedAt });
  }
);

// GET /api/fichaje/nfc/cards/:employeeId — list NFC cards for an employee
router.get(
  "/fichaje/nfc/cards/:employeeId",
  requireAuth,
  requireRole("admin", "manager"),
  async (req, res): Promise<void> => {
    const employeeId = req.params.employeeId as string;
    const cards = await db
      .select({
        id: nfcCardsTable.id,
        alias: nfcCardsTable.alias,
        status: nfcCardsTable.status,
        lastUsedAt: nfcCardsTable.lastUsedAt,
        assignedAt: nfcCardsTable.assignedAt,
        revokedAt: nfcCardsTable.revokedAt,
        revokedReason: nfcCardsTable.revokedReason,
      })
      .from(nfcCardsTable)
      .where(eq(nfcCardsTable.employeeId, employeeId))
      .orderBy(desc(nfcCardsTable.assignedAt));
    res.json(cards);
  }
);

// PATCH /api/fichaje/nfc/cards/:id — update alias or status
router.patch(
  "/fichaje/nfc/cards/:id",
  requireAuth,
  requireRole("admin", "manager"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const { alias, status } = req.body as { alias?: string; status?: string };
    const updates: Record<string, unknown> = {};
    if (alias !== undefined) updates.alias = alias.trim() || null;
    if (status && ["active", "revoked"].includes(status)) updates.status = status;

    const [updated] = await db
      .update(nfcCardsTable)
      .set(updates)
      .where(eq(nfcCardsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Tarjeta no encontrada" }); return; }

    await logAudit("nfc_updated", updated.employeeId, req.user!.id, "nfc_card", id, updates);
    res.json({ id: updated.id, alias: updated.alias, status: updated.status });
  }
);

// POST /api/fichaje/nfc/cards/:id/revoke — revoke a card
router.post(
  "/fichaje/nfc/cards/:id/revoke",
  requireAuth,
  requireRole("admin", "manager"),
  async (req, res): Promise<void> => {
    const id = req.params.id as string;
    const { reason } = req.body as { reason?: string };

    const [updated] = await db
      .update(nfcCardsTable)
      .set({
        status: "revoked",
        revokedAt: new Date(),
        revokedBy: req.user!.id,
        revokedReason: reason ?? "Revocada por administrador",
      })
      .where(eq(nfcCardsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Tarjeta no encontrada" }); return; }

    await logAudit("nfc_revoked_admin", updated.employeeId, req.user!.id, "nfc_card", id, { reason });
    res.json({ success: true });
  }
);

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC NFC IDENTIFY — no auth, gated by device token + anti-debounce
// Route is under /fichaje/public/ prefix — already in PUBLIC_ALLOWLIST
// ════════════════════════════════════════════════════════════════════════════

// POST /api/fichaje/public/nfc/identify — identify employee by NFC card token
router.post("/fichaje/public/nfc/identify", publicClockLimiter, async (req, res): Promise<void> => {
  const { rawToken, deviceToken } = req.body as { rawToken?: string; deviceToken?: string };

  if (!rawToken || !deviceToken) {
    res.status(400).json({ error: "Se requieren rawToken y deviceToken" });
    return;
  }

  // Validate device
  const devices = await db
    .select({ id: tabletDevicesTable.id, name: tabletDevicesTable.name, status: tabletDevicesTable.status })
    .from(tabletDevicesTable)
    .where(eq(tabletDevicesTable.deviceToken, deviceToken))
    .limit(1);

  if (!devices[0] || devices[0].status === "revoked") {
    res.status(401).json({ error: CLOCK_AUTH_DENIED });
    return;
  }

  const hash = hashNfcToken(rawToken);
  const debounceKey = `${hash}:${devices[0].id}`;
  const now = Date.now();

  // Anti-debounce: same card+device blocked for 5 s
  const lastSeen = nfcDebounce.get(debounceKey);
  if (lastSeen && now - lastSeen < NFC_DEBOUNCE_MS) {
    // performedBy: null (device is not an employee); entityId: null (no card row available)
    await logAudit("nfc_debounced", null, null, "tablet_device", devices[0].id, {
      deviceName: devices[0].name,
      tokenPrefix: hash.slice(0, 8),  // partial hash only for debugging, not PII
    });
    res.status(429).json({ error: "Doble lectura ignorada", retryAfterMs: NFC_DEBOUNCE_MS - (now - lastSeen) });
    return;
  }
  nfcDebounce.set(debounceKey, now);

  // Lookup card
  const card = await db
    .select({
      id: nfcCardsTable.id,
      employeeId: nfcCardsTable.employeeId,
      status: nfcCardsTable.status,
    })
    .from(nfcCardsTable)
    .where(eq(nfcCardsTable.cardTokenHash, hash))
    .limit(1);

  if (!card[0]) {
    // performedBy: null (no employee); entityId: null (card not found, no UUID available)
    await logAudit("nfc_unknown", null, null, "tablet_device", devices[0].id, {
      deviceName: devices[0].name,
      tokenPrefix: hash.slice(0, 8),
    });
    res.status(401).json({ error: CLOCK_AUTH_DENIED });
    return;
  }

  if (card[0].status === "revoked") {
    // performedBy: null (device actor, not employee); entityId: card.id (valid UUID)
    await logAudit("nfc_revoked", card[0].employeeId, null, "nfc_card", card[0].id, {
      deviceName: devices[0].name,
      deviceId: devices[0].id,
    });
    res.status(401).json({ error: CLOCK_AUTH_DENIED });
    return;
  }

  // Get employee
  const emp = await db
    .select({ id: employeesTable.id, name: employeesTable.name, active: employeesTable.active })
    .from(employeesTable)
    .where(eq(employeesTable.id, card[0].employeeId))
    .limit(1);

  if (!emp[0] || !emp[0].active) {
    res.status(401).json({ error: CLOCK_AUTH_DENIED });
    return;
  }

  // Get current clock status
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const openRecord = await db
    .select()
    .from(timeRecordsTable)
    .where(and(
      eq(timeRecordsTable.employeeId, emp[0].id),
      isNull(timeRecordsTable.clockOut),
      gte(timeRecordsTable.clockIn, today)
    ))
    .limit(1);

  const openBreak = openRecord[0]
    ? await db
        .select()
        .from(breaksTable)
        .where(and(eq(breaksTable.recordId, openRecord[0].id), isNull(breaksTable.breakEnd)))
        .limit(1)
    : [];

  const currentStatus = openBreak[0] ? "break" : openRecord[0] ? "in" : "out";

  // Update lastUsedAt
  await db
    .update(nfcCardsTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(nfcCardsTable.id, card[0].id));

  // Update device lastSeen
  await db
    .update(tabletDevicesTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(tabletDevicesTable.id, devices[0].id));

  // performedBy: null (device actor, not an employee); card.id is a valid UUID
  await logAudit("nfc_identified", emp[0].id, null, "nfc_card", card[0].id, {
    deviceName: devices[0].name,
    deviceId: devices[0].id,
    employeeName: emp[0].name,
    currentStatus,
  });
  const authorization = await issueClockProofs({
    employeeId: emp[0].id,
    deviceId: devices[0].id,
    method: "nfc",
  });

  res.json({
    employeeId: emp[0].id,
    employeeName: emp[0].name,
    currentStatus,
    record: openRecord[0] ?? null,
    activeBreak: openBreak[0] ?? null,
    ...authorization,
    serverTime: new Date().toISOString(),
  });
});

// ─── Employee fichaje profile (my own data) ───────────────────────────────────

router.get("/fichaje/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const openRecord = await db
    .select()
    .from(timeRecordsTable)
    .where(and(eq(timeRecordsTable.employeeId, user.id), isNull(timeRecordsTable.clockOut), gte(timeRecordsTable.clockIn, today)))
    .limit(1);

  const openBreak = openRecord[0]
    ? await db
        .select()
        .from(breaksTable)
        .where(and(eq(breaksTable.recordId, openRecord[0].id), isNull(breaksTable.breakEnd)))
        .limit(1)
    : [];

  res.json({
    employee: { id: user.id, name: user.name, role: user.role },
    status: openBreak[0] ? "break" : openRecord[0] ? "in" : "out",
    currentRecord: openRecord[0] ?? null,
    currentBreak: openBreak[0] ?? null,
  });
});

export default router;
