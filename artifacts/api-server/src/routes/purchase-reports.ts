import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  purchaseOrdersTable,
  purchaseOrderItemsTable,
  goodsReceiptsTable,
  goodsReceiptItemsTable,
  supplierInvoicesTable,
  ingredientLotsTable,
  suppliersTable,
  ingredientsTable,
  ingredientCostHistoryTable,
  supplierInvoiceReceiptLinksTable,
  supplierInvoiceOrderLinksTable,
} from "@workspace/db";
import { eq, and, asc, desc, gte, lte, sum, avg, count, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// ─── GET /admin/purchase-reports/by-supplier ──────────────────────────────────
// Purchases grouped by supplier for a time period
router.get("/admin/purchase-reports/by-supplier", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { from, to } = req.query as { from?: string; to?: string };
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400_000);

  const orders = await db.select({
    supplierId: purchaseOrdersTable.supplierId,
    supplierName: suppliersTable.commercialName,
    orderCount: count(purchaseOrdersTable.id).mapWith(Number),
    totalAmount: sum(purchaseOrdersTable.totalAmount).mapWith(Number),
  })
    .from(purchaseOrdersTable)
    .innerJoin(suppliersTable, eq(purchaseOrdersTable.supplierId, suppliersTable.id))
    .where(and(
      gte(purchaseOrdersTable.orderDate, fromDate),
      lte(purchaseOrdersTable.orderDate, toDate),
      inArray(purchaseOrdersTable.status, ["received","partially_received","confirmed","sent"]),
    ))
    .groupBy(purchaseOrdersTable.supplierId, suppliersTable.commercialName)
    .orderBy(desc(sum(purchaseOrdersTable.totalAmount)));

  res.json({ from: fromDate.toISOString(), to: toDate.toISOString(), suppliers: orders });
});

// ─── GET /admin/purchase-reports/price-evolution ──────────────────────────────
// Price evolution for an ingredient over time
router.get("/admin/purchase-reports/price-evolution", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { ingredientId, limit = "50" } = req.query as { ingredientId?: string; limit?: string };

  let query = db.select({
    id: ingredientCostHistoryTable.id,
    ingredientId: ingredientCostHistoryTable.ingredientId,
    ingredientName: ingredientsTable.name,
    previousCost: ingredientCostHistoryTable.previousCost,
    newCost: ingredientCostHistoryTable.newCost,
    supplierName: ingredientCostHistoryTable.supplierName,
    reason: ingredientCostHistoryTable.reason,
    createdAt: ingredientCostHistoryTable.createdAt,
  })
    .from(ingredientCostHistoryTable)
    .innerJoin(ingredientsTable, eq(ingredientCostHistoryTable.ingredientId, ingredientsTable.id))
    .$dynamic();

  if (ingredientId) {
    query = query.where(eq(ingredientCostHistoryTable.ingredientId, ingredientId));
  }

  const rows = await query
    .orderBy(desc(ingredientCostHistoryTable.createdAt))
    .limit(Math.min(parseInt(limit), 500));

  res.json(rows);
});

// ─── GET /admin/purchase-reports/most-purchased ───────────────────────────────
// Most purchased ingredients by qty in a period
router.get("/admin/purchase-reports/most-purchased", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { from, to, limit = "20" } = req.query as { from?: string; to?: string; limit?: string };
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400_000);

  const rows = await db.select({
    ingredientId: goodsReceiptItemsTable.ingredientId,
    ingredientName: ingredientsTable.name,
    ingredientUnit: ingredientsTable.unit,
    totalQtyReceived: sum(goodsReceiptItemsTable.qtyReceived).mapWith(Number),
    totalValue: sql<number>`sum(cast(${goodsReceiptItemsTable.qtyReceived} as numeric) * cast(${goodsReceiptItemsTable.unitPrice} as numeric))`,
    receiptCount: count(goodsReceiptItemsTable.id).mapWith(Number),
  })
    .from(goodsReceiptItemsTable)
    .innerJoin(ingredientsTable, eq(goodsReceiptItemsTable.ingredientId, ingredientsTable.id))
    .innerJoin(goodsReceiptsTable, eq(goodsReceiptItemsTable.receiptId, goodsReceiptsTable.id))
    .where(and(
      gte(goodsReceiptsTable.receiptDate, fromDate),
      lte(goodsReceiptsTable.receiptDate, toDate),
    ))
    .groupBy(goodsReceiptItemsTable.ingredientId, ingredientsTable.name, ingredientsTable.unit)
    .orderBy(desc(sum(goodsReceiptItemsTable.qtyReceived)))
    .limit(Math.min(parseInt(limit), 100));

  res.json({ from: fromDate.toISOString(), to: toDate.toISOString(), ingredients: rows });
});

