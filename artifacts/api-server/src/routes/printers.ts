/**
 * printers.ts
 * API routes for the printing module.
 * All admin routes require requireAuth (manager or admin role).
 */
import { Router, type IRouter } from "express";
import { appendFileSync } from "node:fs";
import { db } from "@workspace/db";
import {
  printersTable,
  printQueueTable,
  printRoutingTable,
  printAuditTable,
  businessConfigTable,
  printTestResultsTable,
  categoriesTable,
  productionDepartmentsTable,
  kdsStationsTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  buildTestTicket,
  buildReprintHeader,
} from "../lib/ticket-builder";
import { getPrinterStatus } from "../lib/print-connector-sim";

const router: IRouter = Router();

const DEPARTMENT_CODE = /^[a-z0-9][a-z0-9_-]{1,49}$/;
const CONNECTION_TYPES = ["simulation", "tcp", "windows_agent"] as const;

function validatePrinterInput(input: {
  port?: number;
  paperWidth?: number;
  copies?: number;
  connectionType?: string;
  ip?: string;
  agentUrl?: string | null;
}): string | null {
  if (input.port !== undefined && (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)) {
    return "Puerto fuera de rango.";
  }
  if (input.paperWidth !== undefined && ![58, 80].includes(input.paperWidth)) {
    return "El ancho debe ser 58 u 80 mm.";
  }
  if (input.copies !== undefined && (!Number.isInteger(input.copies) || input.copies < 1 || input.copies > 10)) {
    return "Las copias deben estar entre 1 y 10.";
  }
  if (input.connectionType && !CONNECTION_TYPES.includes(input.connectionType as typeof CONNECTION_TYPES[number])) {
    return "Tipo de conexión no válido.";
  }
  if (input.connectionType === "tcp" && !input.ip?.trim()) return "La conexión TCP requiere una IP.";
  if (input.connectionType === "windows_agent" && !input.agentUrl?.trim()) {
    return "La conexión Windows requiere la URL del agente.";
  }
  return null;
}

// ── helpers ────────────────────────────────────────────────────────────────────

async function auditPrint(
  printQueueId: string | null,
  action: string,
  actorId: string | undefined,
  actorName: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  await db.insert(printAuditTable).values({
    printQueueId,
    action,
    actorId: actorId ?? null,
    actorName,
    detail: detail ?? null,
  }).catch(() => {});
}

// ── GET /admin/printers ───────────────────────────────────────────────────────
router.get("/admin/printers", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const printers = await db
    .select()
    .from(printersTable)
    .orderBy(printersTable.name);
  res.json(printers);
});

// ── POST /admin/printers ──────────────────────────────────────────────────────
router.post("/admin/printers", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const {
    name, type, brand, model, ip, port, paperWidth, copies, active, isPrimary,
    fallbackPrinterId, departmentCode, connectionType, agentUrl, characterSet,
    autoCut, openCashDrawer,
  } =
    req.body as Partial<typeof printersTable.$inferInsert>;

  if (!name?.trim()) { res.status(400).json({ error: "El nombre es obligatorio." }); return; }
  const validationError = validatePrinterInput({ port, paperWidth, copies, connectionType, ip, agentUrl });
  if (validationError) { res.status(400).json({ error: validationError }); return; }
  if (departmentCode) {
    const [department] = await db.select({ id: productionDepartmentsTable.id })
      .from(productionDepartmentsTable)
      .where(and(
        eq(productionDepartmentsTable.code, departmentCode),
        eq(productionDepartmentsTable.active, true),
      ));
    if (!department) { res.status(400).json({ error: "Departamento no válido." }); return; }
  }

  const [printer] = await db.insert(printersTable).values({
    name: name.trim(),
    type: type ?? "cocina",
    brand: brand ?? "",
    model: model ?? "",
    ip: ip ?? "",
    port: port ?? 9100,
    paperWidth: paperWidth ?? 80,
    copies: copies ?? 1,
    active: active ?? true,
    isPrimary: isPrimary ?? true,
    fallbackPrinterId: fallbackPrinterId ?? null,
    departmentCode: departmentCode ?? type ?? "cocina",
    connectionType: connectionType ?? "simulation",
    agentUrl: agentUrl ?? null,
    characterSet: characterSet ?? "cp858",
    autoCut: autoCut ?? true,
    openCashDrawer: openCashDrawer ?? false,
  }).returning();

  await auditPrint(null, "printer_created", req.user?.id, req.user?.name ?? "admin", { printerName: printer.name });
  res.status(201).json(printer);
});

