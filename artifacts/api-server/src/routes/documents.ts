import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  documentTemplatesTable,
  printerConfigsTable,
  invoicesTable,
  clientsTable,
  documentAuditLogTable,
  documentReprintsTable,
  businessConfigTable,
  ordersTable,
  orderItemsTable,
  productsTable,
  restaurantTablesTable,
  employeesTable,
  paymentsTable,
  paymentMethodsTable,
  discountsTable,
  ticketsTable,
} from "@workspace/db";
import { eq, and, desc, asc, isNull, sum, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logDocumentAction } from "../lib/document-audit";
import { getNextNumber } from "../lib/invoice-series";
import { idempotency } from "../middlewares/idempotency";
import { createFiscalRecord, FiscalIssuanceError } from "../lib/fiscal-issuance.js";
import { formatAeatDate } from "../lib/verifactu-hash.js";

import { calcMultiRateBreakdown } from "../lib/tax";

const router: IRouter = Router();

function getTerminal(req: Request): string {
  return (req.headers["x-forwarded-for"] as string) ?? req.socket?.remoteAddress ?? "";
}

/**
 * Middleware that enforces admin role AND logs unauthorized attempts BEFORE
 * rejecting. This must run after requireAuth (so req.user is populated) but
 * before the route handler. Placing the audit log here — rather than in a
 * post-route catch-all — ensures 403 attempts are always recorded.
 */
function requireAdminWithAudit(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user || user.role !== "admin") {
    // Log the attempt first (fire-and-forget, don't block the 403 response)
    logDocumentAction({
      action: "unauthorized_attempt",
      documentType: "config",
      documentId: "",
      employeeId: user?.id ?? null,
      employeeName: user?.name ?? "(unauthenticated)",
      terminal: getTerminal(req),
      details: `Intento no autorizado: ${req.method} ${req.path}`,
    }).catch(() => {/* swallow */});
    res.status(403).json({ error: "No tienes permisos para realizar esta acción" });
    return;
  }
  next();
}

// ============================================================
// TEMPLATES
// ============================================================

router.get(
  "/documents/templates",
  requireAuth,
  requireAdminWithAudit,
  async (req, res): Promise<void> => {
    const { documentType } = req.query as { documentType?: string };
    let query = db
      .select()
      .from(documentTemplatesTable)
      .where(isNull(documentTemplatesTable.deletedAt))
      .orderBy(asc(documentTemplatesTable.createdAt));

    const rows = documentType
      ? await db
          .select()
          .from(documentTemplatesTable)
          .where(
            and(
              isNull(documentTemplatesTable.deletedAt),
              eq(documentTemplatesTable.documentType, documentType)
            )
          )
          .orderBy(asc(documentTemplatesTable.createdAt))
      : await query;

    res.json(rows);
  }
);

router.post(
  "/documents/templates",
  requireAuth,
  requireAdminWithAudit,
  async (req, res): Promise<void> => {
    const { name, documentType, printFormat, config } = req.body as {
      name: string;
      documentType: string;
      printFormat?: string;
      config?: object;
    };

    if (!name || !documentType) {
      res.status(400).json({ error: "name y documentType son obligatorios" });
      return;
    }

    const [template] = await db
      .insert(documentTemplatesTable)
      .values({
        name,
        documentType,
        printFormat: printFormat ?? "thermal_80mm",
        config: config ?? {},
      })
      .returning();

    const user = (req as any).user;
    await logDocumentAction({
      action: "create_template",
      documentType,
      documentId: template.id,
      employeeId: user.id,
      employeeName: user.name,
      terminal: getTerminal(req),
      details: `Plantilla "${name}" creada`,
    });

    res.status(201).json(template);
  }
);

router.put(
  "/documents/templates/:id",
  requireAuth,
  requireAdminWithAudit,
  async (req, res): Promise<void> => {
    const id = req.params["id"] as string;
    const { name, printFormat, config } = req.body as {
      name?: string;
      printFormat?: string;
      config?: object;
    };

    const [existing] = await db
      .select()
      .from(documentTemplatesTable)
      .where(and(eq(documentTemplatesTable.id, id), isNull(documentTemplatesTable.deletedAt)));

    if (!existing) {
      res.status(404).json({ error: "Plantilla no encontrada" });
      return;
    }

    const [updated] = await db
      .update(documentTemplatesTable)
      .set({
        name: name ?? existing.name,
        printFormat: printFormat ?? existing.printFormat,
        config: config ?? existing.config,
        updatedAt: new Date(),
      })
      .where(eq(documentTemplatesTable.id, id))
      .returning();

    res.json(updated);
  }
);

