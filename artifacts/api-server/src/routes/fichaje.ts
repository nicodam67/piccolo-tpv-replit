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
} from "@workspace/db";
import { eq, and, gte, lte, desc, asc, isNull, isNotNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { idempotency } from "../middlewares/idempotency";
import { z } from "zod";

const router: IRouter = Router();

// ─── Helper: log audit ───────────────────────────────────────────────────────
async function logAudit(
  action: string,
  employeeId: string | null,
  performedBy: string,
  entityType: string,
  entityId: string,
  details?: object
) {
  await db.insert(fichajeAuditTable).values({
    action,
    employeeId: employeeId ?? undefined,
    performedBy,
    entityType,
    entityId,
    details: details ?? null,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS — no auth (for mobile clock screen at /fichaje)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/fichaje/public/employees — list active employees for PIN selection
router.get("/fichaje/public/employees", async (_req, res): Promise<void> => {
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
  res.json({ mobileClockEnabled: settings[0]?.mobileClockEnabled ?? false });
});

// GET /api/fichaje/public/my-status/:employeeId — current clock state for employee
router.get("/fichaje/public/my-status/:employeeId", async (req, res): Promise<void> => {
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
  source: z.enum(["pin", "nfc", "manual"]).default("pin"),
});

router.post("/fichaje/public/clock", idempotency, async (req, res): Promise<void> => {
  const settings = await db.select().from(fichajeSettingsTable).limit(1);
  if (!settings[0]?.mobileClockEnabled) {
    res.status(403).json({ error: "El fichaje móvil no está habilitado" });
    return;
  }

  const parsed = PublicClockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  const { employeeId, action, source } = parsed.data;
  const now = new Date();

  const employee = await db
    .select()
    .from(employeesTable)
    .where(and(eq(employeesTable.id, employeeId), eq(employeesTable.active, true)))
    .limit(1);

  if (!employee[0]) {
    res.status(404).json({ error: "Empleado no encontrado" });
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (action === "clock_in") {
    const existing = await db
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

    if (existing[0]) {
      res.status(409).json({ error: "Ya hay una entrada abierta" });
      return;
    }

    const [record] = await db
      .insert(timeRecordsTable)
      .values({ employeeId, clockIn: now, source })
      .returning();

    await logAudit("clock_in", employeeId, employeeId, "time_record", record.id);
    res.json({ success: true, record });
    return;
  }

  // For the rest, find the open record
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
    res.status(404).json({ error: "No hay entrada abierta" });
    return;
  }

  if (action === "clock_out") {
    // Close open break first if any
    await db
      .update(breaksTable)
      .set({ breakEnd: now })
      .where(and(eq(breaksTable.recordId, openRecord[0].id), isNull(breaksTable.breakEnd)));

    const [updated] = await db
      .update(timeRecordsTable)
      .set({ clockOut: now, updatedAt: now })
      .where(eq(timeRecordsTable.id, openRecord[0].id))
      .returning();

    await logAudit("clock_out", employeeId, employeeId, "time_record", updated.id);
    res.json({ success: true, record: updated });
    return;
  }

  if (action === "break_start") {
    const existingBreak = await db
      .select()
      .from(breaksTable)
      .where(and(eq(breaksTable.recordId, openRecord[0].id), isNull(breaksTable.breakEnd)))
      .limit(1);

    if (existingBreak[0]) {
      res.status(409).json({ error: "Ya hay un descanso en curso" });
      return;
    }

    const [brk] = await db
      .insert(breaksTable)
      .values({ recordId: openRecord[0].id, breakStart: now })
      .returning();

    await logAudit("break_start", employeeId, employeeId, "break", brk.id);
    res.json({ success: true, break: brk });
    return;
  }

  if (action === "break_end") {
    const openBreak = await db
      .select()
      .from(breaksTable)
      .where(and(eq(breaksTable.recordId, openRecord[0].id), isNull(breaksTable.breakEnd)))
      .limit(1);

    if (!openBreak[0]) {
      res.status(404).json({ error: "No hay descanso abierto" });
      return;
    }

    const [updated] = await db
      .update(breaksTable)
      .set({ breakEnd: now })
      .where(eq(breaksTable.id, openBreak[0].id))
      .returning();

    await logAudit("break_end", employeeId, employeeId, "break", updated.id);
    res.json({ success: true, break: updated });
    return;
  }

  res.status(400).json({ error: "Acción no válida" });
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
