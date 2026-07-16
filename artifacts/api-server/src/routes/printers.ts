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
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  buildTestTicket,
  buildReprintHeader,
} from "../lib/ticket-builder";
import { getPrinterStatus } from "../lib/print-connector-sim";

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

// ── POST /admin/printers ──────────────────────────────────────────────────────
router.post("/admin/printers", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { name, type, brand, model, ip, port, paperWidth, copies, active, isPrimary, fallbackPrinterId } =
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
  }).returning();

  await auditPrint(null, "printer_created", req.user?.id, req.user?.name ?? "admin", { printerName: printer.name });
  res.status(201).json(printer);
});

// ── PATCH /admin/printers/:id ─────────────────────────────────────────────────
router.patch("/admin/printers/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { name, type, brand, model, ip, port, paperWidth, copies, active, isPrimary, fallbackPrinterId } =
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

export default router;