router.post(
  "/documents/templates/:id/activate",
  requireAuth,
  requireAdminWithAudit,
  async (req, res): Promise<void> => {
    const id = req.params["id"] as string;

    const [template] = await db
      .select()
      .from(documentTemplatesTable)
      .where(and(eq(documentTemplatesTable.id, id), isNull(documentTemplatesTable.deletedAt)));

    if (!template) {
      res.status(404).json({ error: "Plantilla no encontrada" });
      return;
    }

    // Deactivate all others for same documentType+printFormat
    await db
      .update(documentTemplatesTable)
      .set({ isDefault: false })
      .where(
        and(
          eq(documentTemplatesTable.documentType, template.documentType),
          eq(documentTemplatesTable.printFormat, template.printFormat)
        )
      );

    const [activated] = await db
      .update(documentTemplatesTable)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(documentTemplatesTable.id, id))
      .returning();

    const user = (req as any).user;
    await logDocumentAction({
      action: "activate_template",
      documentType: template.documentType,
      documentId: id,
      employeeId: user.id,
      employeeName: user.name,
      terminal: getTerminal(req),
      details: `Plantilla "${template.name}" activada como predeterminada`,
    });

    res.json(activated);
  }
);

router.post(
  "/documents/templates/:id/duplicate",
  requireAuth,
  requireAdminWithAudit,
  async (req, res): Promise<void> => {
    const id = req.params["id"] as string;

    const [template] = await db
      .select()
      .from(documentTemplatesTable)
      .where(and(eq(documentTemplatesTable.id, id), isNull(documentTemplatesTable.deletedAt)));

    if (!template) {
      res.status(404).json({ error: "Plantilla no encontrada" });
      return;
    }

    const [cloned] = await db
      .insert(documentTemplatesTable)
      .values({
        name: `${template.name} (copia)`,
        documentType: template.documentType,
        printFormat: template.printFormat,
        isDefault: false,
        isBuiltIn: false,
        config: template.config as object,
      })
      .returning();

    res.status(201).json(cloned);
  }
);

router.delete(
  "/documents/templates/:id",
  requireAuth,
  requireAdminWithAudit,
  async (req, res): Promise<void> => {
    const id = req.params["id"] as string;

    const [template] = await db
      .select()
      .from(documentTemplatesTable)
      .where(and(eq(documentTemplatesTable.id, id), isNull(documentTemplatesTable.deletedAt)));

    if (!template) {
      res.status(404).json({ error: "Plantilla no encontrada" });
      return;
    }

    if (template.isDefault) {
      res.status(409).json({ error: "No se puede eliminar la plantilla activa. Activa otra primero." });
      return;
    }

    await db
      .update(documentTemplatesTable)
      .set({ deletedAt: new Date() })
      .where(eq(documentTemplatesTable.id, id));

    res.json({ ok: true });
  }
);

// ============================================================
// PRINTERS
// ============================================================

router.get(
  "/documents/printers",
  requireAuth,
  requireAdminWithAudit,
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(printerConfigsTable)
      .where(eq(printerConfigsTable.active, true))
      .orderBy(asc(printerConfigsTable.createdAt));
    res.json(rows);
  }
);

router.post(
  "/documents/printers",
  requireAuth,
  requireAdminWithAudit,
  async (req, res): Promise<void> => {
    const body = req.body as Partial<typeof printerConfigsTable.$inferInsert>;
    if (!body.name) {
      res.status(400).json({ error: "name es obligatorio" });
      return;
    }

    const [printer] = await db.insert(printerConfigsTable).values(body as any).returning();
    res.status(201).json(printer);
  }
);

