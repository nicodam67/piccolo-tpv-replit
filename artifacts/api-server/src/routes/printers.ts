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
  kitchenTasksTable,
  ordersTable,
  productionDepartmentsTable,
} from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { idempotency } from "../middlewares/idempotency";
import {
  buildTestTicket,
  buildCertificationTestTicket,
  type PrintCertificationProfile,
  buildReprintHeader,
} from "../lib/ticket-builder";
import { getPrinterStatus } from "../lib/print-connector";
import { emitToFunction } from "../lib/socket-events";

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

// ── GET /admin/printers ───────────────────────────────────────────────────────
router.get("/admin/printers", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const printers = await db
    .select()
    .from(printersTable)
    .orderBy(printersTable.name);
  res.json(printers);
});

router.get(
  "/production/printers",
  requireAuth,
  requireRole("admin", "manager", "encargado", "waiter", "kitchen"),
  async (_req, res): Promise<void> => {
    const printers = await db.select({
      id: printersTable.id,
      name: printersTable.name,
      active: printersTable.active,
      lastStatus: printersTable.lastStatus,
    }).from(printersTable).where(eq(printersTable.active, true))
      .orderBy(printersTable.name);
    res.json(printers);
  },
);

// ── POST /admin/printers ──────────────────────────────────────────────────────
router.post("/admin/printers", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const {
    name, type, brand, model, ip, port, paperWidth, copies, active, isPrimary,
    fallbackPrinterId, connectorMode, codePage, cutEnabled, drawerEnabled,
    connectTimeoutMs, writeTimeoutMs,
  } =
    req.body as Partial<typeof printersTable.$inferInsert>;

  if (!name?.trim()) { res.status(400).json({ error: "El nombre es obligatorio." }); return; }

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
    connectorMode: connectorMode ?? "simulator",
    codePage: codePage ?? "cp858",
    cutEnabled: cutEnabled ?? true,
    drawerEnabled: drawerEnabled ?? false,
    connectTimeoutMs: connectTimeoutMs ?? 5000,
    writeTimeoutMs: writeTimeoutMs ?? 10000,
  }).returning();

  await auditPrint(null, "printer_created", req.user?.id, req.user?.name ?? "admin", { printerName: printer.name });
  res.status(201).json(printer);
});

// ── PATCH /admin/printers/:id ─────────────────────────────────────────────────
router.patch("/admin/printers/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const {
    name, type, brand, model, ip, port, paperWidth, copies, active, isPrimary,
    fallbackPrinterId, connectorMode, codePage, cutEnabled, drawerEnabled,
    connectTimeoutMs, writeTimeoutMs,
  } =
    req.body as Partial<typeof printersTable.$inferInsert>;

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
      ...(connectorMode !== undefined && { connectorMode }),
      ...(codePage !== undefined && { codePage }),
      ...(cutEnabled !== undefined && { cutEnabled }),
      ...(drawerEnabled !== undefined && { drawerEnabled }),
      ...(connectTimeoutMs !== undefined && { connectTimeoutMs }),
      ...(writeTimeoutMs !== undefined && { writeTimeoutMs }),
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

// ── POST /admin/printers/:id/test ─────────────────────────────────────────────
router.post(
  "/admin/printers/:id/test",
  requireAuth,
  requireRole("manager", "admin"),
  idempotency,
  async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [printer] = await db.select().from(printersTable).where(eq(printersTable.id, id));
  if (!printer) { res.status(404).json({ error: "Impresora no encontrada." }); return; }

  const profile = (req.body?.profile ?? "standard") as PrintCertificationProfile;
  if (!["standard", "charset", "long", "drawer"].includes(profile)) {
    res.status(400).json({ error: "Perfil de certificación no válido" });
    return;
  }
  const content = profile === "standard"
    ? buildTestTicket(printer.name, printer.type, printer.paperWidth === 80)
    : buildCertificationTestTicket(profile, printer.name, printer.type, printer.paperWidth === 80);
  const [job] = await db.insert(printQueueTable).values({
    printerId: printer.id,
    orderId: null,
    documentType: "test_ticket",
    content,
    status: "pending",
    actorId: req.user?.id ?? null,
    actorName: req.user?.name ?? "admin",
    priority: 20,
    meta: {
      certificationProfile: profile,
      openDrawer: profile === "drawer",
      physicalStatus: "PENDING_PHYSICAL_CERTIFICATION",
    },
  }).returning();

  await auditPrint(job.id, "test", req.user?.id, req.user?.name ?? "admin", {
    printerName: printer.name,
    profile,
    physicalStatus: "PENDING_PHYSICAL_CERTIFICATION",
  });
  res.json({ ok: true, jobId: job.id, profile, physicalStatus: "PENDING_PHYSICAL_CERTIFICATION" });
  },
);