// ── PATCH /admin/printers/:id ─────────────────────────────────────────────────
router.patch("/admin/printers/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const {
    name, type, brand, model, ip, port, paperWidth, copies, active, isPrimary,
    fallbackPrinterId, departmentCode, connectionType, agentUrl, characterSet,
    autoCut, openCashDrawer,
  } =
    req.body as Partial<typeof printersTable.$inferInsert>;
  const validationError = validatePrinterInput({ port, paperWidth, copies, connectionType, ip, agentUrl });
  if (validationError) { res.status(400).json({ error: validationError }); return; }
  if (fallbackPrinterId === id) { res.status(400).json({ error: "Una impresora no puede ser su propio respaldo." }); return; }
  if (departmentCode) {
    const [department] = await db.select({ id: productionDepartmentsTable.id })
      .from(productionDepartmentsTable)
      .where(and(
        eq(productionDepartmentsTable.code, departmentCode),
        eq(productionDepartmentsTable.active, true),
      ));
    if (!department) { res.status(400).json({ error: "Departamento no válido." }); return; }
  }

  const [printer] = await db
    .update(printersTable)
    .set({
      ...(name !== undefined && { name: name.trim() }),
      ...(type !== undefined && { type }),
      ...(brand !== undefined && { brand }),
      ...(model !== undefined && { model }),
      ...(ip !== undefined && { ip }),
      ...(port !== undefined && { port }),
      ...(paperWidth !== undefined && { paperWidth }),
      ...(copies !== undefined && { copies }),
      ...(active !== undefined && { active }),
      ...(isPrimary !== undefined && { isPrimary }),
      ...(fallbackPrinterId !== undefined && { fallbackPrinterId }),
      ...(departmentCode !== undefined && { departmentCode }),
      ...(connectionType !== undefined && { connectionType }),
      ...(agentUrl !== undefined && { agentUrl }),
      ...(characterSet !== undefined && { characterSet }),
      ...(autoCut !== undefined && { autoCut }),
      ...(openCashDrawer !== undefined && { openCashDrawer }),
      updatedAt: new Date(),
    })
    .where(eq(printersTable.id, id))
    .returning();

  if (!printer) { res.status(404).json({ error: "Impresora no encontrada." }); return; }
  await auditPrint(null, "printer_updated", req.user?.id, req.user?.name ?? "admin", { printerName: printer.name });
  res.json(printer);
});

// ── DELETE /admin/printers/:id ────────────────────────────────────────────────
router.delete("/admin/printers/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  // Soft delete: set active = false
  const [printer] = await db
    .update(printersTable)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(printersTable.id, id))
    .returning();

  if (!printer) { res.status(404).json({ error: "Impresora no encontrada." }); return; }
  await auditPrint(null, "printer_deleted", req.user?.id, req.user?.name ?? "admin", { printerName: printer.name });
  res.json({ ok: true });
});

// ── Production departments ────────────────────────────────────────────────────
router.get("/production-departments", requireAuth, async (_req, res): Promise<void> => {
  const departments = await db.select().from(productionDepartmentsTable)
    .where(eq(productionDepartmentsTable.active, true))
    .orderBy(productionDepartmentsTable.sortOrder, productionDepartmentsTable.name);
  res.json(departments);
});

router.get("/admin/production-departments", requireAuth, requireRole("manager", "admin"), async (_req, res): Promise<void> => {
  const departments = await db.select().from(productionDepartmentsTable)
    .orderBy(productionDepartmentsTable.sortOrder, productionDepartmentsTable.name);
  res.json(departments);
});