// ─── GET /admin/purchase-reports/order-vs-receipt ────────────────────────────
// Differences between ordered and received quantities/prices
router.get("/admin/purchase-reports/order-vs-receipt", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { orderId } = req.query as { orderId?: string };
  if (!orderId) {
    // List all orders that have discrepancies
    const allOrders = await db.select({
      id: purchaseOrdersTable.id,
      supplierId: purchaseOrdersTable.supplierId,
      supplierName: suppliersTable.commercialName,
      status: purchaseOrdersTable.status,
      orderDate: purchaseOrdersTable.orderDate,
    })
      .from(purchaseOrdersTable)
      .innerJoin(suppliersTable, eq(purchaseOrdersTable.supplierId, suppliersTable.id))
      .where(inArray(purchaseOrdersTable.status, ["partially_received","received"]))
      .orderBy(desc(purchaseOrdersTable.orderDate))
      .limit(50);
    res.json(allOrders);
    return;
  }

  const orderItems = await db.select({
    id: purchaseOrderItemsTable.id,
    ingredientId: purchaseOrderItemsTable.ingredientId,
    ingredientName: ingredientsTable.name,
    qtyOrdered: purchaseOrderItemsTable.quantity,
    orderedPrice: purchaseOrderItemsTable.unitPrice,
  })
    .from(purchaseOrderItemsTable)
    .innerJoin(ingredientsTable, eq(purchaseOrderItemsTable.ingredientId, ingredientsTable.id))
    .where(eq(purchaseOrderItemsTable.orderId, orderId));

  const receiptItems = await db.select({
    ingredientId: goodsReceiptItemsTable.ingredientId,
    qtyReceived: sum(goodsReceiptItemsTable.qtyReceived).mapWith(Number),
    qtyRejected: sum(goodsReceiptItemsTable.qtyRejected).mapWith(Number),
    avgUnitPrice: avg(goodsReceiptItemsTable.unitPrice).mapWith(Number),
  })
    .from(goodsReceiptItemsTable)
    .innerJoin(goodsReceiptsTable, eq(goodsReceiptItemsTable.receiptId, goodsReceiptsTable.id))
    .where(eq(goodsReceiptsTable.orderId, orderId))
    .groupBy(goodsReceiptItemsTable.ingredientId);

  const receivedMap = new Map(receiptItems.map((r) => [r.ingredientId, r]));

  const diffs = orderItems.map((oi) => {
    const recv = receivedMap.get(oi.ingredientId);
    const qtyOrdered = parseFloat(oi.qtyOrdered ?? "0");
    const qtyReceived = recv?.qtyReceived ?? 0;
    const qtyRejected = recv?.qtyRejected ?? 0;
    const orderedPrice = parseFloat(oi.orderedPrice ?? "0");
    const receivedPrice = recv?.avgUnitPrice ?? orderedPrice;
    const priceDiff = receivedPrice - orderedPrice;
    const priceDiffPct = orderedPrice > 0 ? (priceDiff / orderedPrice) * 100 : 0;
    return {
      ingredientId: oi.ingredientId,
      ingredientName: oi.ingredientName,
      qtyOrdered: qtyOrdered.toFixed(4),
      qtyReceived: qtyReceived.toFixed(4),
      qtyRejected: qtyRejected.toFixed(4),
      qtyDiff: (qtyReceived - qtyOrdered).toFixed(4),
      orderedPrice: orderedPrice.toFixed(4),
      receivedPrice: receivedPrice.toFixed(4),
      priceDiff: priceDiff.toFixed(4),
      priceDiffPct: priceDiffPct.toFixed(2),
    };
  });

  res.json({ orderId, diffs });
});