// ── GET /admin/printers/:id/status ────────────────────────────────────────────
router.get("/admin/printers/:id/status", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [printer] = await db.select().from(printersTable).where(eq(printersTable.id, id));
  if (!printer) { res.status(404).json({ error: "Impresora no encontrada." }); return; }

  const statusResult = await getPrinterStatus({
    printerId: printer.id,
    printerIp: printer.ip,
    printerPort: printer.port,
    connectorMode: printer.connectorMode,
    connectTimeoutMs: printer.connectTimeoutMs,
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
    .set({
      status: "pending",
      attempts: 0,
      lastError: null,
      nextAttemptAt: null,
      leaseExpiresAt: null,
      meta: {
        ...((job.meta ?? {}) as Record<string, unknown>),
        autoRecoveryCount: 0,
      },
    })
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
router.post(
  "/admin/print-queue/:id/reprint",
  requireAuth,
  requireRole("manager", "admin"),
  idempotency,
  async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { reason, printerId } = req.body as { reason?: string; printerId?: string };

  const [original] = await db.select().from(printQueueTable).where(eq(printQueueTable.id, id));
  if (!original) { res.status(404).json({ error: "Trabajo no encontrado." }); return; }
  const targetPrinterId = printerId ?? original.printerId;
  const [targetPrinter] = await db.select().from(printersTable)
    .where(eq(printersTable.id, targetPrinterId));
  if (!targetPrinter?.active) { res.status(400).json({ error: "Impresora de destino no válida." }); return; }

  const normalizedReason = reason?.trim() ?? "";
  const reprintHeader = buildReprintHeader(
    normalizedReason || "Reimpresión manual",
    req.user?.name ?? "admin",
    true,
  );
  const [newJob] = await db.insert(printQueueTable).values({
    printerId: targetPrinterId,
    orderId: original.orderId,
    documentType: "reprint",
    content: reprintHeader + original.content,
    status: "pending",
    actorId: req.user?.id ?? null,
    actorName: req.user?.name ?? "admin",
    priority: 10,
    meta: {
      originalJobId: id,
      reason: normalizedReason || null,
      destinationPrinterId: targetPrinterId,
      destinationPrinterName: targetPrinter.name,
    },
  }).returning();

  await auditPrint(newJob.id, "reprinted", req.user?.id, req.user?.name ?? "admin", {
    originalJobId: id,
    reason: normalizedReason || null,
    destinationPrinterId: targetPrinterId,
    destinationPrinterName: targetPrinter.name,
  });
  res.status(201).json(newJob);
  },
);

// ── POST /production/redispatch ───────────────────────────────────────────────
router.post(
  "/production/redispatch",
  requireAuth,
  requireRole("admin", "manager", "encargado", "waiter", "kitchen"),
  idempotency,
  async (req, res): Promise<void> => {
    const {
      sourceType,
      sourceId,
      targets,
      printerId,
      reason,
    } = req.body as {
      sourceType?: "kitchen_task" | "print_job";
      sourceId?: string;
      targets?: Array<"kds" | "printer">;
      printerId?: string;
      reason?: string;
    };
    const normalizedTargets = [...new Set(targets ?? [])];
    if (!sourceId || !["kitchen_task", "print_job"].includes(sourceType ?? "")
      || normalizedTargets.length === 0
      || normalizedTargets.some((target) => !["kds", "printer"].includes(target))) {
      res.status(400).json({ error: "Origen y destinos válidos son obligatorios" });
      return;
    }
    if (sourceType === "print_job" && normalizedTargets.includes("kds")) {
      res.status(400).json({ error: "Para reenviar a KDS selecciona una tarea de cocina" });
      return;
    }
    const role = req.user?.role ?? "";
    if (sourceType === "print_job" && !["manager", "admin"].includes(role)) {
      res.status(403).json({ error: "La reimpresión de trabajos requiere manager o admin" });
      return;
    }
    if (normalizedTargets.includes("printer")
      && !["encargado", "manager", "admin"].includes(role)) {
      res.status(403).json({ error: "El reenvío a impresora requiere encargado, manager o admin" });
      return;
    }

    const now = new Date();
    const actorId = req.user?.id ?? null;
    const actorName = req.user?.name ?? "admin";
    const normalizedReason = reason?.trim() ?? "";

    const result = await db.transaction(async (tx) => {
      let taskResult: typeof kitchenTasksTable.$inferSelect | null = null;
      let jobResult: typeof printQueueTable.$inferSelect | null = null;
      let destination: Record<string, unknown> = {};
      let orderId: string | null = null;

      if (sourceType === "kitchen_task") {
        const [task] = await tx.select().from(kitchenTasksTable)
          .where(eq(kitchenTasksTable.id, sourceId))
          .limit(1);
        if (!task) return { error: "SOURCE_NOT_FOUND" as const };
        orderId = task.orderId;
        const [order] = await tx.select({ status: ordersTable.status }).from(ordersTable)
          .where(eq(ordersTable.id, task.orderId));
        if (!order || ["paid", "completed", "bill_requested"].includes(order.status)) {
          return { error: "ORDER_CLOSED" as const };
        }
        let printerForTask: typeof printersTable.$inferSelect | null = null;
        if (normalizedTargets.includes("printer")) {
          let targetPrinterId = printerId;
          if (!targetPrinterId) {
            const [department] = await tx.select().from(productionDepartmentsTable)
              .where(eq(productionDepartmentsTable.code, task.prepZone));
            targetPrinterId = department?.printerIds?.[0];
          }
          if (!targetPrinterId) return { error: "PRINTER_REQUIRED" as const };
          [printerForTask] = await tx.select().from(printersTable)
            .where(eq(printersTable.id, targetPrinterId));
          if (!printerForTask?.active) return { error: "PRINTER_INVALID" as const };
        }

        if (normalizedTargets.includes("kds")) {
          [taskResult] = await tx.update(kitchenTasksTable).set({
            status: "new",
            updatedAt: now,
            createdAt: now,
            readyAt: null,
            collectedAt: null,
            servedAt: null,
            cancelledAt: null,
            resentAt: now,
            resentBy: actorId,
            resentReason: normalizedReason || null,
            resendCount: sql`${kitchenTasksTable.resendCount} + 1`,
          }).where(eq(kitchenTasksTable.id, task.id)).returning();
          destination.kdsDepartment = task.prepZone;
        }

        if (printerForTask) {
          const mark = [
            "*** REENVIADO ***",
            `Usuario: ${actorName}`,
            `Fecha: ${now.toISOString()}`,
            ...(normalizedReason ? [`Motivo: ${normalizedReason}`] : []),
            "",
          ].join("\n");
          [jobResult] = await tx.insert(printQueueTable).values({
            printerId: printerForTask.id,
            orderId: task.orderId,
            documentType: "reprint",
            content: `${mark}\n${task.quantity} x ${task.productName}\n${task.notes}`,
            status: "pending",
            priority: 10,
            actorId,
            actorName,
            meta: {
              sourceType,
              sourceId,
              mark: "REENVIADO",
              reason: normalizedReason || null,
              destinationPrinterId: printerForTask.id,
              destinationPrinterName: printerForTask.name,
            },
          }).returning();
          destination.printerId = printerForTask.id;
          destination.printerName = printerForTask.name;
        }
      } else {
        const [original] = await tx.select().from(printQueueTable)
          .where(eq(printQueueTable.id, sourceId))
          .limit(1);
        if (!original) return { error: "SOURCE_NOT_FOUND" as const };
        orderId = original.orderId;
        const targetPrinterId = printerId ?? original.printerId;
        const [printer] = await tx.select().from(printersTable)
          .where(eq(printersTable.id, targetPrinterId));
        if (!printer?.active) return { error: "PRINTER_INVALID" as const };
        const reprintHeader = buildReprintHeader(
          normalizedReason || "Reimpresión manual",
          actorName,
          true,
        );
        [jobResult] = await tx.insert(printQueueTable).values({
          printerId: printer.id,
          orderId: original.orderId,
          documentType: "reprint",
          content: reprintHeader + original.content,
          status: "pending",
          priority: 10,
          actorId,
          actorName,
          meta: {
            sourceType,
            sourceId,
            mark: "REIMPRESIÓN",
            reason: normalizedReason || null,
            destinationPrinterId: printer.id,
            destinationPrinterName: printer.name,
          },
        }).returning();
        destination = { printerId: printer.id, printerName: printer.name };
      }

      const [auditRow] = await tx.insert(printAuditTable).values({
        printQueueId: jobResult?.id ?? null,
        action: sourceType === "print_job" ? "reprinted" : "redispatched",
        actorId,
        actorName,
        detail: {
          sourceType,
          sourceId,
          targets: normalizedTargets,
          reason: normalizedReason || null,
          destination,
          orderId,
          mark: sourceType === "print_job" ? "REIMPRESIÓN" : "REENVIADO",
        },
      }).returning();
      return { audit: auditRow, task: taskResult, job: jobResult, destination };
    });

    if ("error" in result) {
      const status = result.error === "SOURCE_NOT_FOUND" ? 404
        : result.error === "ORDER_CLOSED" ? 409 : 400;
      res.status(status).json({ error: result.error });
      return;
    }
    if (result.task) {
      try { emitToFunction("kds", "kds:refresh", { employeeName: actorName }); } catch {}
    }
    res.status(201).json(result);
  },
);

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