router.post("/admin/production-departments", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { code, name, kind, workflow, kdsEnabled, printerEnabled, sortOrder } =
    req.body as Partial<typeof productionDepartmentsTable.$inferInsert>;
  const normalizedCode = code?.trim().toLowerCase() ?? "";
  if (!DEPARTMENT_CODE.test(normalizedCode)) {
    res.status(400).json({ error: "Código inválido: usa letras minúsculas, números, guion o guion bajo." });
    return;
  }
  if (!name?.trim()) { res.status(400).json({ error: "El nombre es obligatorio." }); return; }
  if (!["production", "pass", "none"].includes(kind ?? "production")) {
    res.status(400).json({ error: "Tipo de departamento no válido." }); return;
  }
  if (!["standard", "oven", "pass"].includes(workflow ?? "standard")) {
    res.status(400).json({ error: "Flujo de trabajo no válido." }); return;
  }
  const [department] = await db.insert(productionDepartmentsTable).values({
    code: normalizedCode,
    name: name.trim(),
    kind: kind ?? "production",
    workflow: workflow ?? "standard",
    kdsEnabled: kdsEnabled ?? true,
    printerEnabled: printerEnabled ?? false,
    sortOrder: sortOrder ?? 0,
  }).returning();
  await auditPrint(null, "department_created", req.user?.id, req.user?.name ?? "admin", {
    departmentCode: department.code,
  });
  res.status(201).json(department);
});

router.patch("/admin/production-departments/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { name, kind, workflow, kdsEnabled, printerEnabled, active, sortOrder } =
    req.body as Partial<typeof productionDepartmentsTable.$inferInsert>;
  if (kind !== undefined && !["production", "pass", "none"].includes(kind)) {
    res.status(400).json({ error: "Tipo de departamento no válido." }); return;
  }
  if (workflow !== undefined && !["standard", "oven", "pass"].includes(workflow)) {
    res.status(400).json({ error: "Flujo de trabajo no válido." }); return;
  }
  const [department] = await db.update(productionDepartmentsTable).set({
    ...(name !== undefined && { name: name.trim() }),
    ...(kind !== undefined && { kind }),
    ...(workflow !== undefined && { workflow }),
    ...(kdsEnabled !== undefined && { kdsEnabled }),
    ...(printerEnabled !== undefined && { printerEnabled }),
    ...(active !== undefined && { active }),
    ...(sortOrder !== undefined && { sortOrder }),
    updatedAt: new Date(),
  }).where(eq(productionDepartmentsTable.id, id)).returning();
  if (!department) { res.status(404).json({ error: "Departamento no encontrado." }); return; }
  await auditPrint(null, "department_updated", req.user?.id, req.user?.name ?? "admin", {
    departmentCode: department.code,
  });
  res.json(department);
});

// ── Honest operational monitor ────────────────────────────────────────────────
router.get("/admin/hardware-monitor", requireAuth, requireRole("manager", "admin"), async (_req, res): Promise<void> => {
  const [departments, printers, stations, jobs] = await Promise.all([
    db.select().from(productionDepartmentsTable).where(eq(productionDepartmentsTable.active, true)),
    db.select().from(printersTable).where(eq(printersTable.active, true)),
    db.select().from(kdsStationsTable).where(eq(kdsStationsTable.active, true)),
    db.select({
      status: printQueueTable.status,
      printerId: printQueueTable.printerId,
      lastError: printQueueTable.lastError,
      createdAt: printQueueTable.createdAt,
      updatedAt: printQueueTable.updatedAt,
    }).from(printQueueTable).orderBy(desc(printQueueTable.createdAt)).limit(500),
  ]);
  const now = Date.now();
  const printerRows = printers.map((printer) => {
    const printerJobs = jobs.filter(job => job.printerId === printer.id);
    return {
      ...printer,
      knownState: !printer.lastStatusAt
        ? "unknown"
        : now - printer.lastStatusAt.getTime() > 5 * 60_000
          ? "stale"
          : printer.lastStatus,
      stateEvidence: printer.connectionType === "simulation"
        ? "simulation"
        : "last_probe",
      pending: printerJobs.filter(job => ["pending", "sending", "retrying"].includes(job.status)).length,
      failed: printerJobs.filter(job => ["failed", "delivery_unknown"].includes(job.status)).length,
      lastError: printerJobs.find(job => job.lastError)?.lastError ?? null,
    };
  });
  const stationRows = stations.map((station) => ({
    ...station,
    knownState: !station.lastPingAt
      ? "unknown"
      : now - station.lastPingAt.getTime() > 2 * 60_000 ? "stale" : "recently_seen",
    stateEvidence: "last_probe_only",
  }));
  const issues: Array<{ severity: "error" | "warning"; department: string; message: string }> = [];
  for (const department of departments) {
    if (department.kind === "production" && !department.kdsEnabled && !department.printerEnabled) {
      issues.push({ severity: "error", department: department.code, message: "Sin ninguna salida operativa." });
    }
    if (department.kdsEnabled && !stations.some(station => station.zoneType === department.code)) {
      issues.push({ severity: "warning", department: department.code, message: "KDS habilitado sin estación registrada." });
    }
    if (department.printerEnabled && !printers.some(printer => (printer.departmentCode ?? printer.type) === department.code)) {
      issues.push({ severity: "error", department: department.code, message: "Impresión habilitada sin impresora activa." });
    }
  }
  res.json({
    generatedAt: new Date().toISOString(),
    printers: printerRows,
    kds: stationRows,
    departments,
    queue: {
      pending: jobs.filter(job => ["pending", "sending", "retrying"].includes(job.status)).length,
      failed: jobs.filter(job => ["failed", "delivery_unknown"].includes(job.status)).length,
      deliveryUnknown: jobs.filter(job => job.status === "delivery_unknown").length,
    },
    issues,
    productionReady: issues.every(issue => issue.severity !== "error"),
  });
});