router.put(
  "/documents/printers/:id",
  requireAuth,
  requireAdminWithAudit,
  async (req, res): Promise<void> => {
    const id = req.params["id"] as string;
    const body = req.body as Partial<typeof printerConfigsTable.$inferInsert>;

    const [existing] = await db
      .select()
      .from(printerConfigsTable)
      .where(eq(printerConfigsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Impresora no encontrada" });
      return;
    }

    const [updated] = await db
      .update(printerConfigsTable)
      .set(body as any)
      .where(eq(printerConfigsTable.id, id))
      .returning();

    res.json(updated);
  }
);

router.delete(
  "/documents/printers/:id",
  requireAuth,
  requireAdminWithAudit,
  async (req, res): Promise<void> => {
    const id = req.params["id"] as string;
    await db
      .update(printerConfigsTable)
      .set({ active: false })
      .where(eq(printerConfigsTable.id, id));
    res.json({ ok: true });
  }
);

// ============================================================
// INVOICES (full fiscal invoices)
// ============================================================

router.post(
  "/documents/invoices",
  requireAuth,
  requireRole("admin", "manager", "encargado"),
  idempotency,
  async (req, res): Promise<void> => {
    const user = (req as any).user;
    const {
      orderId,
      clientName,
      clientNif,
      clientAddress,
      clientCp,
      clientCity,
      clientProvince,
      clientCountry,
      clientEmail,
      clientPhone,
      notes,
    } = req.body as Record<string, string>;

    if (!orderId) {
      res.status(400).json({ error: "orderId es obligatorio" });
      return;
    }

    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`);
        const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId));
        if (!order) throw new FiscalIssuanceError("ORDER_NOT_FOUND", "Pedido no encontrado");

        const [existingTicket] = await tx
          .select({ id: ticketsTable.id })
          .from(ticketsTable)
          .where(eq(ticketsTable.orderId, orderId))
          .limit(1);
        if (existingTicket) {
          throw new FiscalIssuanceError(
            "SIMPLIFIED_INVOICE_EXISTS",
            "El pedido ya tiene factura simplificada; no se puede emitir otra factura sin rectificación",
          );
        }

        const [existing] = await tx
          .select()
          .from(invoicesTable)
          .where(and(eq(invoicesTable.orderId, orderId), eq(invoicesTable.serie, "F")))
          .limit(1);
        if (existing) {
          await createFiscalRecord(tx, {
            invoiceId: existing.id,
            serie: existing.serie,
            numero: existing.invoiceNumber,
            issuedAt: existing.issuedAt,
            tipoFactura: "F1",
            emisorNif: existing.emisorNif,
            emisorNombre: existing.emisorNombre,
            destinatarioNif: existing.clientNif,
            destinatarioNombre: existing.clientName,
            baseImponible: existing.subtotal,
            cuotaTotal: existing.taxTotal,
            importeTotal: existing.total,
            desgloseIva: ((existing.taxBreakdown ?? []) as Array<{ rate: number; base: string; cuota: string }>).map((tax) => ({
              tipoImpositivo: Number(tax.rate).toFixed(2),
              baseImponible: tax.base,
              cuotaRepercutida: tax.cuota,
            })),
            empleadoId: user.id,
            empleadoNombre: user.name,
            terminal: getTerminal(req),
          });
          return { invoice: existing, idempotent: true };
        }

        const [config] = await tx.select().from(businessConfigTable).limit(1);
        const items = await tx
          .select({
            unitPrice: orderItemsTable.unitPrice,
            quantity: orderItemsTable.quantity,
            taxRate: orderItemsTable.taxRate,
          })
          .from(orderItemsTable)
          .where(eq(orderItemsTable.orderId, orderId));
        const lineTotals = items.map((item) => ({
          lineTotal: parseFloat(item.unitPrice) * item.quantity,
          taxRate: item.taxRate ?? 10,
        }));
        const discountResult = await tx
          .select({ total: sum(discountsTable.discountAmount) })
          .from(discountsTable)
          .where(eq(discountsTable.orderId, orderId));
        const totals = calcMultiRateBreakdown(
          lineTotals,
          parseFloat(discountResult[0]?.total ?? "0"),
        );
        const [paymentRow] = await tx
          .select({ methodName: paymentMethodsTable.name })
          .from(paymentsTable)
          .innerJoin(paymentMethodsTable, eq(paymentsTable.paymentMethodId, paymentMethodsTable.id))
          .where(and(eq(paymentsTable.orderId, orderId), eq(paymentsTable.status, "completed")))
          .limit(1);
        const invoiceNum = await getNextNumber("F", "factura", tx);
        const issuedAt = new Date();
        const [invoice] = await tx
          .insert(invoicesTable)
          .values({
            serie: "F",
            invoiceNumber: invoiceNum,
            issuedAt,
            emisorNombre: config?.razonSocial || config?.nombreComercial || "",
            emisorNif: config?.nif ?? "",
            emisorDireccion: config?.direccionFiscal ?? "",
            emisorCp: config?.codigoPostal ?? "",
            emisorPoblacion: config?.poblacion ?? "",
            emisorProvincia: config?.provincia ?? "",
            emisorPais: config?.pais ?? "España",
            clientName: clientName ?? "",
            clientNif: clientNif ?? "",
            clientAddress: clientAddress ?? "",
            clientCp: clientCp ?? "",
            clientCity: clientCity ?? "",
            clientProvince: clientProvince ?? "",
            clientCountry: clientCountry ?? "España",
            clientEmail: clientEmail ?? "",
            clientPhone: clientPhone ?? "",
            orderId,
            subtotal: totals.subtotal,
            taxTotal: totals.taxTotal,
            total: totals.total,
            taxBreakdown: totals.taxBreakdown,
            paymentMethod: paymentRow?.methodName ?? "",
            notes: notes ?? "",
            status: "issued",
            verifactuStatus: "pending",
            employeeId: user.id,
          })
          .returning();

        await createFiscalRecord(tx, {
          invoiceId: invoice.id,
          serie: invoice.serie,
          numero: invoice.invoiceNumber,
          issuedAt,
          tipoFactura: "F1",
          emisorNif: invoice.emisorNif,
          emisorNombre: invoice.emisorNombre,
          destinatarioNif: invoice.clientNif,
          destinatarioNombre: invoice.clientName,
          baseImponible: totals.subtotal,
          cuotaTotal: totals.taxTotal,
          importeTotal: totals.total,
          desgloseIva: totals.taxBreakdown.map((tax) => ({
            tipoImpositivo: Number(tax.rate).toFixed(2),
            baseImponible: tax.base,
            cuotaRepercutida: tax.cuota,
          })),
          empleadoId: user.id,
          empleadoNombre: user.name,
          terminal: getTerminal(req),
        });
        await tx.insert(documentAuditLogTable).values({
          action: "issue_invoice",
          documentType: "factura_completa",
          documentId: invoice.id,
          employeeId: user.id,
          employeeName: user.name,
          terminal: getTerminal(req),
          amount: totals.total,
          details: `Factura F-${invoiceNum} y registro fiscal emitidos atómicamente`,
        });
        return { invoice, idempotent: false };
      });

      res.status(result.idempotent ? 200 : 201).json({
        ...result.invoice,
        ...(result.idempotent ? { idempotent: true } : {}),
      });
    } catch (error) {
      if (error instanceof FiscalIssuanceError) {
        const status =
          error.code === "ORDER_NOT_FOUND" ? 404
            : error.code === "SIMPLIFIED_INVOICE_EXISTS" ? 409
              : 503;
        res.status(status).json({ error: error.message, code: error.code, recoverable: status === 503 });
        return;
      }
      console.error("[documents] atomic invoice issuance failed:", error);
      res.status(503).json({
        error: "No se pudo emitir la factura fiscal. La transacción se revirtió; reintenta.",
        code: "FISCAL_TRANSACTION_FAILED",
        recoverable: true,
      });
    }
  }
);

router.get(
  "/documents/invoices/:id",
  requireAuth,
  requireRole("admin", "manager"),
  async (req, res): Promise<void> => {
    const id = req.params["id"] as string;
    const [invoice] = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.id, id));

    if (!invoice) {
      res.status(404).json({ error: "Factura no encontrada" });
      return;
    }

    // Enrich with order items
    let items: any[] = [];
    if (invoice.orderId) {
      items = await db
        .select({
          productName: orderItemsTable.productNameSnapshot,
          quantity: orderItemsTable.quantity,
          unitPrice: orderItemsTable.unitPrice,
        })
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, invoice.orderId));
    }

    res.json({ invoice, items });
  }
);

router.post(
  "/documents/invoices/:id/rectify",
  requireAuth,
  requireAdminWithAudit,
  idempotency,
  async (req, res): Promise<void> => {
    const id = req.params["id"] as string;
    const user = (req as any).user;
    const { reason } = req.body as { reason: string };

    if (!reason) {
      res.status(400).json({ error: "reason es obligatorio para una rectificativa" });
      return;
    }

    try {
      const rectificativa = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM invoices WHERE id = ${id} FOR UPDATE`);
        const [original] = await tx
          .select()
          .from(invoicesTable)
          .where(eq(invoicesTable.id, id));
        if (!original) {
          throw new FiscalIssuanceError("INVOICE_NOT_FOUND", "Factura original no encontrada");
        }
        if (original.status !== "issued") {
          throw new FiscalIssuanceError(
            "INVOICE_NOT_RECTIFIABLE",
            "Solo se pueden rectificar facturas en estado 'issued'",
          );
        }

        const originalBreakdown =
          (original.taxBreakdown ?? []) as Array<{ rate: number; base: string; cuota: string }>;
        // Repair a legacy issued invoice atomically before appending its
        // rectification. For current invoices this is an idempotent lookup.
        await createFiscalRecord(tx, {
          invoiceId: original.id,
          serie: original.serie,
          numero: original.invoiceNumber,
          issuedAt: original.issuedAt,
          tipoFactura: original.serie === "R" ? "R1" : "F1",
          emisorNif: original.emisorNif,
          emisorNombre: original.emisorNombre,
          destinatarioNif: original.clientNif,
          destinatarioNombre: original.clientName,
          baseImponible: original.subtotal,
          cuotaTotal: original.taxTotal,
          importeTotal: original.total,
          desgloseIva: originalBreakdown.map((tax) => ({
            tipoImpositivo: Number(tax.rate).toFixed(2),
            baseImponible: tax.base,
            cuotaRepercutida: tax.cuota,
          })),
          empleadoId: user.id,
          empleadoNombre: user.name,
          terminal: getTerminal(req),
        });

        const invoiceNum = await getNextNumber("R", "factura", tx);
        const issuedAt = new Date();
        const taxBreakdown = originalBreakdown.map((tax) => ({
          rate: tax.rate,
          base: (-Number(tax.base)).toFixed(2),
          cuota: (-Number(tax.cuota)).toFixed(2),
        }));
        const [created] = await tx
          .insert(invoicesTable)
          .values({
            serie: "R",
            invoiceNumber: invoiceNum,
            issuedAt,
            emisorNombre: original.emisorNombre,
            emisorNif: original.emisorNif,
            emisorDireccion: original.emisorDireccion,
            emisorCp: original.emisorCp,
            emisorPoblacion: original.emisorPoblacion,
            emisorProvincia: original.emisorProvincia,
            emisorPais: original.emisorPais,
            clientName: original.clientName,
            clientNif: original.clientNif,
            clientAddress: original.clientAddress,
            clientCp: original.clientCp,
            clientCity: original.clientCity,
            clientProvince: original.clientProvince,
            clientCountry: original.clientCountry,
            clientEmail: original.clientEmail,
            clientPhone: original.clientPhone,
            orderId: original.orderId,
            subtotal: (-Number(original.subtotal)).toFixed(2),
            taxTotal: (-Number(original.taxTotal)).toFixed(2),
            total: (-Number(original.total)).toFixed(2),
            taxBreakdown,
            paymentMethod: original.paymentMethod,
            notes: reason,
            status: "issued",
            originalInvoiceId: id,
            rectificationReason: reason,
            verifactuStatus: "pending",
            employeeId: user.id,
          })
          .returning();

        await createFiscalRecord(tx, {
          invoiceId: created.id,
          serie: created.serie,
          numero: created.invoiceNumber,
          issuedAt,
          tipoFactura: "R1",
          emisorNif: created.emisorNif,
          emisorNombre: created.emisorNombre,
          destinatarioNif: created.clientNif,
          destinatarioNombre: created.clientName,
          baseImponible: created.subtotal,
          cuotaTotal: created.taxTotal,
          importeTotal: created.total,
          desgloseIva: taxBreakdown.map((tax) => ({
            tipoImpositivo: Number(tax.rate).toFixed(2),
            baseImponible: tax.base,
            cuotaRepercutida: tax.cuota,
          })),
          original: {
            serie: original.serie,
            numero: original.invoiceNumber,
            fechaExpedicion: formatAeatDate(original.issuedAt),
            motivo: reason,
            tipoRectificativa: "I",
          },
          empleadoId: user.id,
          empleadoNombre: user.name,
          terminal: getTerminal(req),
        });
        await tx
          .update(invoicesTable)
          .set({ status: "rectified", verifactuStatus: "rectified" })
          .where(eq(invoicesTable.id, id));
        await tx.insert(documentAuditLogTable).values({
          action: "create_rectificativa",
          documentType: "factura_completa",
          documentId: created.id,
          employeeId: user.id,
          employeeName: user.name,
          terminal: getTerminal(req),
          details: `Rectificativa R-${invoiceNum} y registro fiscal emitidos atómicamente sobre ${id}. Motivo: ${reason}`,
        });
        return created;
      });

      res.status(201).json({ rectificativa, originalId: id });
    } catch (error) {
      if (error instanceof FiscalIssuanceError) {
        const status =
          error.code === "INVOICE_NOT_FOUND" ? 404
            : error.code === "INVOICE_NOT_RECTIFIABLE" ? 409
              : 503;
        res.status(status).json({ error: error.message, code: error.code, recoverable: status === 503 });
        return;
      }
      console.error("[documents] atomic rectification failed:", error);
      res.status(503).json({
        error: "No se pudo emitir la rectificativa. La transacción se revirtió; reintenta.",
        code: "FISCAL_TRANSACTION_FAILED",
        recoverable: true,
      });
    }
  }
);

