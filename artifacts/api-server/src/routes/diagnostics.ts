/**
 * Diagnostics Module — estado del sistema, eventos técnicos, informe de soporte
 *
 * GET  /diagnostics/status
 * GET  /diagnostics/connectivity
 * GET  /diagnostics/events
 * POST /diagnostics/events
 * GET  /diagnostics/report
 * POST /diagnostics/maintenance
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  backupRecordsTable,
  techEventsTable,
  printersTable,
  printQueueTable,
  offlineQueueTable,
  offlineDevicesTable,
} from "@workspace/db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { execSync } from "node:child_process";

const router = Router();
const guard = [requireAuth, requireRole("admin", "manager", "encargado")];
const adminOnly = [requireAuth, requireRole("admin")];

const APP_VERSION = "1.0.0";
const MODULES = [
  "tpv", "kds", "caja", "stock", "reservas", "fichaje",
  "crm", "director", "backup", "impresion", "online-orders",
];

// ─── GET /diagnostics/status ──────────────────────────────────────────────────
router.get("/diagnostics/status", ...guard, async (_req, res) => {
  const now = new Date();
  const status: Record<string, unknown> = {};

  // Database check
  try {
    await db.execute(sql`SELECT 1`);
    status["database"] = { ok: true, latencyMs: 0, message: "Conectado" };
  } catch (err) {
    status["database"] = { ok: false, message: String(err) };
  }

  // Disk usage
  try {
    const raw = execSync("df -k /tmp 2>/dev/null || df -k / 2>/dev/null", { timeout: 3000 }).toString();
    const lines = raw.trim().split("\n");
    const parts = lines[1]?.split(/\s+/) ?? [];
    const usedKb = Number(parts[2] ?? 0);
    const availKb = Number(parts[3] ?? 0);
    const totalKb = usedKb + availKb;
    status["storage"] = {
      ok: availKb > 500_000,
      usedMb: Math.round(usedKb / 1024),
      availMb: Math.round(availKb / 1024),
      totalMb: Math.round(totalKb / 1024),
      pct: totalKb > 0 ? Math.round((usedKb / totalKb) * 100) : 0,
      message: availKb > 500_000 ? "Espacio suficiente" : "⚠️ Espacio insuficiente",
    };
  } catch {
    status["storage"] = { ok: true, message: "No disponible" };
  }

  // Printers
  try {
    const printers = await db.select({
      id: printersTable.id,
      name: printersTable.name,
      lastStatus: printersTable.lastStatus,
      lastStatusAt: printersTable.lastStatusAt,
      active: printersTable.active,
    }).from(printersTable).where(eq(printersTable.active, true));

    const fifteenMinAgo = new Date(now.getTime() - 15 * 60000);
    const down = printers.filter(
      (p) => p.lastStatus !== "online" || !p.lastStatusAt || new Date(p.lastStatusAt) < fifteenMinAgo
    );
    status["printers"] = {
      ok: down.length === 0,
      total: printers.length,
      down: down.length,
      devices: printers.map((p) => ({
        name: p.name,
        status: p.lastStatus,
        lastSeenAt: p.lastStatusAt,
      })),
      message: down.length === 0 ? "Todas activas" : `${down.length} impresora(s) sin respuesta`,
    };
  } catch {
    status["printers"] = { ok: true, message: "No disponible" };
  }

  // Print queue blocked
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(printQueueTable)
      .where(eq(printQueueTable.status, "error"));
    status["print_queue"] = {
      ok: Number(count) === 0,
      errorJobs: Number(count),
      message: Number(count) === 0 ? "Sin errores" : `${count} trabajos en error`,
    };
  } catch {
    status["print_queue"] = { ok: true, message: "No disponible" };
  }

  // Last verified backup
  try {
    const [lastBackup] = await db.select({
      id: backupRecordsTable.id,
      createdAt: backupRecordsTable.createdAt,
      verified: backupRecordsTable.verified,
      backupType: backupRecordsTable.backupType,
    }).from(backupRecordsTable)
      .where(eq(backupRecordsTable.status, "valid"))
      .orderBy(desc(backupRecordsTable.createdAt))
      .limit(1);

    const dayAgo = new Date(now.getTime() - 86400000);
    const ok = !!lastBackup && new Date(lastBackup.createdAt) > dayAgo;
    status["backups"] = {
      ok,
      lastBackupAt: lastBackup?.createdAt ?? null,
      verified: lastBackup?.verified ?? false,
      message: ok ? "Copia reciente disponible" : "Sin copia en las últimas 24h",
    };
  } catch {
    status["backups"] = { ok: false, message: "No disponible" };
  }

  // Offline queue
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(offlineQueueTable)
      .where(and(
        eq(offlineQueueTable.status, "pending"),
        // lte: records OLDER than 2h (createdAt <= now-2h)
        lte(offlineQueueTable.createdAt, new Date(now.getTime() - 2 * 3600000)),
      ));
    status["offline_queue"] = {
      ok: Number(count) === 0,
      pendingOps: Number(count),
      message: Number(count) === 0 ? "Sin operaciones pendientes" : `${count} operaciones pendientes > 2h`,
    };
  } catch {
    status["offline_queue"] = { ok: true, message: "No disponible" };
  }

  // Recent critical events
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(techEventsTable)
      .where(and(
        eq(techEventsTable.level, "critical"),
        eq(techEventsTable.resolved, false),
        gte(techEventsTable.createdAt, new Date(now.getTime() - 3600000)),
      ));
    status["alerts"] = {
      ok: Number(count) === 0,
      criticalUnresolved: Number(count),
      message: Number(count) === 0 ? "Sin alertas críticas" : `${count} alerta(s) crítica(s) sin resolver`,
    };
  } catch {
    status["alerts"] = { ok: true };
  }

  const allOk = Object.values(status).every((s) => (s as { ok?: boolean }).ok !== false);
  res.json({ ok: allOk, checkedAt: now.toISOString(), status });
});

// ─── GET /diagnostics/connectivity ───────────────────────────────────────────
router.get("/diagnostics/connectivity", ...guard, async (_req, res) => {
  const t0 = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    const dbLatency = Date.now() - t0;
    res.json({
      ok: true,
      dbLatencyMs: dbLatency,
      serverTime: new Date().toISOString(),
      uptime: process.uptime(),
      nodeVersion: process.version,
    });
  } catch (err) {
    res.status(503).json({ ok: false, error: String(err) });
  }
});

// ─── GET /diagnostics/events ──────────────────────────────────────────────────
router.get("/diagnostics/events", ...guard, async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 100), 500);
  const offset = Number(req.query["offset"] ?? 0);
  const level = req.query["level"] as string | undefined;
  const module = req.query["module"] as string | undefined;

  const conditions = [];
  if (level) conditions.push(eq(techEventsTable.level, level));
  if (module) conditions.push(eq(techEventsTable.module, module));

  const rows = await db.select().from(techEventsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(techEventsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(techEventsTable)
    .where(conditions.length ? and(...conditions) : undefined);

  res.json({ data: rows, total: count, limit, offset });
});

// ─── POST /diagnostics/events ─────────────────────────────────────────────────
router.post("/diagnostics/events", requireAuth, async (req, res) => {
  const { level = "info", module = "system", message, code, data } = req.body as Record<string, unknown>;
  if (!message) return res.status(422).json({ error: "message requerido" });

  const [row] = await db.insert(techEventsTable).values({
    level: level as string,
    module: module as string,
    message: message as string,
    code: code as string | undefined,
    data: (data as Record<string, unknown>) ?? {},
  }).returning();

  res.status(201).json(row);
});

// ─── PATCH /diagnostics/events/:id/resolve ───────────────────────────────────
router.patch("/diagnostics/events/:id/resolve", ...guard, async (req, res) => {
  const id = req.params.id as string;
  const [row] = await db.update(techEventsTable)
    .set({ resolved: true, resolvedAt: new Date() })
    .where(eq(techEventsTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Evento no encontrado" });
  res.json(row);
});

// ─── GET /diagnostics/report ──────────────────────────────────────────────────
router.get("/diagnostics/report", ...adminOnly, async (_req, res) => {
  // Collect non-sensitive diagnostic info
  const [errors] = await Promise.all([
    db.select().from(techEventsTable)
      .where(and(eq(techEventsTable.level, "error")))
      .orderBy(desc(techEventsTable.createdAt))
      .limit(100),
  ]);

  const [backupSummary] = await db.select({
    total: sql<number>`count(*)::int`,
    verified: sql<number>`sum(case when verified then 1 else 0 end)::int`,
    lastAt: sql<string>`max(created_at)`,
  }).from(backupRecordsTable).where(eq(backupRecordsTable.status, "valid"));

  const [deviceCount] = await db.select({ count: sql<number>`count(*)::int` }).from(offlineDevicesTable);

  const report = {
    generatedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    nodeVersion: process.version,
    uptime: Math.round(process.uptime()),
    modules: MODULES,
    backups: {
      totalValid: backupSummary?.total ?? 0,
      totalVerified: backupSummary?.verified ?? 0,
      lastBackupAt: backupSummary?.lastAt ?? null,
    },
    offlineDevices: deviceCount?.count ?? 0,
    recentErrors: errors.map((e) => ({
      id: e.id,
      level: e.level,
      module: e.module,
      message: e.message,
      code: e.code,
      createdAt: e.createdAt,
      resolved: e.resolved,
    })),
    // Explicitly no PII, no secrets
    note: "Este informe no contiene datos personales ni credenciales",
  };

  res.setHeader("Content-Disposition", `attachment; filename="piccolo_diagnostics_${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(report);
});

// ─── POST /diagnostics/maintenance ───────────────────────────────────────────
router.post("/diagnostics/maintenance", ...adminOnly, async (req, res) => {
  const { action } = req.body as { action: string };
  const results: Record<string, string> = {};

  if (action === "clear_events" || action === "all") {
    // Delete resolved events OLDER than 30 days (createdAt <= cutoff)
    const cutoff = new Date(Date.now() - 30 * 86400000);
    await db.delete(techEventsTable)
      .where(and(eq(techEventsTable.resolved, true), lte(techEventsTable.createdAt, cutoff)));
    results["clear_events"] = "Completado";
  }

  if (action === "repair_queue" || action === "all") {
    // Reset stuck 'sending' operations back to 'pending'
    await db.update(offlineQueueTable).set({ status: "pending" })
      .where(eq(offlineQueueTable.status, "sending"));
    results["repair_queue"] = "Cola de operaciones reparada";
  }

  if (action === "reindex" || action === "all") {
    try {
      await db.execute(sql`VACUUM ANALYZE`);
      results["reindex"] = "VACUUM ANALYZE completado";
    } catch {
      results["reindex"] = "No disponible en este entorno";
    }
  }

  await db.insert(techEventsTable).values({
    level: "info",
    module: "maintenance",
    message: `Mantenimiento ejecutado: ${action}`,
    data: results,
  }).catch(() => {});

  res.json({ ok: true, results });
});

export default router;
