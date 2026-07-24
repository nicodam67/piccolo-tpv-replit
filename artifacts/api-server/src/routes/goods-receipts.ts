import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  goodsReceiptsTable,
  goodsReceiptItemsTable,
  purchaseOrdersTable,
  purchaseOrderItemsTable,
  suppliersTable,
  ingredientsTable,
  stockMovementsTable,
  ingredientCostHistoryTable,
  ingredientLotsTable,
  purchaseAuditLogTable,
} from "@workspace/db";
import { eq, and, asc, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { syncProductCost } from "./recipes";

const router: IRouter = Router();

// Price deviation threshold (%) above which manager authorisation is required.
// In production this would come from business_config. Using 10% default here.
const PRICE_DEVIATION_THRESHOLD = 10;

async function auditLog(entityId: string, action: string, employeeId: string | null, details?: string) {
  await db.insert(purchaseAuditLogTable).values({
    entityType: "receipt",
    entityId,
    action,
    employeeId: employeeId ?? null,
    details: details ?? null,
  });
}

// ─── GET /admin/goods-receipts ─────────────────────────────────────────────────
router.get("/admin/goods-receipts", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { orderId, supplierId } = req.query as { orderId?: string; supplierId?: string };
  let query = db.select({
    id: goodsReceiptsTable.id,
    orderId: goodsReceiptsTable.orderId,
    supplierId: goodsReceiptsTable.supplierId,
    supplierName: suppliersTable.commercialName,
    receiptNumber: goodsReceiptsTable.receiptNumber,
    receiptDate: goodsReceiptsTable.receiptDate,
    totalAmount: goodsReceiptsTable.totalAmount,
    incidents: goodsReceiptsTable.incidents,
    createdAt: goodsReceiptsTable.createdAt,
  })
    .from(goodsReceiptsTable)
    .innerJoin(suppliersTable, eq(goodsReceiptsTable.supplierId, suppliersTable.id))
    .$dynamic();

  const conds: any[] = [];
  if (orderId) conds.push(eq(goodsReceiptsTable.orderId, orderId));
  if (supplierId) conds.push(eq(goodsReceiptsTable.supplierId, supplierId));
  if (conds.length) query = query.where(and(...conds));
  const rows = await query.orderBy(desc(goodsReceiptsTable.receiptDate));
  res.json(rows);
});

// ─── GET /admin/goods-receipts/:id ─────────────────────────────────────────────
router.get("/admin/goods-receipts/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [receipt] = await db.select({
    id: goodsReceiptsTable.id,
    orderId: goodsReceiptsTable.orderId,
    supplierId: goodsReceiptsTable.supplierId,
    supplierName: suppliersTable.commercialName,
    receiptNumber: goodsReceiptsTable.receiptNumber,
    receiptDate: goodsReceiptsTable.receiptDate,
    totalAmount: goodsReceiptsTable.totalAmount,
    incidents: goodsReceiptsTable.incidents,
    attachmentUrl: goodsReceiptsTable.attachmentUrl,
    createdAt: goodsReceiptsTable.createdAt,
  })
    .from(goodsReceiptsTable)
    .innerJoin(suppliersTable, eq(goodsReceiptsTable.supplierId, suppliersTable.id))
    .where(eq(goodsReceiptsTable.id, id));

  if (!receipt) { res.status(404).json({ error: "Albarán no encontrado" }); return; }

  const items = await db.select({
    id: goodsReceiptItemsTable.id,
    ingredientId: goodsReceiptItemsTable.ingredientId,
    ingredientName: ingredientsTable.name,
    ingredientUnit: ingredientsTable.unit,
    orderItemId: goodsReceiptItemsTable.orderItemId,
    qtyOrdered: goodsReceiptItemsTable.qtyOrdered,
    qtyReceived: goodsReceiptItemsTable.qtyReceived,
    qtyRejected: goodsReceiptItemsTable.qtyRejected,
    unitPrice: goodsReceiptItemsTable.unitPrice,
    lotNumber: goodsReceiptItemsTable.lotNumber,
    expiryDate: goodsReceiptItemsTable.expiryDate,
    temperature: goodsReceiptItemsTable.temperature,
    incidents: goodsReceiptItemsTable.incidents,
    substitution: goodsReceiptItemsTable.substitution,
  })
    .from(goodsReceiptItemsTable)
    .innerJoin(ingredientsTable, eq(goodsReceiptItemsTable.ingredientId, ingredientsTable.id))
    .where(eq(goodsReceiptItemsTable.receiptId, id))
    .orderBy(asc(ingredientsTable.name));

  res.json({ ...receipt, items });
});

