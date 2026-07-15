import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  supplierInvoicesTable,
  supplierInvoiceReceiptLinksTable,
  supplierInvoiceOrderLinksTable,
  suppliersTable,
  goodsReceiptsTable,
  purchaseOrdersTable,
  purchaseAuditLogTable,
} from "@workspace/db";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

async function auditLog(entityId: string, action: string, employeeId: string | null, details?: string) {
  await db.insert(purchaseAuditLogTable).values({
    entityType: "invoice",
    entityId,
    action,
    employeeId: employeeId ?? null,
    details: details ?? null,
  });
}

// ─── GET /admin/supplier-invoices ──────────────────────────────────────────────
router.get("/admin/supplier-invoices", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { supplierId, paymentStatus } = req.query as { supplierId?: string; paymentStatus?: string };
  let query = db.select({
    id: supplierInvoicesTable.id,
    supplierId: supplierInvoicesTable.supplierId,
    supplierName: suppliersTable.commercialName,
    invoiceNumber: supplierInvoicesTable.invoiceNumber,
    invoiceDate: supplierInvoicesTable.invoiceDate,
    taxableBase: supplierInvoicesTable.taxableBase,
    vatAmount: supplierInvoicesTable.vatAmount,
    total: supplierInvoicesTable.total,
    dueDate: supplierInvoicesTable.dueDate,
    paymentStatus: supplierInvoicesTable.paymentStatus,
    paidAt: supplierInvoicesTable.paidAt,
    notes: supplierInvoicesTable.notes,
    createdAt: supplierInvoicesTable.createdAt,
  })
    .from(supplierInvoicesTable)
    .innerJoin(suppliersTable, eq(supplierInvoicesTable.supplierId, suppliersTable.id))
    .$dynamic();

  const conds: any[] = [];
  if (supplierId) conds.push(eq(supplierInvoicesTable.supplierId, supplierId));
  if (paymentStatus) conds.push(eq(supplierInvoicesTable.paymentStatus, paymentStatus));
  if (conds.length) query = query.where(and(...conds));

  const rows = await query.orderBy(desc(supplierInvoicesTable.invoiceDate));
  res.json(rows);
});

// ─── GET /admin/supplier-invoices/:id ─────────────────────────────────────────
router.get("/admin/supplier-invoices/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [invoice] = await db.select({
    id: supplierInvoicesTable.id,
    supplierId: supplierInvoicesTable.supplierId,
    supplierName: suppliersTable.commercialName,
    invoiceNumber: supplierInvoicesTable.invoiceNumber,
    invoiceDate: supplierInvoicesTable.invoiceDate,
    taxableBase: supplierInvoicesTable.taxableBase,
    vatAmount: supplierInvoicesTable.vatAmount,
    total: supplierInvoicesTable.total,
    dueDate: supplierInvoicesTable.dueDate,
    paymentStatus: supplierInvoicesTable.paymentStatus,
    paidAt: supplierInvoicesTable.paidAt,
    notes: supplierInvoicesTable.notes,
    createdAt: supplierInvoicesTable.createdAt,
    updatedAt: supplierInvoicesTable.updatedAt,
  })
    .from(supplierInvoicesTable)
    .innerJoin(suppliersTable, eq(supplierInvoicesTable.supplierId, suppliersTable.id))
    .where(eq(supplierInvoicesTable.id, id));

  if (!invoice) { res.status(404).json({ error: "Factura no encontrada" }); return; }

  // Linked receipts
  const receiptLinks = await db.select({
    id: supplierInvoiceReceiptLinksTable.id,
    receiptId: supplierInvoiceReceiptLinksTable.receiptId,
    receiptNumber: goodsReceiptsTable.receiptNumber,
    receiptDate: goodsReceiptsTable.receiptDate,
    totalAmount: goodsReceiptsTable.totalAmount,
  })
    .from(supplierInvoiceReceiptLinksTable)
    .innerJoin(goodsReceiptsTable, eq(supplierInvoiceReceiptLinksTable.receiptId, goodsReceiptsTable.id))
    .where(eq(supplierInvoiceReceiptLinksTable.invoiceId, id));

  // Linked orders
  const orderLinks = await db.select({
    id: supplierInvoiceOrderLinksTable.id,
    orderId: supplierInvoiceOrderLinksTable.orderId,
    status: purchaseOrdersTable.status,
    orderDate: purchaseOrdersTable.orderDate,
    totalAmount: purchaseOrdersTable.totalAmount,
  })
    .from(supplierInvoiceOrderLinksTable)
    .innerJoin(purchaseOrdersTable, eq(supplierInvoiceOrderLinksTable.orderId, purchaseOrdersTable.id))
    .where(eq(supplierInvoiceOrderLinksTable.invoiceId, id));

  res.json({ ...invoice, receipts: receiptLinks, orders: orderLinks });
});

