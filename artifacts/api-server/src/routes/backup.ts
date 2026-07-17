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
import { db } from "@workspace/db";
import {
  backupRecordsTable,
  backupAuditLogTable,
  backupSchedulesTable,
  backupDestinationsTable,
  techEventsTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import ExcelJS from "exceljs";

const router = Router();
const guard = [requireAuth, requireRole("admin", "manager")];
const adminOnly = [requireAuth, requireRole("admin")];

const BACKUP_DIR = "/tmp/piccolo-backups";
const APP_VERSION = "1.0.0";

// Ensure backup directory exists
try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch {}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function deriveKey(): Buffer {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    throw new Error("SESSION_SECRET no está configurado — las copias de seguridad cifradas no están disponibles");
  }
  return crypto.scryptSync(secret, "piccolo-backup-salt-v1", 32);
}

function encrypt(plaintext: string): { iv: string; ciphertext: string } {
  const key = deriveKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { iv: iv.toString("hex"), ciphertext: encrypted.toString("base64") };
}

function decrypt(iv: string, ciphertext: string): string {
  const key = deriveKey();
  const ivBuf = Buffer.from(iv, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, ivBuf);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** Dump all rows from every registered table into a JSON object */
async function dumpAllTables(): Promise<{ tables: Record<string, unknown[]>; rowCounts: Record<string, number> }> {
  const tableNames = [
    "employees", "zones", "tables_", "orders", "order_items", "payments",
    "tickets", "cash_sessions", "cash_movements", "reservations",
    "categories", "products", "modifiers", "ingredients", "stock_levels",
    "suppliers", "crm_clients", "crm_loyalty_points", "crm_gift_cards",
    "kitchen_tasks", "printers", "print_queue",
  ];

  const tables: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};

  for (const name of tableNames) {
    try {
      const result = await db.execute(sql.raw(`SELECT * FROM "${name}" LIMIT 50000`)) as { rows: unknown[] };
      const rows = result.rows ?? [];
      tables[name] = rows;
      rowCounts[name] = rows.length;
    } catch {
      // Table may not exist — skip silently
    }
  }
  return { tables, rowCounts };
}

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
router.post("/backup/create", ...guard, async (req, res) => {
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
      const { tables, rowCounts } = await dumpAllTables();
      const payload = JSON.stringify({ version: APP_VERSION, createdAt: new Date().toISOString(), tables });
      const { iv, ciphertext } = encrypt(payload);
      const hash = sha256(ciphertext);
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
        tablesIncluded: Object.keys(rowCounts),
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

  const hash = sha256(record.encryptedPayload);
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
  const rows = await db.select().from(backupRecordsTable)
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

  try {
    const plaintext = decrypt(record.encryptionIv, record.encryptedPayload);
    const data = JSON.parse(plaintext) as { version: string; createdAt: string; tables: Record<string, unknown[]> };
    const summary = {
      version: data.version,
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
router.post("/backup/:id/restore", ...adminOnly, async (req, res) => {
  const id = req.params.id as string;
  const { confirm } = req.body as { confirm?: boolean };
  if (!confirm) return res.status(422).json({ error: "Se requiere confirm:true para restaurar" });

  const [record] = await db.select().from(backupRecordsTable).where(eq(backupRecordsTable.id, id));
  if (!record) return res.status(404).json({ error: "Copia no encontrada" });
  if (!record.encryptedPayload || !record.encryptionIv) {
    return res.status(422).json({ error: "Copia sin payload cifrado" });
  }

  // Step 1: Decrypt and parse the backup payload
  let tables: Record<string, unknown[]>;
  try {
    const plaintext = decrypt(record.encryptionIv, record.encryptedPayload);
    const parsed = JSON.parse(plaintext) as { version: string; createdAt: string; tables: Record<string, unknown[]> };
    tables = parsed.tables;
  } catch (err) {
    return res.status(422).json({ error: `No se pudo desencriptar la copia: ${String(err)}` });
  }

  // Step 2: Take a pre-restore safety backup
  const preRestoreId = crypto.randomUUID();
  try {
    const { tables: currentTables, rowCounts } = await dumpAllTables();
    const prePayload = JSON.stringify({ version: APP_VERSION, createdAt: new Date().toISOString(), tables: currentTables });
    const { iv, ciphertext } = encrypt(prePayload);
    const hash = sha256(ciphertext);
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
      tablesIncluded: Object.keys(rowCounts),
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

  // Step 3: Restore tables — disable FK checks, truncate, insert, re-enable
  //
  // Strategy: json_populate_recordset delegates column-type casting to
  // PostgreSQL, handles jsonb natively, and works in one statement per chunk
  // regardless of row shape. Empty tables are still truncated so production
  // state after restore exactly mirrors the backup (no stale rows remain).
  const restored: Record<string, number> = {};
  const failed: Record<string, string> = {};

  try {
    await db.execute(sql`SET session_replication_role = 'replica'`);

    for (const [tableName, rows] of Object.entries(tables)) {
      if (!Array.isArray(rows)) continue; // malformed entry — skip

      // Sanitise table name to prevent SQL injection (only alnum + _ + -)
      if (!/^[a-zA-Z0-9_-]+$/.test(tableName)) {
        failed[tableName] = "Invalid table name — skipped for safety";
        continue;
      }

      try {
        // Always truncate — empty backup rows means "table was empty at backup time"
        await db.execute(
          sql.raw(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`)
        );

        if (rows.length === 0) {
          restored[tableName] = 0;
          continue;
        }

        // Insert in 10 000-row chunks via json_populate_recordset.
        // Single-quote escaping: replace each ' with '' (SQL standard).
        const CHUNK = 10_000;
        let insertedTotal = 0;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const chunk = rows.slice(i, i + CHUNK);
          // Escape single quotes inside the serialised JSON
          const escapedJson = JSON.stringify(chunk).replace(/'/g, "''");
          await db.execute(
            sql.raw(
              `INSERT INTO "${tableName}" SELECT * FROM json_populate_recordset(null::"${tableName}", '${escapedJson}'::json)`
            )
          );
          insertedTotal += chunk.length;
        }

        restored[tableName] = insertedTotal;
      } catch (err) {
        failed[tableName] = String(err);
      }
    }
  } finally {
    // Always re-enable FK checks regardless of errors
    await db.execute(sql`SET session_replication_role = 'DEFAULT'`).catch(() => {});
  }

  await logAudit(id, "restored", Object.keys(failed).length === 0 ? "ok" : "error", {
    restored,
    failed,
    preRestoreBackupId: preRestoreId,
    restoredBy: (req.user as { name?: string } | undefined)?.name ?? "admin",
  }, req);
  await logTechEvent("warning", "backup", `Restauración completada por ${(req.user as { name?: string } | undefined)?.name ?? "admin"}`, {
    backupId: id, preRestoreBackupId: preRestoreId, restored, failed,
  });

  res.json({
    ok: Object.keys(failed).length === 0,
    preRestoreBackupId: preRestoreId,
    restored,
    failed,
    message: Object.keys(failed).length === 0
      ? `Restauración completada — ${Object.values(restored).reduce((s, n) => s + n, 0).toLocaleString()} filas restauradas en ${Object.keys(restored).length} tablas`
      : `Restauración parcial — ${Object.keys(failed).length} tabla(s) fallaron`,
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
    .set({ ...body as Parameters<typeof db.update>[0], updatedAt: new Date() })
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

// ─── POST /backup/emergency-export ────────────────────────────────────────────
router.post("/backup/emergency-export", ...guard, async (req, res) => {
  const { modules = ["all"], format = "json" } = req.body as { modules?: string[]; format?: string };

  const tables: Record<string, unknown[]> = {};
  const tableMap: Record<string, string> = {
    ventas: "tickets",
    caja: "cash_sessions",
    clientes: "crm_clients",
    empleados: "employees",
    productos: "products",
    stock: "stock_levels",
    reservas: "reservations",
  };

  const toExport = modules.includes("all") ? Object.values(tableMap) : modules.map((m) => tableMap[m] ?? m);

  for (const tableName of toExport) {
    try {
      const result = await db.execute(sql.raw(`SELECT * FROM "${tableName}" LIMIT 100000`)) as { rows: unknown[] };
      tables[tableName] = result.rows ?? [];
    } catch { /* skip */ }
  }

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
    integrityHash: sha256("demo-hash-1"), notes: "Demo copia completa verificada",
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
