/**
 * printers.ts
 * API routes for the printing module.
 * All admin routes require requireAuth (manager or admin role).
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  printersTable,
  printQueueTable,
  printRoutingTable,
  printAuditTable,
  businessConfigTable,
  printTestResultsTable,
  categoriesTable,
  installationDevicesTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  buildTestTicket,
  buildReprintHeader,
} from "../lib/ticket-builder";
import { getPrinterStatus } from "../lib/print-connector-sim";
import { sanitizePrintTemplate } from "../lib/configuration";

const router: IRouter = Router();

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

async function fallbackPrinterExists(fallbackPrinterId: string, currentPrinterId?: string): Promise<boolean> {
  if (fallbackPrinterId === currentPrinterId) return false;
  const [fallback] = await db
    .select({ id: printersTable.id })
    .from(printersTable)
    .where(and(eq(printersTable.id, fallbackPrinterId), eq(printersTable.active, true)))
    .limit(1);
  return Boolean(fallback);
}

function effectivePrintTemplate(config: {
  nombreComercial: string;
  razonSocial: string;
  nif: string;
  direccionFiscal: string;
  logoUrl: string;
  printTemplateConfig: unknown;
}) {
  const fiscal = [config.razonSocial, config.nif, config.direccionFiscal]
    .filter(Boolean)
    .join(" · ");
  return {
    ...(sanitizePrintTemplate(config.printTemplateConfig as Record<string, unknown> | null) ?? {}),
    nombreComercial: config.nombreComercial,
    datosFiscales: fiscal,
    logoUrl: config.logoUrl,
  };
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
  const { name, type, brand, model, ip, port, paperWidth, copies, active, isPrimary, fallbackPrinterId } =
    req.body as Partial<typeof printersTable.$inferInsert>;

  if (!name?.trim()) { res.status(400).json({ error: "El nombre es obligatorio." }); return; }
  if (fallbackPrinterId && !await fallbackPrinterExists(fallbackPrinterId)) {
    res.status(422).json({ error: "La impresora de respaldo no existe o está inactiva." });
    return;
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
  }).returning();

  await auditPrint(null, "printer_created", req.user?.id, req.user?.name ?? "admin", { printerName: printer.name });
  res.status(201).json(printer);
});

// ── PATCH /admin/printers/:id ─────────────────────────────────────────────────
router.patch("/admin/printers/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { name, type, brand, model, ip, port, paperWidth, copies, active, isPrimary, fallbackPrinterId } =
    req.body as Partial<typeof printersTable.$inferInsert>;

  if (fallbackPrinterId && !await fallbackPrinterExists(fallbackPrinterId, id)) {
    res.status(422).json({
      error: fallbackPrinterId === id
        ? "Una impresora no puede ser su propio respaldo."
        : "La impresora de respaldo no existe o está inactiva.",
    });
    return;
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
  const [fallbackReferences, routingRules, deviceReferences] = await Promise.all([
    db.select({ id: printersTable.id, name: printersTable.name })
      .from(printersTable)
      .where(and(eq(printersTable.fallbackPrinterId, id), eq(printersTable.active, true))),
    db.select({ id: printRoutingTable.id, printerIds: printRoutingTable.printerIds })
      .from(printRoutingTable),
    db.select({ id: installationDevicesTable.id, name: installationDevicesTable.name })
      .from(installationDevicesTable)
      .where(eq(installationDevicesTable.defaultPrinterId, id)),
  ]);
  const routeReferences = routingRules.filter((routing) => routing.printerIds.includes(id));
  if (fallbackReferences.length > 0 || routeReferences.length > 0 || deviceReferences.length > 0) {
    res.status(409).json({
      error: "La impresora sigue referenciada y no se puede desactivar.",
      references: {
        fallbackPrinters: fallbackReferences,
        routingRules: routeReferences.map((routing) => routing.id),
        devices: deviceReferences,
      },
    });
    return;
  }
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

  const statusResult = await getPrinterStatus(id);

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
  if (!["category", "product"].includes(entityType)) {
    res.status(422).json({ error: "entityType debe ser category o product." });
    return;
  }
  const uniquePrinterIds = [...new Set(printerIds)];
  if (uniquePrinterIds.length !== printerIds.length) {
    res.status(422).json({ error: "printerIds no puede contener duplicados." });
    return;
  }
  if (printerIds.length > 0) {
    const validPrinters = await db
      .select({ id: printersTable.id })
      .from(printersTable)
      .where(and(inArray(printersTable.id, printerIds), eq(printersTable.active, true)));
    if (validPrinters.length !== printerIds.length) {
      res.status(422).json({
        error: "La ruta contiene impresoras inexistentes o inactivas.",
      });
      return;
    }
  }

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
  const [job] = await db.select().from(printQueueTable).where(eq(printQueueTable.id, id));
  if (!job) { res.status(404).json({ error: "Trabajo no encontrado." }); return; }

  const [updated] = await db
    .update(printQueueTable)
    .set({ status: "pending", attempts: 0, lastError: null })
    .where(eq(printQueueTable.id, id))
    .returning();

  await auditPrint(id, "retried", req.user?.id, req.user?.name ?? "admin");
  res.json(updated);
});

// ── DELETE /admin/print-queue/:id ─────────────────────────────────────────────
router.delete("/admin/print-queue/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [job] = await db.select().from(printQueueTable).where(eq(printQueueTable.id, id));
  if (!job) { res.status(404).json({ error: "Trabajo no encontrado." }); return; }
  if (!["pending", "retrying", "error"].includes(job.status)) {
    res.status(409).json({ error: "Solo se pueden cancelar trabajos pendientes o con error." }); return;
  }

  const [updated] = await db
    .update(printQueueTable)
    .set({ status: "cancelled" })
    .where(eq(printQueueTable.id, id))
    .returning();

  await auditPrint(id, "cancelled", req.user?.id, req.user?.name ?? "admin");
  res.json(updated);
});

// ── POST /admin/print-queue/:id/reprint ──────────────────────────────────────
router.post("/admin/print-queue/:id/reprint", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { reason } = req.body as { reason?: string };
  if (!reason?.trim()) { res.status(400).json({ error: "El motivo de reimpresión es obligatorio." }); return; }

  const [original] = await db.select().from(printQueueTable).where(eq(printQueueTable.id, id));
  if (!original) { res.status(404).json({ error: "Trabajo no encontrado." }); return; }

  const reprintHeader = buildReprintHeader(reason.trim(), req.user?.name ?? "admin", true);
  const [newJob] = await db.insert(printQueueTable).values({
    printerId: original.printerId,
    orderId: original.orderId,
    documentType: "reprint",
    content: reprintHeader + original.content,
    status: "pending",
    actorId: req.user?.id ?? null,
    actorName: req.user?.name ?? "admin",
    meta: { originalJobId: id, reason: reason.trim() },
  }).returning();

  await auditPrint(newJob.id, "reprinted", req.user?.id, req.user?.name ?? "admin", {
    originalJobId: id, reason: reason.trim(),
  });
  res.status(201).json(newJob);
});

// ── GET /admin/print-config ───────────────────────────────────────────────────
router.get("/admin/print-config", requireAuth, requireRole("manager", "admin"), async (_req, res): Promise<void> => {
  const [cfg] = await db.select({
    printMode: (businessConfigTable as any).printMode,
    printTemplateConfig: (businessConfigTable as any).printTemplateConfig,
    nombreComercial: businessConfigTable.nombreComercial,
    razonSocial: businessConfigTable.razonSocial,
    nif: businessConfigTable.nif,
    direccionFiscal: businessConfigTable.direccionFiscal,
    logoUrl: businessConfigTable.logoUrl,
  }).from(businessConfigTable).orderBy(desc(businessConfigTable.updatedAt)).limit(1);
  res.json(cfg
    ? { printMode: cfg.printMode, printTemplateConfig: effectivePrintTemplate(cfg) }
    : { printMode: "kds_only", printTemplateConfig: null });
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

  const [existing] = await db.select({
    id: businessConfigTable.id,
    nombreComercial: businessConfigTable.nombreComercial,
    razonSocial: businessConfigTable.razonSocial,
    nif: businessConfigTable.nif,
    direccionFiscal: businessConfigTable.direccionFiscal,
    logoUrl: businessConfigTable.logoUrl,
    printTemplateConfig: businessConfigTable.printTemplateConfig,
  }).from(businessConfigTable).orderBy(desc(businessConfigTable.updatedAt)).limit(1);

  if (!existing) {
    res.status(409).json({ error: "Configura primero los datos obligatorios del negocio." });
    return;
  }
  if (printTemplateConfig) {
    const canonicalTemplate = effectivePrintTemplate(existing);
    const changedCanonicalFields = (["nombreComercial", "datosFiscales", "logoUrl"] as const)
      .filter((field) => (
        field in printTemplateConfig
        && printTemplateConfig[field] !== canonicalTemplate[field]
      ));
    if (changedCanonicalFields.length > 0) {
      res.status(422).json({
        error: "La identidad y los datos fiscales se modifican desde la configuración del negocio.",
        issues: changedCanonicalFields.map((field) => ({
          field: `printTemplateConfig.${field}`,
          message: "Campo canónico de solo lectura.",
        })),
      });
      return;
    }
  }
  const presentationTemplate = printTemplateConfig !== undefined
    ? sanitizePrintTemplate(printTemplateConfig)
    : undefined;
  await db.update(businessConfigTable).set({
    ...(printMode !== undefined && { printMode } as any),
    ...(presentationTemplate !== undefined && { printTemplateConfig: presentationTemplate } as any),
    updatedAt: new Date(),
  }).where(eq(businessConfigTable.id, existing.id));

  await auditPrint(null, "print_config_changed", req.user?.id, req.user?.name ?? "admin", {
    printMode,
    templateFields: presentationTemplate ? Object.keys(presentationTemplate) : [],
  });

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