// ─── POST /admin/supplier-invoices ─────────────────────────────────────────────
router.post("/admin/supplier-invoices", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const {
    supplierId, invoiceNumber, invoiceDate, taxableBase, vatAmount, total,
    dueDate, notes, receiptIds = [], orderIds = [],
  } = req.body as {
    supplierId: string;
    invoiceNumber: string;
    invoiceDate: string;
    taxableBase: string;
    vatAmount: string;
    total: string;
    dueDate?: string;
    notes?: string;
    receiptIds?: string[];
    orderIds?: string[];
  };

  if (!supplierId || !invoiceNumber || !invoiceDate) {
    res.status(400).json({ error: "supplierId, invoiceNumber e invoiceDate son obligatorios" }); return;
  }

  const user = (req as any).user;
  await db.transaction(async (tx) => {
    const [invoice] = await tx.insert(supplierInvoicesTable).values({
      supplierId,
      invoiceNumber,
      invoiceDate,
      taxableBase: String(taxableBase ?? "0"),
      vatAmount: String(vatAmount ?? "0"),
      total: String(total ?? "0"),
      dueDate: dueDate ?? null,
      notes: notes ?? null,
    }).returning();

    if (receiptIds.length > 0) {
      await tx.insert(supplierInvoiceReceiptLinksTable).values(
        receiptIds.map((rid) => ({ invoiceId: invoice.id, receiptId: rid })),
      );
    }
    if (orderIds.length > 0) {
      await tx.insert(supplierInvoiceOrderLinksTable).values(
        orderIds.map((oid) => ({ invoiceId: invoice.id, orderId: oid })),
      );
    }

    await tx.insert(purchaseAuditLogTable).values({
      entityType: "invoice", entityId: invoice.id, action: "create",
      employeeId: user?.id ?? null, details: `Nº ${invoiceNumber}, total ${total}€`,
    });

    res.status(201).json(invoice);
  });
});

// ─── PATCH /admin/supplier-invoices/:id ───────────────────────────────────────
router.patch("/admin/supplier-invoices/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [existing] = await db.select().from(supplierInvoicesTable).where(eq(supplierInvoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Factura no encontrada" }); return; }

  const fields = ["invoiceNumber","invoiceDate","taxableBase","vatAmount","total","dueDate","paymentStatus","notes"] as const;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const f of fields) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }

  if (req.body.paymentStatus === "paid" && existing.paymentStatus !== "paid") {
    updates.paidAt = new Date();
  }

  const [updated] = await db.update(supplierInvoicesTable).set(updates as any).where(eq(supplierInvoicesTable.id, id)).returning();
  const user = (req as any).user;
  await auditLog(id, "update", user?.id ?? null, `paymentStatus: ${updated.paymentStatus}`);
  res.json(updated);
});

// ─── DELETE /admin/supplier-invoices/:id ──────────────────────────────────────
router.delete("/admin/supplier-invoices/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db.delete(supplierInvoicesTable).where(eq(supplierInvoicesTable.id, id));
  res.json({ ok: true });
});

// ─── POST /admin/supplier-invoices/:id/link-receipts ──────────────────────────
router.post("/admin/supplier-invoices/:id/link-receipts", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const invoiceId = req.params.id as string;
  const { receiptIds = [] } = req.body as { receiptIds: string[] };
  if (receiptIds.length > 0) {
    await db.insert(supplierInvoiceReceiptLinksTable).values(
      receiptIds.map((rid) => ({ invoiceId, receiptId: rid })),
    );
  }
  res.json({ ok: true });
});

// ─── POST /admin/supplier-invoices/:id/link-orders ────────────────────────────
router.post("/admin/supplier-invoices/:id/link-orders", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const invoiceId = req.params.id as string;
  const { orderIds = [] } = req.body as { orderIds: string[] };
  if (orderIds.length > 0) {
    await db.insert(supplierInvoiceOrderLinksTable).values(
      orderIds.map((oid) => ({ invoiceId, orderId: oid })),
    );
  }
  res.json({ ok: true });
});

export default router;
