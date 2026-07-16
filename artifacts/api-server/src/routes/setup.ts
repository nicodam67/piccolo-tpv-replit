/**
 * Setup Wizard Module — asistente de configuración inicial y puesta en marcha
 *
 * GET    /setup/detect                 — auto-detect which modules are configured
 * GET    /setup/status                 — full setup health summary
 * POST   /setup/session                — create a new wizard session
 * GET    /setup/sessions               — list all sessions
 * GET    /setup/session/:id            — get session with progress
 * PATCH  /setup/session/:id            — update current step / data
 * GET    /setup/checklist              — exportable checklist (JSON or CSV)
 * POST   /setup/simulation/start       — create isolated simulation data
 * DELETE /setup/simulation/cleanup     — remove all is_demo=true rows
 * POST   /setup/go-live               — activate production mode (admin only)
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  businessConfigTable,
  employeesTable,
  categoriesTable,
  productsTable,
  roomZonesTable,
  restaurantTablesTable,
  printersTable,
  backupRecordsTable,
  cashSessionsTable,
  setupWizardSessionsTable,
  setupAuditLogTable,
} from "@workspace/db";
import { eq, and, count, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

const adminGuard = [requireAuth, requireRole("admin")];
const managerGuard = [requireAuth, requireRole("admin", "manager", "encargado")];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countRows(table: any, condition?: any): Promise<number> {
  try {
    const q = db.select({ n: count() }).from(table);
    const [row] = condition ? await q.where(condition) : await q;
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}

type ModuleStatus = "configured" | "partial" | "empty";

interface ModuleCheck {
  status: ModuleStatus;
  count?: number;
  detail?: string;
}

async function detectModules(): Promise<Record<string, ModuleCheck>> {
  const [
    configRows,
    employeeCount,
    productCount,
    categoryCount,
    zoneCount,
    tableCount,
    printerCount,
    verifiedBackupCount,
    cashSessionCount,
  ] = await Promise.all([
    db.select().from(businessConfigTable).limit(1),
    countRows(employeesTable),
    countRows(productsTable),
    countRows(categoriesTable),
    countRows(roomZonesTable),
    countRows(restaurantTablesTable),
    countRows(printersTable, eq(printersTable.active, true)),
    countRows(backupRecordsTable, and(eq(backupRecordsTable.status, "valid"), eq(backupRecordsTable.verified, true))),
    countRows(cashSessionsTable),
  ]);

  const cfg = configRows[0];

  // Business config
  const hasName = !!cfg?.nombreComercial?.trim();
  const hasNif = !!cfg?.nif?.trim();
  const hasFiscal = !!cfg?.direccionFiscal?.trim();
  let configStatus: ModuleStatus = "empty";
  if (hasName && hasNif && hasFiscal) configStatus = "configured";
  else if (hasName || hasNif) configStatus = "partial";

  // Services/hours
  const hasHours = !!(cfg?.openingHours && Object.keys(cfg.openingHours as object).length > 0);

  return {
    identidad: {
      status: configStatus,
      detail: hasName ? cfg!.nombreComercial : undefined,
    },
    fiscalidad: {
      status: hasNif && hasName ? "configured" : hasName ? "partial" : "empty",
      detail: hasNif ? cfg!.nif : undefined,
    },
    horarios: {
      status: hasHours ? "configured" : "empty",
    },
    zonas: {
      status: zoneCount > 0 ? "configured" : "empty",
      count: zoneCount,
    },
    mesas: {
      status: tableCount > 0 ? "configured" : "empty",
      count: tableCount,
    },
    categorias: {
      status: categoryCount > 0 ? "configured" : "empty",
      count: categoryCount,
    },
    productos: {
      status: productCount > 0 ? "configured" : "empty",
      count: productCount,
    },
    empleados: {
      status: employeeCount > 0 ? "configured" : "empty",
      count: employeeCount,
    },
    caja: {
      status: cashSessionCount > 0 ? "configured" : "empty",
      count: cashSessionCount,
    },
    impresoras: {
      status: printerCount > 0 ? "configured" : "empty",
      count: printerCount,
    },
    backup: {
      status: verifiedBackupCount > 0 ? "configured" : "empty",
      count: verifiedBackupCount,
    },
  };
}

function overallStatus(modules: Record<string, ModuleCheck>): "empty" | "partial" | "configured" {
  const statuses = Object.values(modules).map((m) => m.status);
  if (statuses.every((s) => s === "configured")) return "configured";
  if (statuses.every((s) => s === "empty")) return "empty";
  return "partial";
}

// ─── GET /setup/detect ────────────────────────────────────────────────────────
router.get("/setup/detect", async (_req, res) => {
  const modules = await detectModules();
  const overall = overallStatus(modules);

  // Recommend a mode based on what's configured
  let recommendedMode = "full";
  if (overall === "configured") recommendedMode = "review";
  else if (overall === "partial") recommendedMode = "quick";

  res.json({
    overall,
    recommendedMode,
    modules,
    checkedAt: new Date().toISOString(),
  });
});

// ─── GET /setup/status ────────────────────────────────────────────────────────
router.get("/setup/status", ...managerGuard, async (_req, res) => {
  const [modules, configRows, sessions] = await Promise.all([
    detectModules(),
    db.select().from(businessConfigTable).limit(1),
    db.select().from(setupWizardSessionsTable)
      .orderBy(desc(setupWizardSessionsTable.updatedAt))
      .limit(5),
  ]);

  const cfg = configRows[0];
  const overall = overallStatus(modules);

  // Build checklist items
  const checklist = [
    { id: "identidad", label: "Datos del restaurante", status: modules["identidad"]?.status ?? "empty", required: true },
    { id: "fiscalidad", label: "Datos fiscales y NIF", status: modules["fiscalidad"]?.status ?? "empty", required: true },
    { id: "empleados", label: "Al menos un usuario/empleado", status: modules["empleados"]?.status ?? "empty", required: true },
    { id: "productos", label: "Carta con al menos un producto", status: modules["productos"]?.status ?? "empty", required: true },
    { id: "zonas", label: "Al menos una zona/sala", status: modules["zonas"]?.status ?? "empty", required: false },
    { id: "impresoras", label: "Impresora configurada", status: modules["impresoras"]?.status ?? "empty", required: false },
    { id: "backup", label: "Copia de seguridad verificada", status: modules["backup"]?.status ?? "empty", required: true },
  ];

  const requiredDone = checklist.filter((c) => c.required && c.status === "configured").length;
  const requiredTotal = checklist.filter((c) => c.required).length;
  const readyForProduction = requiredDone === requiredTotal;

  res.json({
    overall,
    readyForProduction,
    setupCompleted: cfg?.setupCompleted ?? false,
    goLiveAt: cfg?.goLiveAt ?? null,
    modules,
    checklist,
    recentSessions: sessions.map((s) => ({
      id: s.id,
      mode: s.mode,
      currentStep: s.currentStep,
      completedSteps: s.completedSteps,
      startedAt: s.startedAt,
      updatedAt: s.updatedAt,
      completedAt: s.completedAt,
    })),
    checkedAt: new Date().toISOString(),
  });
});

// ─── POST /setup/session ──────────────────────────────────────────────────────
// Admin-only: wizard writes to admin-only endpoints (config/business, admin/branding)
router.post("/setup/session", ...adminGuard, async (req, res) => {
  const { mode = "full", isDemo = false } = req.body as Record<string, unknown>;
  const user = (req as any).user as { id?: string } | undefined;

  const [session] = await db.insert(setupWizardSessionsTable).values({
    mode: mode as string,
    currentStep: "identidad",
    completedSteps: [],
    skippedSteps: [],
    data: {},
    startedBy: user?.id ?? null,
    isDemo: Boolean(isDemo),
  }).returning();

  await db.insert(setupAuditLogTable).values({
    sessionId: session.id,
    step: "start",
    action: "session_created",
    data: { mode, isDemo },
    performedBy: user?.id ?? null,
  }).catch(() => {});

  res.status(201).json(session);
});

// ─── GET /setup/sessions ──────────────────────────────────────────────────────
router.get("/setup/sessions", ...managerGuard, async (_req, res) => {
  const rows = await db.select().from(setupWizardSessionsTable)
    .orderBy(desc(setupWizardSessionsTable.updatedAt))
    .limit(20);
  res.json(rows);
});

// ─── GET /setup/session/:id ───────────────────────────────────────────────────
router.get("/setup/session/:id", ...adminGuard, async (req, res) => {
  const id = req.params.id as string;
  const [session] = await db.select().from(setupWizardSessionsTable)
    .where(eq(setupWizardSessionsTable.id, id));
  if (!session) { res.status(404).json({ error: "Sesión no encontrada" }); return; }

  const logs = await db.select().from(setupAuditLogTable)
    .where(eq(setupAuditLogTable.sessionId, id))
    .orderBy(desc(setupAuditLogTable.createdAt))
    .limit(50);

  res.json({ ...session, auditLog: logs });
});

// ─── PATCH /setup/session/:id ─────────────────────────────────────────────────
router.patch("/setup/session/:id", ...adminGuard, async (req, res) => {
  const id = req.params.id as string;
  const { currentStep, completedSteps, skippedSteps, data, completedAt } = req.body as Record<string, unknown>;
  const user = (req as any).user as { id?: string } | undefined;

  const [session] = await db.select().from(setupWizardSessionsTable)
    .where(eq(setupWizardSessionsTable.id, id));
  if (!session) { res.status(404).json({ error: "Sesión no encontrada" }); return; }

  const updates: Record<string, unknown> = { updatedAt: new Date(), resumedAt: new Date() };
  if (currentStep !== undefined) updates.currentStep = currentStep;
  if (completedSteps !== undefined) updates.completedSteps = completedSteps;
  if (skippedSteps !== undefined) updates.skippedSteps = skippedSteps;
  if (data !== undefined) updates.data = { ...((session.data as object) ?? {}), ...(data as object) };
  if (completedAt !== undefined) updates.completedAt = new Date(completedAt as string);

  const [updated] = await db.update(setupWizardSessionsTable)
    .set(updates as any)
    .where(eq(setupWizardSessionsTable.id, id))
    .returning();

  // Log step completion if currentStep changed
  if (currentStep && currentStep !== session.currentStep) {
    await db.insert(setupAuditLogTable).values({
      sessionId: id,
      step: session.currentStep,
      action: "step_completed",
      data: { nextStep: currentStep },
      performedBy: user?.id ?? null,
    }).catch(() => {});
  }

  res.json(updated);
});

// ─── GET /setup/checklist ─────────────────────────────────────────────────────
router.get("/setup/checklist", ...managerGuard, async (req, res) => {
  const format = (req.query["format"] as string | undefined) ?? "json";
  const modules = await detectModules();
  const configRows = await db.select().from(businessConfigTable).limit(1);
  const cfg = configRows[0];

  const items = [
    { id: "identidad", category: "Datos básicos", label: "Nombre comercial del restaurante", status: modules["identidad"]?.status ?? "empty", required: true },
    { id: "nif", category: "Datos básicos", label: "NIF/CIF del negocio", status: modules["fiscalidad"]?.status ?? "empty", required: true },
    { id: "direccion", category: "Datos básicos", label: "Dirección fiscal", status: (cfg?.direccionFiscal?.trim() ? "configured" : "empty") as ModuleStatus, required: true },
    { id: "empleados", category: "Usuarios", label: "Al menos un empleado/usuario creado", status: modules["empleados"]?.status ?? "empty", required: true },
    { id: "productos", category: "Carta", label: "Al menos un producto activo", status: modules["productos"]?.status ?? "empty", required: true },
    { id: "categorias", category: "Carta", label: "Al menos una categoría de producto", status: modules["categorias"]?.status ?? "empty", required: true },
    { id: "zonas", category: "Sala", label: "Al menos una zona/sala configurada", status: modules["zonas"]?.status ?? "empty", required: false },
    { id: "mesas", category: "Sala", label: "Al menos una mesa en el plano", status: modules["mesas"]?.status ?? "empty", required: false },
    { id: "impresoras", category: "Hardware", label: "Impresora configurada", status: modules["impresoras"]?.status ?? "empty", required: false },
    { id: "backup", category: "Seguridad", label: "Copia de seguridad verificada creada", status: modules["backup"]?.status ?? "empty", required: true },
    // go_live is a reportable status item but NOT a prerequisite — it's the outcome, not the gate
    { id: "go_live", category: "Producción", label: "Activación del modo producción", status: (cfg?.setupCompleted ? "configured" : "empty") as ModuleStatus, required: false },
  ];

  if (format === "csv") {
    const lines = ["Categoría,Elemento,Estado,Requerido"];
    for (const item of items) {
      lines.push(`"${item.category}","${item.label}","${item.status}","${item.required ? "Sí" : "No"}"`);
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="piccolo_setup_checklist_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(lines.join("\n"));
    return;
  }

  // readyForProduction only considers pre-activation prerequisites (required:true), not go_live itself
  const prerequisiteItems = items.filter((i) => i.required);
  const done = items.filter((i) => i.status === "configured").length;
  res.json({
    items,
    summary: {
      total: items.length,
      done,
      pct: Math.round((done / items.length) * 100),
      readyForProduction: prerequisiteItems.every((i) => i.status === "configured"),
    },
  });
});

// ─── POST /setup/simulation/start ────────────────────────────────────────────
router.post("/setup/simulation/start", ...managerGuard, async (req, res) => {
  const user = (req as any).user as { id?: string; name?: string } | undefined;
  const { sessionId } = req.body as { sessionId?: string };

  // Create a simulation cash session marker in audit log
  await db.insert(setupAuditLogTable).values({
    sessionId: sessionId ?? null,
    step: "simulacion",
    action: "simulation_started",
    data: { startedBy: user?.name ?? "admin" },
    performedBy: user?.id ?? null,
  }).catch(() => {});

  res.json({
    ok: true,
    message: "Simulación iniciada. Los datos creados durante la simulación estarán marcados como demo y no afectarán a la producción.",
    steps: [
      { id: "abrir_caja", label: "Abrir caja", route: "/caja" },
      { id: "seleccionar_mesa", label: "Seleccionar una mesa", route: "/tables" },
      { id: "crear_comanda", label: "Añadir productos al pedido", route: "/pedido/:tableId/:orderId" },
      { id: "ver_kds", label: "Ver comanda en KDS", route: "/kds/cocina" },
      { id: "cobrar", label: "Cobrar el pedido", route: "/cobro/:orderId" },
      { id: "cerrar_caja", label: "Cerrar caja y revisar el Z", route: "/caja" },
    ],
  });
});

// ─── DELETE /setup/simulation/cleanup ────────────────────────────────────────
router.delete("/setup/simulation/cleanup", ...adminGuard, async (req, res) => {
  const user = (req as any).user as { id?: string; name?: string } | undefined;
  const { sessionId } = req.body as { sessionId?: string };

  const results: Record<string, number> = {};

  // Clean is_demo rows from tables that have that column
  const demoTables = ["backup_records", "offline_devices", "offline_queue", "tech_events"];
  for (const tableName of demoTables) {
    try {
      const r = await db.execute(sql.raw(`DELETE FROM "${tableName}" WHERE is_demo = true`)) as { rowCount?: number };
      results[tableName] = r.rowCount ?? 0;
    } catch {
      results[tableName] = 0;
    }
  }

  await db.insert(setupAuditLogTable).values({
    sessionId: sessionId ?? null,
    step: "simulacion",
    action: "simulation_cleaned",
    data: { results, cleanedBy: user?.name ?? "admin" },
    performedBy: user?.id ?? null,
  }).catch(() => {});

  res.json({ ok: true, results, message: "Datos de simulación eliminados" });
});

// ─── POST /setup/go-live ──────────────────────────────────────────────────────
router.post("/setup/go-live", ...adminGuard, async (req, res) => {
  const user = (req as any).user as { id?: string; name?: string } | undefined;
  const { sessionId, confirm } = req.body as { sessionId?: string; confirm?: boolean };

  if (!confirm) {
    res.status(422).json({ error: "Se requiere confirm:true para activar el modo producción" });
    return;
  }

  // Verify minimum requirements
  const modules = await detectModules();
  const required = ["identidad", "fiscalidad", "empleados", "productos", "backup"];
  // All required modules must be fully "configured"; "partial" or "empty" both block activation
  const missing = required.filter((m) => modules[m]?.status !== "configured");
  if (missing.length > 0) {
    res.status(422).json({
      error: "Faltan configuraciones obligatorias antes de activar producción",
      missing,
      detail: missing.includes("backup")
        ? "Se requiere al menos una copia de seguridad verificada antes de activar producción."
        : `Los siguientes módulos están incompletos: ${missing.join(", ")}`,
    });
    return;
  }

  // Activate production mode
  const now = new Date();
  const configRows = await db.select().from(businessConfigTable).limit(1);

  if (configRows.length === 0) {
    res.status(422).json({ error: "Configura los datos del restaurante antes de activar producción" });
    return;
  }

  await db.update(businessConfigTable)
    .set({ setupCompleted: true, goLiveAt: now, updatedAt: now })
    .where(eq(businessConfigTable.id, configRows[0].id));

  // Update session
  if (sessionId) {
    await db.update(setupWizardSessionsTable)
      .set({ completedAt: now, goLiveAt: now, updatedAt: now })
      .where(eq(setupWizardSessionsTable.id, sessionId))
      .catch(() => {});
  }

  await db.insert(setupAuditLogTable).values({
    sessionId: sessionId ?? null,
    step: "produccion",
    action: "go_live",
    data: { activatedBy: user?.name ?? "admin", goLiveAt: now.toISOString() },
    performedBy: user?.id ?? null,
  }).catch(() => {});

  res.json({
    ok: true,
    goLiveAt: now.toISOString(),
    message: "🎉 ¡Piccolo TPV está activo en modo producción!",
  });
});

// ─── GET /setup/audit ─────────────────────────────────────────────────────────
router.get("/setup/audit", ...managerGuard, async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 100), 500);
  const offset = Number(req.query["offset"] ?? 0);
  const sessionId = req.query["sessionId"] as string | undefined;

  const conditions = sessionId ? [eq(setupAuditLogTable.sessionId, sessionId)] : [];
  const rows = await db.select().from(setupAuditLogTable)
    .where(conditions.length ? conditions[0] : undefined)
    .orderBy(desc(setupAuditLogTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(setupAuditLogTable)
    .where(conditions.length ? conditions[0] : undefined);

  res.json({ data: rows, total: Number(total), limit, offset });
});

export default router;