// ─── POST /admin/goods-receipts ────────────────────────────────────────────────
// Creates a goods receipt and updates inventory.
// Body: { orderId?, supplierId, receiptNumber?, receiptDate?, incidents?, items[], forceOnPriceDeviation? }
// Each item: { ingredientId, orderItemId?, qtyOrdered?, qtyReceived, qtyRejected?, unitPrice, lotNumber?, expiryDate?, temperature?, incidents?, substitution? }
router.post("/admin/goods-receipts", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const {
    orderId,
    supplierId,
    receiptNumber,
    receiptDate,
    incidents,
    items = [],
    forceOnPriceDeviation = false,
  } = req.body as {
    orderId?: string;
    supplierId: string;
    receiptNumber?: string;
    receiptDate?: string;
    incidents?: string;
    forceOnPriceDeviation?: boolean;
    items: {
      ingredientId: string;
      orderItemId?: string;
      qtyOrdered?: string;
      qtyReceived: string;
      qtyRejected?: string;
      unitPrice: string;
      lotNumber?: string;
      expiryDate?: string;
      temperature?: string;
      incidents?: string;
      substitution?: string;
    }[];
  };

  if (!supplierId) { res.status(400).json({ error: "supplierId es obligatorio" }); return; }
  if (!items.length) { res.status(400).json({ error: "items no puede estar vacío" }); return; }

  // Validate each item has qtyReceived > 0
  for (const item of items) {
    if (!item.ingredientId) {
      res.status(400).json({ error: "Cada ítem debe tener ingredientId" }); return;
    }
    if (parseFloat(item.qtyReceived) < 0) {
      res.status(400).json({ error: "qtyReceived no puede ser negativo" }); return;
    }
  }

  // Check price deviations vs order lines
  if (orderId) {
    const orderItems = await db.select().from(purchaseOrderItemsTable)
      .where(eq(purchaseOrderItemsTable.orderId, orderId));
    const orderPriceMap = new Map(orderItems.map((oi) => [oi.ingredientId, parseFloat(oi.unitPrice)]));

    const deviations = [];
    for (const item of items) {
      const ordered = orderPriceMap.get(item.ingredientId);
      if (ordered && ordered > 0) {
        const received = parseFloat(item.unitPrice);
        const pct = Math.abs((received - ordered) / ordered) * 100;
        if (pct > PRICE_DEVIATION_THRESHOLD) {
          deviations.push({ ingredientId: item.ingredientId, ordered, received, pct: pct.toFixed(2) });
        }
      }
    }
    if (deviations.length > 0 && !forceOnPriceDeviation) {
      res.status(422).json({
        error: "price_deviation",
        message: "Existen desviaciones de precio superiores al umbral configurado. Use forceOnPriceDeviation:true para confirmar.",
        deviations,
        threshold: PRICE_DEVIATION_THRESHOLD,
      });
      return;
    }
  }

  const user = (req as any).user;

  await db.transaction(async (tx) => {
    // Compute total amount
    const totalAmount = items.reduce((sum, item) => {
      return sum + parseFloat(item.qtyReceived) * parseFloat(item.unitPrice);
    }, 0);

    // Create receipt header
    const [receipt] = await tx.insert(goodsReceiptsTable).values({
      orderId: orderId ?? null,
      supplierId,
      receiptNumber: receiptNumber ?? null,
      receiptDate: receiptDate ? new Date(receiptDate) : new Date(),
      totalAmount: totalAmount.toFixed(4),
      incidents: incidents ?? null,
      receivedBy: user?.id ?? null,
    }).returning();

    // Process each item
    for (const item of items) {
      const qtyReceived = parseFloat(item.qtyReceived);
      const qtyRejected = parseFloat(item.qtyRejected ?? "0");

      // Insert receipt item
      await tx.insert(goodsReceiptItemsTable).values({
        receiptId: receipt.id,
        orderItemId: item.orderItemId ?? null,
        ingredientId: item.ingredientId,
        qtyOrdered: item.qtyOrdered ? String(item.qtyOrdered) : "0",
        qtyReceived: String(qtyReceived),
        qtyRejected: String(qtyRejected),
        unitPrice: String(item.unitPrice),
        lotNumber: item.lotNumber ?? null,
        expiryDate: item.expiryDate ?? null,
        temperature: item.temperature ? String(item.temperature) : null,
        incidents: item.incidents ?? null,
        substitution: item.substitution ?? null,
      });

      // Only update stock for actually received quantity (not rejected)
      const qtyAccepted = Math.max(0, qtyReceived - qtyRejected);
      if (qtyAccepted > 0) {
        const [ingredient] = await tx.select().from(ingredientsTable)
          .where(eq(ingredientsTable.id, item.ingredientId))
          .for("update");
        if (ingredient) {
          const oldStock = parseFloat(ingredient.currentStock ?? "0");
          // Use running weighted average as the base (falls back to purchaseCost for legacy rows)
          const oldCost = parseFloat(String(ingredient.averageCost ?? ingredient.purchaseCost ?? "0"));
          const newUnitPrice = parseFloat(item.unitPrice);
          const newStock = oldStock + qtyAccepted;

          // Weighted average cost per consumption unit
          const newAvgCost = newStock > 0
            ? (oldStock * oldCost + qtyAccepted * newUnitPrice) / newStock
            : newUnitPrice;

          // Update ingredient: stock, weighted average cost, last purchase price
          await tx.update(ingredientsTable)
            .set({
              currentStock: newStock.toFixed(4),
              averageCost: newAvgCost.toFixed(4),
              lastPurchaseCost: newUnitPrice.toFixed(4),
              purchaseCost: newUnitPrice.toFixed(4),  // tracks last known purchase price
              updatedAt: new Date(),
            })
            .where(eq(ingredientsTable.id, item.ingredientId));

          // Stock movement
          await tx.insert(stockMovementsTable).values({
            ingredientId: item.ingredientId,
            movementType: "purchase",
            quantity: qtyAccepted.toFixed(4),
            unitCost: String(item.unitPrice),
            reason: `Recepción albarán ${receiptNumber ?? receipt.id}`,
            employeeId: user?.id ?? null,
          });

          // Log cost change if different
          if (Math.abs(newAvgCost - oldCost) > 0.0001) {
            await tx.insert(ingredientCostHistoryTable).values({
              ingredientId: item.ingredientId,
              previousCost: oldCost.toFixed(4),
              newCost: newAvgCost.toFixed(4),
              supplierName: null,
              reason: `Recepción albarán ${receiptNumber ?? receipt.id} (coste medio actualizado)`,
              employeeId: user?.id ?? null,
            });
          }

          // Register lot if provided
          if (item.lotNumber) {
            await tx.insert(ingredientLotsTable).values({
              ingredientId: item.ingredientId,
              lotNumber: item.lotNumber,
              expiryDate: item.expiryDate ?? null,
              initialQty: qtyAccepted.toFixed(4),
              remainingQty: qtyAccepted.toFixed(4),
              supplierId,
              receiptId: receipt.id,
            });
          }
        }
      }
    }

    // Update order status if linked
    if (orderId) {
      const orderItems = await tx.select().from(purchaseOrderItemsTable)
        .where(eq(purchaseOrderItemsTable.orderId, orderId));
      const allReceipts = await tx.select({
        ingredientId: goodsReceiptItemsTable.ingredientId,
        totalReceived: goodsReceiptItemsTable.qtyReceived,
      })
        .from(goodsReceiptItemsTable)
        .innerJoin(goodsReceiptsTable, eq(goodsReceiptItemsTable.receiptId, goodsReceiptsTable.id))
        .where(eq(goodsReceiptsTable.orderId, orderId));

      const receivedMap = new Map<string, number>();
      for (const r of allReceipts) {
        receivedMap.set(r.ingredientId, (receivedMap.get(r.ingredientId) ?? 0) + parseFloat(r.totalReceived ?? "0"));
      }

      const allReceived = orderItems.every((oi) => {
        const received = receivedMap.get(oi.ingredientId) ?? 0;
        return received >= parseFloat(oi.quantity);
      });
      const anyReceived = orderItems.some((oi) => (receivedMap.get(oi.ingredientId) ?? 0) > 0);

      const newOrderStatus = allReceived ? "received" : anyReceived ? "partially_received" : null;
      if (newOrderStatus) {
        await tx.update(purchaseOrdersTable)
          .set({ status: newOrderStatus, updatedAt: new Date() })
          .where(eq(purchaseOrdersTable.id, orderId));
      }
    }

    // Audit log
    await tx.insert(purchaseAuditLogTable).values({
      entityType: "receipt",
      entityId: receipt.id,
      action: "receive",
      employeeId: user?.id ?? null,
      details: `${items.length} líneas, total ${totalAmount.toFixed(2)}€`,
    });

    // Sync product costs for affected ingredients
    // Do this after transaction to avoid potential deadlocks (best-effort)
    res.status(201).json({ ...receipt, itemCount: items.length });
  });

  // Sync product costs outside transaction (best effort)
  try {
    const { recipeItemsTable, productsTable } = await import("@workspace/db");
    const { eq: eqOuter } = await import("drizzle-orm");
    for (const item of items) {
      const affected = await db.select({ productId: recipeItemsTable.productId })
        .from(recipeItemsTable)
        .where(eqOuter(recipeItemsTable.ingredientId, item.ingredientId));
      const seen = new Set<string>();
      for (const a of affected) {
        if (!seen.has(a.productId)) {
          seen.add(a.productId);
          await syncProductCost(a.productId, null);
        }
      }
    }
  } catch (_) { /* best effort */ }
});

// ─── DELETE /admin/goods-receipts/:id ──────────────────────────────────────────
// Cannot delete receipts — protect stock integrity.
router.delete("/admin/goods-receipts/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  res.status(409).json({ error: "Los albaranes confirmados no pueden eliminarse. Crea un movimiento de ajuste si hay errores." });
});

export default router;