// ── POST /admin/printers/:id/test ─────────────────────────────────────────────
router.post("/admin/printers/:id/test", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [printer] = await db.select().from(printersTable).where(eq(printersTable.id, id));
  if (!printer) { res.status(404).json({ error: "Impresora no encontrada." }); return; }

  const content = buildTestTicket(printer.name, printer.type, printer.paperWidth === 80);
  const [job] = await db.insert(printQueueTable).values({
    printerId: printer.id,
    orderId: null,
    documentType: "test_ticket",
    content,
    status: "pending",
    dedupeKey: `test_ticket:${printer.id}:${crypto.randomUUID()}`,
    actorId: req.user?.id ?? null,
    actorName: req.user?.name ?? "admin",
  }).returning();

  await auditPrint(job.id, "test", req.user?.id, req.user?.name ?? "admin", { printerName: printer.name });
  res.json({ ok: true, jobId: job.id });
});

// ── GET /admin/printers/:id/status ────────────────────────────────────────────
router.get("/admin/printers/:id/status", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [printer] = await db.select().from(printersTable).where(eq(printersTable.id, id));
  if (!printer) { res.status(404).json({ error: "Impresora no encontrada." }); return; }

  const statusResult = await getPrinterStatus({
    printerId: printer.id,
    printerIp: printer.ip,
    printerPort: printer.port,
    connectionType: printer.connectionType as "simulation" | "tcp" | "windows_agent",
    agentUrl: printer.agentUrl,
  });

  // Persist last status
  await db.update(printersTable).set({
    lastStatus: statusResult.status,
    lastStatusAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(printersTable.id, id));

  res.json(statusResult);
});

// ── GET /admin/print-routing/:entityType/:entityId ────────────────────────────
router.get("/admin/print-routing/:entityType/:entityId", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { entityType, entityId } = req.params as { entityType: string; entityId: string };
  const [routing] = await db
    .select()
    .from(printRoutingTable)
    .where(and(eq(printRoutingTable.entityType, entityType), eq(printRoutingTable.entityId, entityId)));
  res.json(routing ?? { entityType, entityId, printerIds: [] });
});

// ── PUT /admin/print-routing/:entityType/:entityId ────────────────────────────
router.put("/admin/print-routing/:entityType/:entityId", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { entityType, entityId } = req.params as { entityType: string; entityId: string };
  const { printerIds } = req.body as { printerIds: string[] };

  if (!Array.isArray(printerIds)) { res.status(400).json({ error: "printerIds debe ser un array." }); return; }

  // Upsert
  const existing = await db
    .select({ id: printRoutingTable.id })
    .from(printRoutingTable)
    .where(and(eq(printRoutingTable.entityType, entityType), eq(printRoutingTable.entityId, entityId)));

  let routing;
  if (existing.length) {
    [routing] = await db
      .update(printRoutingTable)
      .set({ printerIds, updatedAt: new Date() })
      .where(eq(printRoutingTable.id, existing[0].id))
      .returning();
  } else {
    [routing] = await db
      .insert(printRoutingTable)
      .values({ entityType, entityId, printerIds })
      .returning();
  }

  await auditPrint(null, "routing_changed", req.user?.id, req.user?.name ?? "admin", {
    entityType, entityId, printerIds,
  });
  res.json(routing);
});

