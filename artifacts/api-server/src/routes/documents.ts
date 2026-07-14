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
} from "@workspace/db";
import { eq, and, desc, asc, isNull, sum } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logDocumentAction } from "../lib/document-audit";
import { getNextNumber } from "../lib/invoice-series";

const router: IRouter = Router();
const TAX_RATE = 0.10;

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
  requireRole("admin", "manager", "waiter"),
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

    // Get business config for emisor fields
    const [config] = await db.select().from(businessConfigTable).limit(1);

    // Get order to calculate totals
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
    if (!order) {
      res.status(404).json({ error: "Pedido no encontrado" });
      return;
    }

    const items = await db
      .select({ unitPrice: orderItemsTable.unitPrice, quantity: orderItemsTable.quantity })
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, orderId));

    const itemTotal = items.reduce(
      (acc, it) => acc + parseFloat(it.unitPrice) * it.quantity,
      0
    );
    const total = itemTotal;
    const taxTotal = parseFloat((total * TAX_RATE / (1 + TAX_RATE)).toFixed(2));
    const subtotal = parseFloat((total - taxTotal).toFixed(2));

    // Get payment method used
    const [paymentRow] = await db
      .select({ methodName: paymentMethodsTable.name })
      .from(paymentsTable)
      .innerJoin(paymentMethodsTable, eq(paymentsTable.paymentMethodId, paymentMethodsTable.id))
      .where(and(eq(paymentsTable.orderId, orderId), eq(paymentsTable.status, "completed")))
      .limit(1);

    // Get next invoice number atomically
    const invoiceNum = await getNextNumber("F", "factura");

    const [invoice] = await db
      .insert(invoicesTable)
      .values({
        serie: "F",
        invoiceNumber: invoiceNum,
        emisorNombre: config?.nombreComercial ?? "",
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
        subtotal: subtotal.toFixed(2),
        taxTotal: taxTotal.toFixed(2),
        total: total.toFixed(2),
        paymentMethod: paymentRow?.methodName ?? "",
        notes: notes ?? "",
        status: "issued",
        verifactuStatus: "pending",
        employeeId: user.id,
      })
      .returning();

    await logDocumentAction({
      action: "issue_invoice",
      documentType: "factura_completa",
      documentId: invoice.id,
      employeeId: user.id,
      employeeName: user.name,
      terminal: getTerminal(req),
      amount: total.toFixed(2),
      details: `Factura F-${invoiceNum} emitida`,
    });

    res.status(201).json(invoice);
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
          productName: productsTable.name,
          quantity: orderItemsTable.quantity,
          unitPrice: orderItemsTable.unitPrice,
        })
        .from(orderItemsTable)
        .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
        .where(eq(orderItemsTable.orderId, invoice.orderId));
    }

    res.json({ invoice, items });
  }
);

router.post(
  "/documents/invoices/:id/rectify",
  requireAuth,
  requireAdminWithAudit,
  async (req, res): Promise<void> => {
    const id = req.params["id"] as string;
    const user = (req as any).user;
    const { reason } = req.body as { reason: string };

    if (!reason) {
      res.status(400).json({ error: "reason es obligatorio para una rectificativa" });
      return;
    }

    const [original] = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.id, id));

    if (!original) {
      res.status(404).json({ error: "Factura original no encontrada" });
      return;
    }

    if (original.status !== "issued") {
      res.status(409).json({ error: "Solo se pueden rectificar facturas en estado 'issued'" });
      return;
    }

    const invoiceNum = await getNextNumber("R", "factura");

    const [rectificativa] = await db
      .insert(invoicesTable)
      .values({
        serie: "R",
        invoiceNumber: invoiceNum,
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
        subtotal: `-${original.subtotal}`,
        taxTotal: `-${original.taxTotal}`,
        total: `-${original.total}`,
        paymentMethod: original.paymentMethod,
        notes: reason,
        status: "issued",
        originalInvoiceId: id,
        rectificationReason: reason,
        verifactuStatus: "pending",
        employeeId: user.id,
      })
      .returning();

    // Mark original as rectified
    await db
      .update(invoicesTable)
      .set({ status: "rectified" })
      .where(eq(invoicesTable.id, id));

    await logDocumentAction({
      action: "create_rectificativa",
      documentType: "factura_completa",
      documentId: rectificativa.id,
      employeeId: user.id,
      employeeName: user.name,
      terminal: getTerminal(req),
      details: `Rectificativa R-${invoiceNum} de factura ${id}. Motivo: ${reason}`,
    });

    res.status(201).json({ rectificativa, originalId: id });
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
