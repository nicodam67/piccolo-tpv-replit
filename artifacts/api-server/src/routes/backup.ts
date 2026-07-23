/**
 * Backup Module — copias de seguridad, programación, exportación de emergencia
 *
 * POST /backup/create
 * POST /backup/:id/verify
 * GET  /backup/list
 * GET  /backup/:id/download
 * GET  /backup/:id/inspect
 * POST /backup/:id/dry-run
 * POST /backup/:id/restore
 * DELETE /backup/:id
 * PATCH /backup/:id/protect
 * GET/POST/PUT/DELETE /backup/schedules
 * GET/POST/PUT/DELETE /backup/destinations
 * POST /backup/emergency-export
 * POST /backup/demo-data
 * DELETE /backup/demo-data
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import {
  backupRecordsTable,
  backupAuditLogTable,
  backupSchedulesTable,
  backupDestinationsTable,
  techEventsTable,
  ticketsTable,
  cashSessionsTable,
  crmClientsTable,
  employeesTable,
  productsTable,
  ingredientsTable,
  reservationsTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import ExcelJS from "exceljs";
import {
  backupChecksum,
  createDatabaseSnapshot,
  decryptBackup,
  encryptBackup,
  restoreDatabaseSnapshot,
  validateBackupForCurrentDatabase,
  validateBackupPayload,
} from "../lib/backup-core";

const router = Router();
const guard = [requireAuth, requireRole("admin", "manager")];
const adminOnly = [requireAuth, requireRole("admin")];

// Rate limiter: 5 backup/restore operations per hour per IP.
// Backup creation and restore are expensive I/O operations; limiting them
// prevents accidental or malicious saturation of disk/CPU.
const backupLimiter = rateLimit({
  windowMs: 60 * 60 * 1_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas operaciones de copia de seguridad en esta hora. Inténtelo más tarde." },
});

const BACKUP_DIR = "/tmp/piccolo-backups";
const APP_VERSION = "1.2.0";

// Ensure backup directory exists
try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch {}

async function logAudit(
  backupId: string | null,
  action: string,
  result: "ok" | "error",
  details: Record<string, unknown>,
  req: { user?: { id?: string; name?: string } }
) {
  await db.insert(backupAuditLogTable).values({
    backupId,
    action,
    result,
    details,
    employeeId: (req.user as { id?: string } | undefined)?.id ?? null,
    employeeName: (req.user as { name?: string } | undefined)?.name ?? "sistema",
  }).catch(() => {});
}

async function logTechEvent(level: string, module: string, message: string, data: Record<string, unknown> = {}) {
  await db.insert(techEventsTable).values({ level, module, message, data }).catch(() => {});
}

// ─── POST /backup/create ──────────────────────────────────────────────────────
router.post("/backup/create", ...guard, backupLimiter, async (req, res) => {
  const { backupType = "full", notes = "", scheduleId } = req.body as Record<string, string>;

  const [record] = await db.insert(backupRecordsTable).values({
    type: "manual",
    backupType,
    appVersion: APP_VERSION,
    status: "pending",
    notes,
    scheduleId: scheduleId ?? null,
    createdByName: (req.user as { name?: string } | undefined)?.name ?? "admin",
    createdBy: (req.user as { id?: string } | undefined)?.id ?? null,
  }).returning();

  // Run backup async
  (async () => {
    try {
      const { payload, rowCounts } = await createDatabaseSnapshot(APP_VERSION);
      const { iv, ciphertext } = encryptBackup(JSON.stringify(payload));
      const hash = backupChecksum(ciphertext);
      const sizeBytes = Buffer.byteLength(ciphertext, "base64");

      // Save to disk
      const filename = `backup_${record.id}.enc`;
      fs.writeFileSync(path.join(BACKUP_DIR, filename), ciphertext);

      await db.update(backupRecordsTable).set({
        status: "valid",
        encryptedPayload: ciphertext,
        encryptionIv: iv,
        integrityHash: hash,
        sizeBytes,
        tablesIncluded: payload.manifest,
        recordCounts: rowCounts,
      }).where(eq(backupRecordsTable.id, record.id));

      await logAudit(record.id, "created", "ok", { backupType, rowCounts }, req);
      await logTechEvent("info", "backup", `Copia creada: ${backupType}`, { backupId: record.id });
    } catch (err) {
      await db.update(backupRecordsTable).set({ status: "corrupted" }).where(eq(backupRecordsTable.id, record.id));
      await logAudit(record.id, "created", "error", { error: String(err) }, req);
      await logTechEvent("error", "backup", `Fallo en creación de copia: ${String(err)}`, { backupId: record.id });
    }
  })().catch(() => {});

  res.json({ ok: true, backupId: record.id, message: "Copia iniciada" });
});

// ─── POST /backup/:id/verify ──────────────────────────────────────────────────
router.post("/backup/:id/verify", ...guard, async (req, res) => {
  const id = req.params.id as string;
  const [record] = await db.select().from(backupRecordsTable).where(eq(backupRecordsTable.id, id));
  if (!record) return res.status(404).json({ error: "Copia no encontrada" });

  if (!record.encryptedPayload || !record.integrityHash) {
    return res.status(422).json({ error: "Copia sin payload — no se puede verificar" });
  }

  const hash = backupChecksum(record.encryptedPayload);
  const valid = hash === record.integrityHash;

  await db.update(backupRecordsTable).set({
    verified: valid,
    verifiedAt: new Date(),
    status: valid ? "valid" : "corrupted",
  }).where(eq(backupRecordsTable.id, id));

  await logAudit(id, "verified", valid ? "ok" : "error", { hash, expected: record.integrityHash }, req);
  res.json({ ok: valid, hash, message: valid ? "Integridad verificada" : "Hash no coincide — copia corrupta" });
});

// ─── GET /backup/list ─────────────────────────────────────────────────────────
router.get("/backup/list", ...guard, async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 50), 200);
  const offset = Number(req.query["offset"] ?? 0);
  const type = req.query["type"] as string | undefined;

  const conditions = type ? [eq(backupRecordsTable.backupType, type)] : [];
  const rows = await db.select({
    id: backupRecordsTable.id,
    type: backupRecordsTable.type,
    backupType: backupRecordsTable.backupType,
    appVersion: backupRecordsTable.appVersion,
    status: backupRecordsTable.status,
    sizeBytes: backupRecordsTable.sizeBytes,
    tablesIncluded: backupRecordsTable.tablesIncluded,
    recordCounts: backupRecordsTable.recordCounts,
    integrityHash: backupRecordsTable.integrityHash,
    verified: backupRecordsTable.verified,
    verifiedAt: backupRecordsTable.verifiedAt,
    protected: backupRecordsTable.protected,
    notes: backupRecordsTable.notes,
    createdByName: backupRecordsTable.createdByName,
    createdAt: backupRecordsTable.createdAt,
  }).from(backupRecordsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(backupRecordsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(backupRecordsTable);
  res.json({ data: rows, total: count, limit, offset });
});

// ─── GET /backup/:id/inspect ──────────────────────────────────────────────────
router.get("/backup/:id/inspect", ...guard, async (req, res) => {
  const id = req.params.id as string;
  const [record] = await db.select({
    id: backupRecordsTable.id,
    createdAt: backupRecordsTable.createdAt,
    backupType: backupRecordsTable.backupType,
    status: backupRecordsTable.status,
    sizeBytes: backupRecordsTable.sizeBytes,
    tablesIncluded: backupRecordsTable.tablesIncluded,
    recordCounts: backupRecordsTable.recordCounts,
    integrityHash: backupRecordsTable.integrityHash,
    verified: backupRecordsTable.verified,
    verifiedAt: backupRecordsTable.verifiedAt,
    protected: backupRecordsTable.protected,
    notes: backupRecordsTable.notes,
    appVersion: backupRecordsTable.appVersion,
    createdByName: backupRecordsTable.createdByName,
  }).from(backupRecordsTable).where(eq(backupRecordsTable.id, id));

  if (!record) return res.status(404).json({ error: "Copia no encontrada" });
  res.json(record);
});

// ─── GET /backup/:id/download ─────────────────────────────────────────────────
router.get("/backup/:id/download", ...adminOnly, async (req, res) => {
  const id = req.params.id as string;
  const [record] = await db.select().from(backupRecordsTable).where(eq(backupRecordsTable.id, id));
  if (!record) return res.status(404).json({ error: "Copia no encontrada" });
  if (!record.encryptedPayload) return res.status(422).json({ error: "Copia sin payload" });

  await logAudit(id, "downloaded", "ok", {}, req);

  const filename = `piccolo_backup_${id.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.enc`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "application/octet-stream");
  res.send(Buffer.from(record.encryptedPayload, "base64"));
});

// ─── POST /backup/:id/dry-run ─────────────────────────────────────────────────
router.post("/backup/:id/dry-run", ...guard, async (req, res) => {
  const id = req.params.id as string;
  const [record] = await db.select().from(backupRecordsTable).where(eq(backupRecordsTable.id, id));
  if (!record) return res.status(404).json({ error: "Copia no encontrada" });
  if (!record.encryptedPayload || !record.encryptionIv) {
    return res.status(422).json({ error: "Copia sin payload cifrado" });
  }
  if (!record.integrityHash || backupChecksum(record.encryptedPayload) !== record.integrityHash) {
    await logAudit(id, "test_restored", "error", { reason: "checksum_mismatch" }, req);
    return res.status(422).json({ ok: false, error: "Checksum incorrecto" });
  }
  if (record.appVersion !== APP_VERSION) {
    return res.status(422).json({ ok: false, error: "Versión de backup incompatible" });
  }

  try {
    const plaintext = decryptBackup(record.encryptionIv, record.encryptedPayload);
    const data = await validateBackupForCurrentDatabase(JSON.parse(plaintext));
    const summary = {
      version: data.formatVersion,
      appVersion: data.appVersion,
      createdAt: data.createdAt,
      tables: Object.entries(data.tables).map(([name, rows]) => ({ name, rowCount: rows.length })),
      totalRows: Object.values(data.tables).reduce((s, r) => s + r.length, 0),
    };
    await logAudit(id, "test_restored", "ok", { summary }, req);
    res.json({ ok: true, summary, message: "Dry-run completado — ningún dato modificado" });
  } catch (err) {
    res.status(422).json({ ok: false, error: `No se pudo desencriptar: ${String(err)}` });
  }
});

// ─── POST /backup/:id/restore ─────────────────────────────────────────────────
router.post("/backup/:id/restore", ...adminOnly, backupLimiter, async (req, res) => {
  const id = req.params.id as string;
  const { confirm } = req.body as { confirm?: boolean };
  if (!confirm) return res.status(422).json({ error: "Se requiere confirm:true para restaurar" });

  const [record] = await db.select().from(backupRecordsTable).where(eq(backupRecordsTable.id, id));
  if (!record) return res.status(404).json({ error: "Copia no encontrada" });
  if (!record.encryptedPayload || !record.encryptionIv) {
    return res.status(422).json({ error: "Copia sin payload cifrado" });
  }

  if (!record.integrityHash || backupChecksum(record.encryptedPayload) !== record.integrityHash) {
    await logAudit(id, "restore_rejected", "error", { reason: "checksum_mismatch" }, req);
    return res.status(422).json({ error: "Checksum incorrecto" });
  }
  if (record.appVersion !== APP_VERSION) {
    return res.status(422).json({ error: "Versión de backup incompatible" });
  }

  let payload;
  try {
    payload = validateBackupPayload(
      JSON.parse(decryptBackup(record.encryptionIv, record.encryptedPayload)),
    );
  } catch (err) {
    await logAudit(id, "restore_rejected", "error", { reason: String(err) }, req);
    return res.status(422).json({ error: "La copia no es válida o está incompleta" });
  }

  const preRestoreId = crypto.randomUUID();
  try {
    const { payload: currentPayload, rowCounts } = await createDatabaseSnapshot(APP_VERSION);
    const { iv, ciphertext } = encryptBackup(JSON.stringify(currentPayload));
    const hash = backupChecksum(ciphertext);
    await db.insert(backupRecordsTable).values({
      id: preRestoreId,
      type: "pre-restore",
      backupType: "full",
      appVersion: APP_VERSION,
      status: "valid",
      encryptedPayload: ciphertext,
      encryptionIv: iv,
      integrityHash: hash,
      sizeBytes: Buffer.byteLength(ciphertext, "base64"),
      tablesIncluded: currentPayload.manifest,
      recordCounts: rowCounts,
      verified: true,
      verifiedAt: new Date(),
      notes: `Copia automática pre-restauración desde ${id.slice(0, 8)}`,
      createdByName: (req.user as { name?: string } | undefined)?.name ?? "admin",
      protected: true,
    });
  } catch (err) {
    return res.status(500).json({ error: `Fallo al crear copia de seguridad previa: ${String(err)}` });
  }

  let restored: Record<string, number>;
  try {
    restored = await restoreDatabaseSnapshot(payload);
  } catch (err) {
    await logAudit(id, "restored", "error", {
      error: String(err),
      preRestoreBackupId: preRestoreId,
    }, req);
    return res.status(500).json({
      ok: false,
      error: "La restauración falló y fue revertida completamente",
      preRestoreBackupId: preRestoreId,
    });
  }

  await logAudit(id, "restored", "ok", {
    restored,
    preRestoreBackupId: preRestoreId,
    restoredBy: (req.user as { name?: string } | undefined)?.name ?? "admin",
  }, req);
  await logTechEvent("warning", "backup", `Restauración completada por ${(req.user as { name?: string } | undefined)?.name ?? "admin"}`, {
    backupId: id, preRestoreBackupId: preRestoreId, restored,
  });

  res.json({
    ok: true,
    preRestoreBackupId: preRestoreId,
    restored,
    failed: {},
    message: `Restauración completada — ${Object.values(restored).reduce((s, n) => s + n, 0).toLocaleString()} filas restauradas en ${Object.keys(restored).length} tablas`,
  });
});

// ─── DELETE /backup/:id ───────────────────────────────────────────────────────
router.delete("/backup/:id", ...adminOnly, async (req, res) => {
  const id = req.params.id as string;
  const [record] = await db.select().from(backupRecordsTable).where(eq(backupRecordsTable.id, id));
  if (!record) return res.status(404).json({ error: "Copia no encontrada" });
  if (record.protected) return res.status(403).json({ error: "Copia protegida — no se puede eliminar" });

  await db.update(backupRecordsTable).set({ status: "corrupted", notes: `Eliminada por ${(req.user as { name?: string } | undefined)?.name ?? "admin"}` })
    .where(eq(backupRecordsTable.id, id));
  await logAudit(id, "deleted", "ok", {}, req);
  res.json({ ok: true });
});

// ─── PATCH /backup/:id/protect ────────────────────────────────────────────────
router.patch("/backup/:id/protect", ...adminOnly, async (req, res) => {
  const id = req.params.id as string;
  const { protect = true } = req.body as { protect?: boolean };
  await db.update(backupRecordsTable).set({ protected: protect }).where(eq(backupRecordsTable.id, id));
  res.json({ ok: true, protected: protect });
});

// ─── Schedule helpers ─────────────────────────────────────────────────────────
function computeNextRunAt(frequency: string, hour: number): Date {
  const now = new Date();
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(hour);

  // If the computed time is already in the past, advance by one period
  if (next <= now) {
    switch (frequency) {
      case "hourly":
        next.setTime(now.getTime() + 3_600_000);
        break;
      case "daily":
        next.setDate(next.getDate() + 1);
        break;
      case "weekly":
        next.setDate(next.getDate() + 7);
        break;
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        break;
      default:
        next.setDate(next.getDate() + 1);
    }
  }
  return next;
}

// ─── Schedules CRUD ───────────────────────────────────────────────────────────
router.get("/backup/schedules", ...guard, async (_req, res) => {
  const rows = await db.select().from(backupSchedulesTable).orderBy(backupSchedulesTable.createdAt);
  res.json(rows);
});

router.post("/backup/schedules", ...adminOnly, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const frequency = (body.frequency as string | undefined) ?? "daily";
  const rawHour = body.hour !== undefined ? Number(body.hour) : 3;

  // Validate inputs
  if (!["hourly", "daily", "weekly", "monthly"].includes(frequency)) {
    return res.status(422).json({ error: "frequency debe ser: hourly | daily | weekly | monthly" });
  }
  if (!Number.isInteger(rawHour) || rawHour < 0 || rawHour > 23) {
    return res.status(422).json({ error: "hour debe ser un entero entre 0 y 23" });
  }
  const hour = rawHour;

  const nextRunAt = computeNextRunAt(frequency, hour);

  const [row] = await db.insert(backupSchedulesTable).values({
    name: (body.name as string | undefined) ?? "Programada",
    frequency,
    hour,
    dayOfWeek: body.dayOfWeek != null ? Number(body.dayOfWeek) : null,
    dayOfMonth: body.dayOfMonth != null ? Number(body.dayOfMonth) : null,
    backupType: (body.backupType as string | undefined) ?? "full",
    retention: Number(body.retention ?? 7),
    active: body.active !== false,
    nextRunAt,
    createdBy: (req.user as { id?: string } | undefined)?.id ?? null,
  }).returning();
  res.status(201).json(row);
});

router.put("/backup/schedules/:id", ...adminOnly, async (req, res) => {
  const id = req.params.id as string;
  const body = req.body as Record<string, unknown>;
  const [row] = await db.update(backupSchedulesTable)
    .set({ ...body, updatedAt: new Date() } as Partial<typeof backupSchedulesTable.$inferInsert>)
    .where(eq(backupSchedulesTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "No encontrado" });
  res.json(row);
});

router.delete("/backup/schedules/:id", ...adminOnly, async (req, res) => {
  const id = req.params.id as string;
  await db.delete(backupSchedulesTable).where(eq(backupSchedulesTable.id, id));
  res.json({ ok: true });
});

// ─── Destinations CRUD ────────────────────────────────────────────────────────
router.get("/backup/destinations", ...guard, async (_req, res) => {
  const rows = await db.select().from(backupDestinationsTable);
  res.json(rows);
});

router.post("/backup/destinations", ...adminOnly, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const [row] = await db.insert(backupDestinationsTable).values({
    name: body.name as string ?? "Interno",
    destType: body.destType as string ?? "internal",
    config: (body.config as Record<string, unknown>) ?? {},
    active: body.active !== false,
  }).returning();
  res.status(201).json(row);
});

router.delete("/backup/destinations/:id", ...adminOnly, async (req, res) => {
  const id = req.params.id as string;
  await db.delete(backupDestinationsTable).where(eq(backupDestinationsTable.id, id));
  res.json({ ok: true });
});

const EMERGENCY_EXPORTERS = {
  ventas: () => db.select().from(ticketsTable),
  caja: () => db.select().from(cashSessionsTable),
  clientes: () => db.select().from(crmClientsTable),
  empleados: () => db.select({
    id: employeesTable.id,
    name: employeesTable.name,
    role: employeesTable.role,
    active: employeesTable.active,
    employeeNumber: employeesTable.employeeNumber,
    createdAt: employeesTable.createdAt,
  }).from(employeesTable),
  productos: () => db.select().from(productsTable),
  stock: () => db.select().from(ingredientsTable),
  reservas: () => db.select().from(reservationsTable),
} as const;

type EmergencyModule = keyof typeof EMERGENCY_EXPORTERS;

// ─── POST /backup/emergency-export ────────────────────────────────────────────
router.post("/backup/emergency-export", requireAuth, backupLimiter, async (req, res) => {
  if (req.user?.role !== "admin") {
    await logAudit(null, "emergency_export_denied", "error", {
      role: req.user?.role ?? "unknown",
      requestedModules: req.body?.modules ?? null,
    }, req);
    return res.status(403).json({ error: "Solo un administrador puede realizar esta exportación" });
  }
  const { modules = ["all"], format = "json" } = req.body as { modules?: string[]; format?: string };
  if (!Array.isArray(modules) || modules.length === 0 || !modules.every((value) => typeof value === "string")) {
    await logAudit(null, "emergency_export_rejected", "error", { reason: "invalid_modules" }, req);
    return res.status(422).json({ error: "modules debe ser una lista no vacía" });
  }
  if (!["json", "csv", "xlsx"].includes(format)) {
    await logAudit(null, "emergency_export_rejected", "error", { reason: "invalid_format" }, req);
    return res.status(422).json({ error: "Formato no soportado" });
  }

  const tables: Record<string, unknown[]> = {};
  const allowedModules = Object.keys(EMERGENCY_EXPORTERS) as EmergencyModule[];
  const requested = modules.includes("all") ? allowedModules : modules;
  const invalid = requested.filter((module) => !allowedModules.includes(module as EmergencyModule));
  if (invalid.length > 0 || (modules.includes("all") && modules.length !== 1)) {
    await logAudit(null, "emergency_export_rejected", "error", {
      reason: "forbidden_modules",
      modules: invalid,
    }, req);
    return res.status(422).json({ error: "Módulo inexistente o prohibido", modules: invalid });
  }

  for (const module of requested as EmergencyModule[]) {
    tables[module] = await EMERGENCY_EXPORTERS[module]();
  }
  await logAudit(null, "emergency_export", "ok", {
    modules: requested,
    format,
    rowCounts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
  }, req);

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    for (const [name, rows] of Object.entries(tables)) {
      const ws = wb.addWorksheet(name.slice(0, 31));
      if ((rows as object[]).length > 0) {
        ws.columns = Object.keys((rows as object[])[0] as object).map((k) => ({ header: k, key: k, width: 18 }));
        ws.addRows(rows as object[]);
      }
    }
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    res.setHeader("Content-Disposition", `attachment; filename="piccolo_export_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buf);
  }

  if (format === "csv") {
    const lines: string[] = [];
    for (const [name, rows] of Object.entries(tables)) {
      if (rows.length === 0) continue;
      lines.push(`\n## ${name}`);
      const keys = Object.keys(rows[0] as object);
      lines.push(keys.join(","));
      for (const row of rows) {
        lines.push(keys.map((k) => JSON.stringify((row as Record<string, unknown>)[k] ?? "")).join(","));
      }
    }
    res.setHeader("Content-Disposition", `attachment; filename="piccolo_export_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.send(lines.join("\n"));
  }

  // JSON
  res.setHeader("Content-Disposition", `attachment; filename="piccolo_export_${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader("Content-Type", "application/json");
  res.json({ exportedAt: new Date().toISOString(), tables });
});

// ─── POST /backup/demo-data ───────────────────────────────────────────────────
router.post("/backup/demo-data", ...adminOnly, async (_req, res) => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);

  const [d1] = await db.insert(backupRecordsTable).values({
    type: "auto", backupType: "full", appVersion: APP_VERSION,
    status: "valid", verified: true, verifiedAt: yesterday,
    sizeBytes: 2_450_000, tablesIncluded: ["tickets", "orders", "employees"],
    recordCounts: { tickets: 1200, orders: 3500, employees: 8 },
    integrityHash: backupChecksum("demo-hash-1"), notes: "Demo copia completa verificada",
    createdByName: "Sistema", isDemo: true,
  }).returning();

  const [d2] = await db.insert(backupRecordsTable).values({
    type: "manual", backupType: "config", appVersion: APP_VERSION,
    status: "corrupted", verified: false,
    sizeBytes: 45_000, tablesIncluded: ["business_config"],
    recordCounts: { business_config: 1 },
    notes: "Demo copia fallida",
    createdByName: "Admin", isDemo: true,
  }).returning();

  const [sched] = await db.insert(backupSchedulesTable).values({
    name: "Copia diaria automática",
    frequency: "daily", hour: 3, backupType: "full", retention: 7,
    active: true, lastStatus: "ok", lastRunAt: yesterday,
    nextRunAt: new Date(now.getTime() + 86400000),
  }).returning();

  await db.insert(techEventsTable).values([
    { level: "error", module: "backup", message: "Fallo en copia programada: disco lleno", isDemo: true, data: { backupId: d2.id } },
    { level: "warning", module: "printer", message: "Impresora cocina sin respuesta > 15min", isDemo: true },
    { level: "info", module: "offline", message: "Dispositivo TPV-01 sincronizado: 3 operaciones enviadas", isDemo: true },
  ]);

  res.json({ ok: true, created: { backup1: d1.id, backup2: d2.id, schedule: sched.id } });
});

// ─── DELETE /backup/demo-data ─────────────────────────────────────────────────
router.delete("/backup/demo-data", ...adminOnly, async (_req, res) => {
  await db.delete(backupRecordsTable).where(eq(backupRecordsTable.isDemo, true));
  await db.delete(backupSchedulesTable).where(eq(backupSchedulesTable.active, false));
  await db.delete(techEventsTable).where(eq(techEventsTable.isDemo, true));
  res.json({ ok: true });
});

export default router;