// ── GET /admin/print-queue ────────────────────────────────────────────────────
router.get("/admin/print-queue", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { status, printerId, limit = "100" } = req.query as Record<string, string>;

  const jobs = await db
    .select({
      id: printQueueTable.id,
      printerId: printQueueTable.printerId,
      orderId: printQueueTable.orderId,
      documentType: printQueueTable.documentType,
      status: printQueueTable.status,
      attempts: printQueueTable.attempts,
      lastError: printQueueTable.lastError,
      availableAt: printQueueTable.availableAt,
      leaseUntil: printQueueTable.leaseUntil,
      confirmationLevel: printQueueTable.confirmationLevel,
      transportAckedAt: printQueueTable.transportAckedAt,
      sentAt: printQueueTable.sentAt,
      printedAt: printQueueTable.printedAt,
      actorName: printQueueTable.actorName,
      createdAt: printQueueTable.createdAt,
      printerName: printersTable.name,
    })
    .from(printQueueTable)
    .leftJoin(printersTable, eq(printQueueTable.printerId, printersTable.id))
    .orderBy(desc(printQueueTable.createdAt))
    .limit(parseInt(limit, 10));

  // Filter in-memory (drizzle dynamic where is verbose for simple cases)
  const filtered = jobs.filter(j => {
    if (status && j.status !== status) return false;
    if (printerId && j.printerId !== printerId) return false;
    return true;
  });

  res.json(filtered);
});

// ── POST /admin/print-queue/:id/retry ────────────────────────────────────────
router.post("/admin/print-queue/:id/retry", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const [job] = await db.select().from(printQueueTable).where(eq(printQueueTable.id, id));
  // #region agent log
  appendFileSync("/opt/cursor/logs/debug.log", JSON.stringify({ hypothesisId: "H4", location: "printers.ts:retry:job", message: "Loaded retry candidate", data: { id, status: job?.status ?? null }, timestamp: Date.now() }) + "\n");
  // #endregion
  if (!job) { res.status(404).json({ error: "Trabajo no encontrado." }); return; }
  if (!["failed", "retrying", "delivery_unknown"].includes(job.status)) {
    res.status(409).json({ error: "Solo se pueden reintentar trabajos fallidos o de entrega desconocida." });
    return;
  }
  if (job.status === "delivery_unknown" && !reason) {
    res.status(400).json({ error: "El motivo es obligatorio cuando la entrega anterior es desconocida." });
    return;
  }

  const [updated] = await db
    .update(printQueueTable)
    .set({
      status: "pending",
      attempts: 0,
      lastError: null,
      availableAt: new Date(),
      leaseUntil: null,
      lockedBy: null,
      confirmationLevel: "queued",
      updatedAt: new Date(),
    })
    .where(and(
      eq(printQueueTable.id, id),
      inArray(printQueueTable.status, ["failed", "retrying", "delivery_unknown"]),
    ))
    .returning();

  if (!updated) { res.status(409).json({ error: "El trabajo cambió de estado." }); return; }
  await auditPrint(id, "retried", req.user?.id, req.user?.name ?? "admin", { reason: reason || null });
  res.json(updated);
});