// ─── GET /admin/purchase-reports/incidents ────────────────────────────────────
router.get("/admin/purchase-reports/incidents", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const rows = await db.select({
    id: goodsReceiptsTable.id,
    supplierId: goodsReceiptsTable.supplierId,
    supplierName: suppliersTable.commercialName,
    receiptNumber: goodsReceiptsTable.receiptNumber,
    receiptDate: goodsReceiptsTable.receiptDate,
    incidents: goodsReceiptsTable.incidents,
  })
    .from(goodsReceiptsTable)
    .innerJoin(suppliersTable, eq(goodsReceiptsTable.supplierId, suppliersTable.id))
    .orderBy(desc(goodsReceiptsTable.receiptDate))
    .limit(100);

  const withIncidents = rows.filter((r) => r.incidents);
  res.json(withIncidents);
});

// ─── GET /admin/purchase-reports/unpaid-invoices ──────────────────────────────
router.get("/admin/purchase-reports/unpaid-invoices", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const rows = await db.select({
    id: supplierInvoicesTable.id,
    supplierId: supplierInvoicesTable.supplierId,
    supplierName: suppliersTable.commercialName,
    invoiceNumber: supplierInvoicesTable.invoiceNumber,
    invoiceDate: supplierInvoicesTable.invoiceDate,
    total: supplierInvoicesTable.total,
    dueDate: supplierInvoicesTable.dueDate,
    paymentStatus: supplierInvoicesTable.paymentStatus,
  })
    .from(supplierInvoicesTable)
    .innerJoin(suppliersTable, eq(supplierInvoicesTable.supplierId, suppliersTable.id))
    .where(inArray(supplierInvoicesTable.paymentStatus, ["unpaid","overdue"]))
    .orderBy(asc(supplierInvoicesTable.dueDate));

  // Mark overdue
  const now = new Date();
  const enriched = rows.map((r) => ({
    ...r,
    isOverdue: r.dueDate ? new Date(r.dueDate) < now : false,
  }));
  res.json(enriched);
});

// ─── GET /admin/purchase-reports/expiring-lots ────────────────────────────────
// Lots expiring within N days (default 7)
router.get("/admin/purchase-reports/expiring-lots", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { days = "7" } = req.query as { days?: string };
  const daysAhead = Math.min(365, Math.max(1, parseInt(days)));
  const cutoff = new Date(Date.now() + daysAhead * 86400_000);

  const rows = await db.select({
    id: ingredientLotsTable.id,
    ingredientId: ingredientLotsTable.ingredientId,
    ingredientName: ingredientsTable.name,
    ingredientUnit: ingredientsTable.unit,
    lotNumber: ingredientLotsTable.lotNumber,
    expiryDate: ingredientLotsTable.expiryDate,
    remainingQty: ingredientLotsTable.remainingQty,
    supplierId: ingredientLotsTable.supplierId,
    supplierName: suppliersTable.commercialName,
    createdAt: ingredientLotsTable.createdAt,
  })
    .from(ingredientLotsTable)
    .innerJoin(ingredientsTable, eq(ingredientLotsTable.ingredientId, ingredientsTable.id))
    .leftJoin(suppliersTable, eq(ingredientLotsTable.supplierId, suppliersTable.id))
    .where(and(
      lte(ingredientLotsTable.expiryDate, cutoff.toISOString().split("T")[0]),
      gte(ingredientLotsTable.remainingQty, "0.001"),
    ))
    .orderBy(asc(ingredientLotsTable.expiryDate));

  const now = new Date();
  const enriched = rows.map((r) => ({
    ...r,
    isExpired: r.expiryDate ? new Date(r.expiryDate) < now : false,
    daysUntilExpiry: r.expiryDate
      ? Math.ceil((new Date(r.expiryDate).getTime() - now.getTime()) / 86400_000)
      : null,
  }));

  res.json({ days: daysAhead, lots: enriched });
});

