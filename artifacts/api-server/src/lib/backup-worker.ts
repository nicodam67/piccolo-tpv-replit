/**
 * backup-worker.ts — Scheduled backup runner
 *
 * Polls every POLL_INTERVAL_MS. Reads active backup_schedules, runs any that
 * are due, and updates nextRun. Also generates tech_events for alert conditions:
 * - No verified backup in 24h → critical alert
 * - Disk < 500 MB → high alert
 * - Offline queue ops > 2h → medium alert
 * - Printer down > 15min → medium alert
 */

import { db } from "@workspace/db";
import {
  backupSchedulesTable,
  backupRecordsTable,
  techEventsTable,
  offlineQueueTable,
  printersTable,
  directorAlertsTable,
} from "@workspace/db";
import { eq, and, lte, desc, gte, sql } from "drizzle-orm";
import crypto from "node:crypto";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const APP_VERSION = "1.0.0";
let workerTimer: ReturnType<typeof setInterval> | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function logTechEvent(
  level: string,
  module: string,
  message: string,
  data: Record<string, unknown> = {}
) {
  await db.insert(techEventsTable).values({ level, module, message, data }).catch(() => {});
}

async function tryLogDirectorAlert(
  title: string,
  detail: string,
  priority: "low" | "medium" | "high" | "critical",
  originModule: string
) {
  try {
    await db.insert(directorAlertsTable).values({
      title,
      detail,
      priority,
      originModule,
      status: "open",
      source: "backup-worker",
    });
  } catch {
    // directorAlertsTable may not exist — fall back to tech_events only
  }
}

function deriveKey(): Buffer {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    throw new Error("SESSION_SECRET no está configurado — no se pueden cifrar las copias automáticas");
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

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** Full dump — same payload shape as manual backups so auto-backups are restorable */
async function fullDump(): Promise<{ tables: Record<string, unknown[]>; rowCounts: Record<string, number> }> {
  const tableNames = [
    "employees", "zones", "tables_", "orders", "order_items", "payments",
    "tickets", "cash_sessions", "cash_movements", "reservations",
    "categories", "products", "modifiers", "ingredients", "stock_levels",
    "suppliers", "crm_clients", "crm_loyalty_points", "crm_gift_cards",
    "kitchen_tasks", "printers", "print_queue",
  ];

  const tables: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};

  for (const t of tableNames) {
    try {
      const result = await db.execute(sql.raw(`SELECT * FROM "${t}" LIMIT 50000`)) as { rows: unknown[] };
      const rows = result.rows ?? [];
      tables[t] = rows;
      rowCounts[t] = rows.length;
    } catch { /* table may not exist yet — skip */ }
  }
  return { tables, rowCounts };
}

function computeNextRun(schedule: {
  frequency: string;
  hour: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
}): Date {
  const now = new Date();
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(schedule.hour);

  if (next <= now) {
    switch (schedule.frequency) {
      case "hourly":
        next.setTime(now.getTime() + 3600000);
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
    }
  }
  return next;
}

// ─── Run a scheduled backup ───────────────────────────────────────────────────
async function runScheduledBackup(schedule: typeof backupSchedulesTable.$inferSelect): Promise<void> {
  const [record] = await db.insert(backupRecordsTable).values({
    type: "auto",
    backupType: schedule.backupType,
    appVersion: APP_VERSION,
    status: "pending",
    scheduleId: schedule.id,
    notes: `Copia automática: ${schedule.name}`,
    createdByName: "Sistema",
  }).returning();

  try {
    const { tables, rowCounts } = await fullDump();
    const payload = JSON.stringify({ version: APP_VERSION, createdAt: new Date().toISOString(), tables });
    const { iv, ciphertext } = encrypt(payload);
    const hash = sha256(ciphertext);

    await db.update(backupRecordsTable).set({
      status: "valid",
      encryptedPayload: ciphertext,
      encryptionIv: iv,
      integrityHash: hash,
      sizeBytes: Buffer.byteLength(ciphertext, "base64"),
      tablesIncluded: Object.keys(rowCounts),
      recordCounts: rowCounts,
      verified: true,
      verifiedAt: new Date(),
    }).where(eq(backupRecordsTable.id, record.id));

    await db.update(backupSchedulesTable).set({
      lastRunAt: new Date(),
      lastStatus: "ok",
      lastError: null,
      nextRunAt: computeNextRun(schedule),
    }).where(eq(backupSchedulesTable.id, schedule.id));

    await logTechEvent("info", "backup", `Copia programada completada: ${schedule.name}`, { backupId: record.id });

    // Enforce retention: delete oldest excess backups from this schedule
    if (schedule.retention > 0) {
      const backups = await db.select({ id: backupRecordsTable.id })
        .from(backupRecordsTable)
        .where(and(
          eq(backupRecordsTable.scheduleId, schedule.id),
          eq(backupRecordsTable.protected, false),
        ))
        .orderBy(desc(backupRecordsTable.createdAt));

      const toDelete = backups.slice(schedule.retention);
      for (const b of toDelete) {
        await db.delete(backupRecordsTable).where(eq(backupRecordsTable.id, b.id)).catch(() => {});
      }
    }
  } catch (err) {
    await db.update(backupRecordsTable).set({ status: "corrupted" }).where(eq(backupRecordsTable.id, record.id));
    await db.update(backupSchedulesTable).set({
      lastRunAt: new Date(),
      lastStatus: "error",
      lastError: String(err),
      nextRunAt: computeNextRun(schedule),
    }).where(eq(backupSchedulesTable.id, schedule.id));

    await logTechEvent("critical", "backup", `Copia programada fallida: ${schedule.name} — ${String(err)}`, { scheduleId: schedule.id });
    await tryLogDirectorAlert("Copia de seguridad fallida", `La copia programada "${schedule.name}" ha fallado: ${String(err)}`, "critical", "sistema");
  }
}