// ── DELETE /admin/print-queue/:id ─────────────────────────────────────────────
router.delete("/admin/print-queue/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [job] = await db.select().from(printQueueTable).where(eq(printQueueTable.id, id));
  if (!job) { res.status(404).json({ error: "Trabajo no encontrado." }); return; }
  if (!["pending", "retrying", "failed", "delivery_unknown"].includes(job.status)) {
    res.status(409).json({ error: "Solo se pueden cancelar trabajos pendientes o con error." }); return;
  }

  const [updated] = await db
    .update(printQueueTable)
    .set({ status: "cancelled" })
    .where(eq(printQueueTable.id, id))
    .returning();
  // #region agent log
  appendFileSync("/opt/cursor/logs/debug.log", JSON.stringify({ hypothesisId: "H5", location: "printers.ts:cancel:updated", message: "Cancelled queue candidate", data: { id, loadedStatus: job.status, returnedStatus: updated?.status ?? null }, timestamp: Date.now() }) + "\n");
  // #endregion

  await auditPrint(id, "cancelled", req.user?.id, req.user?.name ?? "admin");
  res.json(updated);
});

// ── POST /admin/print-queue/:id/reprint ──────────────────────────────────────
router.post("/admin/print-queue/:id/reprint", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { reason, printerId } = req.body as { reason?: string; printerId?: string };
  if (!reason?.trim()) { res.status(400).json({ error: "El motivo de reimpresión es obligatorio." }); return; }

  const [original] = await db.select().from(printQueueTable).where(eq(printQueueTable.id, id));
  if (!original) { res.status(404).json({ error: "Trabajo no encontrado." }); return; }
  const targetPrinterId = printerId ?? original.printerId;
  const [targetPrinter] = await db.select().from(printersTable)
    .where(and(eq(printersTable.id, targetPrinterId), eq(printersTable.active, true)));
  // #region agent log
  appendFileSync("/opt/cursor/logs/debug.log", JSON.stringify({ hypothesisId: "H6", location: "printers.ts:reprint:target", message: "Resolved reprint target", data: { originalId: id, targetPrinterId, targetFound: Boolean(targetPrinter) }, timestamp: Date.now() }) + "\n");
  // #endregion
  if (!targetPrinter) { res.status(400).json({ error: "Impresora destino no disponible." }); return; }

  const reprintHeader = buildReprintHeader(
    reason.trim(),
    req.user?.name ?? "admin",
    targetPrinter.paperWidth === 80,
  );
  const [newJob] = await db.insert(printQueueTable).values({
    printerId: targetPrinter.id,
    orderId: original.orderId,
    documentType: "reprint",
    content: reprintHeader + original.content,
    status: "pending",
    dedupeKey: `reprint:${id}:${targetPrinter.id}:${crypto.randomUUID()}`,
    actorId: req.user?.id ?? null,
    actorName: req.user?.name ?? "admin",
    meta: { originalJobId: id, reason: reason.trim(), targetPrinterId: targetPrinter.id },
  }).returning();

  await auditPrint(newJob.id, "reprinted", req.user?.id, req.user?.name ?? "admin", {
    originalJobId: id, reason: reason.trim(), targetPrinterId: targetPrinter.id,
  });
  res.status(201).json(newJob);
});

// ── GET /admin/print-config ───────────────────────────────────────────────────
router.get("/admin/print-config", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const [cfg] = await db.select({
    printMode: (businessConfigTable as any).printMode,
    printTemplateConfig: (businessConfigTable as any).printTemplateConfig,
  }).from(businessConfigTable).limit(1);
  res.json(cfg ?? { printMode: "kds_only", printTemplateConfig: null });
});

// ── PATCH /admin/print-config ─────────────────────────────────────────────────
router.patch("/admin/print-config", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { printMode, printTemplateConfig } = req.body as {
    printMode?: string;
    printTemplateConfig?: Record<string, unknown>;
  };

  const VALID_MODES = ["kds_only", "printers_only", "both"];
  if (printMode && !VALID_MODES.includes(printMode)) {
    res.status(400).json({ error: "Modo de impresión no válido." }); return;
  }

  const [existing] = await db.select({ id: businessConfigTable.id }).from(businessConfigTable).limit(1);

  if (existing) {
    await db.update(businessConfigTable).set({
      ...(printMode !== undefined && { printMode } as any),
      ...(printTemplateConfig !== undefined && { printTemplateConfig } as any),
      updatedAt: new Date(),
    }).where(eq(businessConfigTable.id, existing.id));
  }

  res.json({ ok: true });
});