// ─── GET /admin/purchase-orders/:id/reconciliation ───────────────────────────
// Three-way reconciliation: order ↔ receipts ↔ invoices
router.get("/admin/purchase-orders/:id/reconciliation", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const orderId = req.params.id as string;

  const [order] = await db.select({
    id: purchaseOrdersTable.id,
    supplierId: purchaseOrdersTable.supplierId,
    supplierName: suppliersTable.commercialName,
    status: purchaseOrdersTable.status,
    orderDate: purchaseOrdersTable.orderDate,
    totalAmount: purchaseOrdersTable.totalAmount,
  })
    .from(purchaseOrdersTable)
    .innerJoin(suppliersTable, eq(purchaseOrdersTable.supplierId, suppliersTable.id))
    .where(eq(purchaseOrdersTable.id, orderId));

  if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }

  const orderItems = await db.select({
    ingredientId: purchaseOrderItemsTable.ingredientId,
    ingredientName: ingredientsTable.name,
    qtyOrdered: purchaseOrderItemsTable.quantity,
    unitPrice: purchaseOrderItemsTable.unitPrice,
    vatPct: purchaseOrderItemsTable.vatPct,
    discount: purchaseOrderItemsTable.discount,
  })
    .from(purchaseOrderItemsTable)
    .innerJoin(ingredientsTable, eq(purchaseOrderItemsTable.ingredientId, ingredientsTable.id))
    .where(eq(purchaseOrderItemsTable.orderId, orderId));

  const receipts = await db.select({
    id: goodsReceiptsTable.id,
    receiptNumber: goodsReceiptsTable.receiptNumber,
    receiptDate: goodsReceiptsTable.receiptDate,
    totalAmount: goodsReceiptsTable.totalAmount,
    incidents: goodsReceiptsTable.incidents,
  })
    .from(goodsReceiptsTable)
    .where(eq(goodsReceiptsTable.orderId, orderId));

  // Linked invoices
  const invoiceLinks = await db.select({
    invoiceId: supplierInvoiceOrderLinksTable.invoiceId,
  })
    .from(supplierInvoiceOrderLinksTable)
    .where(eq(supplierInvoiceOrderLinksTable.orderId, orderId));

  let invoices: any[] = [];
  if (invoiceLinks.length > 0) {
    invoices = await db.select({
      id: supplierInvoicesTable.id,
      invoiceNumber: supplierInvoicesTable.invoiceNumber,
      invoiceDate: supplierInvoicesTable.invoiceDate,
      taxableBase: supplierInvoicesTable.taxableBase,
      vatAmount: supplierInvoicesTable.vatAmount,
      total: supplierInvoicesTable.total,
      paymentStatus: supplierInvoicesTable.paymentStatus,
    })
      .from(supplierInvoicesTable)
      .where(inArray(supplierInvoicesTable.id, invoiceLinks.map((l) => l.invoiceId)));
  }

  // Summary diff
  const orderTotal = parseFloat(order.totalAmount ?? "0");
  const receiptTotal = receipts.reduce((s, r) => s + parseFloat(r.totalAmount ?? "0"), 0);
  const invoiceTotal = invoices.reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);

  res.json({
    order,
    orderItems,
    receipts,
    invoices,
    summary: {
      orderTotal: orderTotal.toFixed(4),
      receiptTotal: receiptTotal.toFixed(4),
      invoiceTotal: invoiceTotal.toFixed(4),
      orderVsReceipt: (receiptTotal - orderTotal).toFixed(4),
      orderVsInvoice: (invoiceTotal - orderTotal).toFixed(4),
      receiptVsInvoice: (invoiceTotal - receiptTotal).toFixed(4),
    },
  });
});

export default router;