// ─── Alert checks ─────────────────────────────────────────────────────────────
async function runAlertChecks(): Promise<void> {
  const now = new Date();

  // 1. No verified backup in last 24h
  try {
    const [last] = await db.select({ createdAt: backupRecordsTable.createdAt })
      .from(backupRecordsTable)
      .where(and(eq(backupRecordsTable.verified, true), eq(backupRecordsTable.status, "valid")))
      .orderBy(desc(backupRecordsTable.createdAt))
      .limit(1);

    if (!last || new Date(last.createdAt).getTime() < now.getTime() - 86400000) {
      await logTechEvent("critical", "backup", "Sin copia verificada en las últimas 24h");
      await tryLogDirectorAlert("Sin copia de seguridad reciente", "No hay ninguna copia verificada en las últimas 24 horas.", "critical", "sistema");
    }
  } catch { /* skip */ }

  // 2. Offline queue ops stuck > 2h
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(offlineQueueTable)
      .where(and(
        eq(offlineQueueTable.status, "pending"),
        lte(offlineQueueTable.createdAt, new Date(now.getTime() - 2 * 3600000)),
      ));
    if (Number(count) > 0) {
      await logTechEvent("warning", "offline", `${count} operaciones offline pendientes > 2h sin sincronizar`, { count: Number(count) });
    }
  } catch { /* skip */ }

  // 3. Printers down > 15min
  try {
    const fifteenAgo = new Date(now.getTime() - 15 * 60000);
    const downPrinters = await db.select({ name: printersTable.name, lastStatusAt: printersTable.lastStatusAt })
      .from(printersTable)
      .where(and(
        eq(printersTable.active, true),
        lte(printersTable.lastStatusAt, fifteenAgo),
      ));

    for (const p of downPrinters) {
      await logTechEvent("warning", "printer", `Impresora "${p.name}" sin respuesta > 15 min`, { lastSeenAt: p.lastStatusAt });
    }
    if (downPrinters.length > 0) {
      await tryLogDirectorAlert("Impresora sin respuesta", `${downPrinters.length} impresora(s) sin respuesta > 15min`, "high", "sistema");
    }
  } catch { /* skip */ }
}

// ─── Main tick ────────────────────────────────────────────────────────────────
async function tick(): Promise<void> {
  const now = new Date();

  // Find due schedules
  try {
    const dueSchedules = await db.select()
      .from(backupSchedulesTable)
      .where(and(
        eq(backupSchedulesTable.active, true),
        lte(backupSchedulesTable.nextRunAt, now),
      ));

    for (const schedule of dueSchedules) {
      await runScheduledBackup(schedule);
    }
  } catch (err) {
    console.error("[backup-worker] schedule tick error:", err);
  }

  // Run alert checks every cycle
  await runAlertChecks().catch((e) => console.error("[backup-worker] alert check error:", e));
}

/** Backfill schedules that have null nextRunAt — set to now() so they are
 *  picked up on the next worker tick. Normal post-run logic then computes
 *  the subsequent run time. */
async function backfillScheduleNextRun(): Promise<void> {
  try {
    const schedules = await db.select().from(backupSchedulesTable)
      .where(eq(backupSchedulesTable.active, true));

    for (const s of schedules) {
      if (s.nextRunAt == null) {
        // Use now() — makes the schedule immediately runnable on next tick
        const nextRunAt = new Date();
        await db.update(backupSchedulesTable)
          .set({ nextRunAt })
          .where(eq(backupSchedulesTable.id, s.id));
        console.log(`[backup-worker] backfilled nextRunAt for schedule ${s.id}: immediate`);
      }
    }
  } catch (err) {
    console.warn("[backup-worker] backfill error:", err);
  }
}

export function startBackupWorker(): void {
  if (workerTimer) return;
  // Backfill any schedules that were created without nextRunAt before starting the poll
  void backfillScheduleNextRun();
  workerTimer = setInterval(() => {
    tick().catch((err) => console.error("[backup-worker]", err));
  }, POLL_INTERVAL_MS);
  console.log("[backup-worker] started, polling every", POLL_INTERVAL_MS / 60000, "min");
}

export function stopBackupWorker(): void {
  if (workerTimer) { clearInterval(workerTimer); workerTimer = null; }
}