// ── GET /admin/print-audit ────────────────────────────────────────────────────
router.get("/admin/print-audit", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { limit = "200" } = req.query as Record<string, string>;
  const entries = await db
    .select()
    .from(printAuditTable)
    .orderBy(desc(printAuditTable.createdAt))
    .limit(parseInt(limit, 10));
  res.json(entries);
});

// ═══ PRINT TEST RESULTS ═══════════════════════════════════════════════════════

// ── POST /admin/print-test-results ───────────────────────────────────────────
router.post("/admin/print-test-results", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const rows = req.body as Array<{
    printerId: string;
    stepKey: string;
    stepLabel: string;
    result: string;
    notes?: string;
    sessionId?: string;
  }>;

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "Se requiere un array de resultados." });
    return;
  }

  const inserted = await db.insert(printTestResultsTable).values(
    rows.map(r => ({
      printerId: r.printerId,
      stepKey: r.stepKey,
      stepLabel: r.stepLabel,
      result: r.result ?? "pending",
      notes: r.notes ?? null,
      testedBy: req.user?.name ?? null,
      sessionId: r.sessionId ?? null,
    }))
  ).returning();

  res.status(201).json({ ok: true, count: inserted.length });
});

// ── GET /admin/print-test-results/latest ──────────────────────────────────────
router.get("/admin/print-test-results/latest", requireAuth, requireRole("manager", "admin"), async (_req, res): Promise<void> => {
  // Get the most recent session
  const [latest] = await db
    .select({ sessionId: printTestResultsTable.sessionId, createdAt: printTestResultsTable.createdAt })
    .from(printTestResultsTable)
    .orderBy(desc(printTestResultsTable.createdAt))
    .limit(1);

  if (!latest?.sessionId) { res.json([]); return; }

  const results = await db
    .select()
    .from(printTestResultsTable)
    .where(eq(printTestResultsTable.sessionId, latest.sessionId))
    .orderBy(printTestResultsTable.createdAt);

  res.json(results);
});

// ── POST /admin/print-routing/seed-defaults ───────────────────────────────────
// Seeds default category→printer routing rules when the matrix is empty
router.post("/admin/print-routing/seed-defaults", requireAuth, requireRole("manager", "admin"), async (_req, res): Promise<void> => {
  // Get all categories and printers
  const cats = await db.select({ id: categoriesTable.id, name: categoriesTable.name }).from(categoriesTable);
  const printersAll = await db.select().from(printersTable).where(eq(printersTable.active, true));

  if (printersAll.length === 0 || cats.length === 0) {
    res.json({ ok: true, seeded: 0, message: "No hay impresoras o categorías." });
    return;
  }

  const existing = await db.select().from(printRoutingTable).limit(1);
  if (existing.length > 0) {
    res.json({ ok: true, seeded: 0, message: "Ya existen reglas. No se sobrescriben." });
    return;
  }

  // Map printer types to zone labels for fuzzy matching
  const findPrinter = (type: string) => printersAll.find(p => p.type === type) ?? printersAll[0]!;

  const ZONE_KEYWORDS: Array<{ keywords: string[]; printerType: string }> = [
    { keywords: ['pizza', 'forno', 'horno'], printerType: 'pizza' },
    { keywords: ['ensalada', 'frio', 'frío', 'fresco', 'vegetal'], printerType: 'ensalada' },
    { keywords: ['barra', 'bebida', 'bebidas', 'drink', 'cocktail', 'café', 'cafe'], printerType: 'barra' },
  ];

  const rules: Array<{ entityType: string; entityId: string; printerIds: string[] }> = [];

  for (const cat of cats) {
    const nameLower = cat.name.toLowerCase();
    let printerType = 'cocina'; // default
    for (const { keywords, printerType: pt } of ZONE_KEYWORDS) {
      if (keywords.some(k => nameLower.includes(k))) { printerType = pt; break; }
    }
    const printer = findPrinter(printerType);
    rules.push({ entityType: 'category', entityId: cat.id, printerIds: [printer.id] });
  }

  if (rules.length > 0) {
    await db.insert(printRoutingTable).values(rules.map(r => ({
      entityType: r.entityType,
      entityId: r.entityId,
      printerIds: r.printerIds,
    })));
  }

  res.json({ ok: true, seeded: rules.length });
});

export default router;