// ============================================================
// CLIENTS
// ============================================================

router.get(
  "/documents/clients",
  requireAuth,
  requireRole("admin", "manager"),
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(clientsTable)
      .orderBy(asc(clientsTable.name));
    res.json(rows);
  }
);

router.post(
  "/documents/clients",
  requireAuth,
  requireRole("admin", "manager"),
  async (req, res): Promise<void> => {
    const body = req.body as Partial<typeof clientsTable.$inferInsert>;
    if (!body.name) {
      res.status(400).json({ error: "name es obligatorio" });
      return;
    }
    const [client] = await db.insert(clientsTable).values(body as any).returning();
    res.status(201).json(client);
  }
);

router.put(
  "/documents/clients/:id",
  requireAuth,
  requireRole("admin", "manager"),
  async (req, res): Promise<void> => {
    const id = req.params["id"] as string;
    const body = req.body as Partial<typeof clientsTable.$inferInsert>;

    const [existing] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Cliente no encontrado" });
      return;
    }

    const [updated] = await db
      .update(clientsTable)
      .set(body as any)
      .where(eq(clientsTable.id, id))
      .returning();

    res.json(updated);
  }
);

// ============================================================
// REPRINTS
// ============================================================

router.post(
  "/documents/reprints",
  requireAuth,
  async (req, res): Promise<void> => {
    const user = (req as any).user;
    const { documentId, documentType, reason } = req.body as {
      documentId: string;
      documentType: string;
      reason?: string;
    };

    if (!documentId || !documentType) {
      res.status(400).json({ error: "documentId y documentType son obligatorios" });
      return;
    }

    const [reprint] = await db
      .insert(documentReprintsTable)
      .values({
        documentId,
        documentType,
        employeeId: user.id,
        employeeName: user.name,
        reason: reason ?? "",
      })
      .returning();

    await logDocumentAction({
      action: "reprint_document",
      documentType,
      documentId,
      employeeId: user.id,
      employeeName: user.name,
      terminal: getTerminal(req),
      details: `Reimpresión de ${documentType} ${documentId}`,
    });

    res.status(201).json(reprint);
  }
);

// ============================================================
// AUDIT LOG
// ============================================================

router.get(
  "/documents/audit",
  requireAuth,
  requireAdminWithAudit,
  async (req, res): Promise<void> => {
    const page = parseInt((req.query["page"] as string) ?? "1", 10);
    const limit = parseInt((req.query["limit"] as string) ?? "50", 10);
    const offset = (page - 1) * limit;

    const rows = await db
      .select()
      .from(documentAuditLogTable)
      .orderBy(desc(documentAuditLogTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ rows, page, limit });
  }
);

export default router;
