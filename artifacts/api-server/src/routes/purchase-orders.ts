import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  purchaseOrdersTable,
  purchaseOrderItemsTable,
  suppliersTable,
  ingredientsTable,
  supplierCatalogItemsTable,
  purchaseAuditLogTable,
  stockMovementsTable,
} from "@workspace/db";
import { eq, and, ilike, asc, desc, gte, lte, sum, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

const VALID_STATUSES = ["draft","pending_approval","sent","confirmed","partially_received","received","cancelled"] as const;
type OrderStatus = typeof VALID_STATUSES[number];

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["draft", "sent", "cancelled"],
  sent: ["confirmed", "cancelled"],
  confirmed: ["partially_received", "received", "cancelled"],
  partially_received: ["received", "cancelled"],
  received: [],    // terminal — cannot be changed
  cancelled: [],   // terminal
};

async function auditLog(entityId: string, action: string, employeeId: string | null, details?: string) {
  await db.insert(purchaseAuditLogTable).values({
    entityType: "order",
    entityId,
    action,
    employeeId: employeeId ?? null,
    details: details ?? null,
  });
}

function computeOrderTotal(items: { quantity: string; unitPrice: string; vatPct: string | null; discount: string | null }[]) {
  return items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    const disc = parseFloat(item.discount ?? "0") || 0;
    const vat = parseFloat(item.vatPct ?? "10") || 0;
    const lineNet = qty * price * (1 - disc / 100);
    const lineTotal = lineNet * (1 + vat / 100);
    return sum + lineTotal;
  }, 0);
}

// ─── GET /admin/purchase-orders ────────────────────────────────────────────────
router.get("/admin/purchase-orders", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { status, supplierId, from, to } = req.query as Record<string, string | undefined>;
  let query = db.select({
    id: purchaseOrdersTable.id,
    supplierId: purchaseOrdersTable.supplierId,
    supplierName: suppliersTable.commercialName,
    status: purchaseOrdersTable.status,
    orderDate: purchaseOrdersTable.orderDate,
    expectedDeliveryDate: purchaseOrdersTable.expectedDeliveryDate,
    totalAmount: purchaseOrdersTable.totalAmount,
    notes: purchaseOrdersTable.notes,
    createdAt: purchaseOrdersTable.createdAt,
  })
    .from(purchaseOrdersTable)
    .innerJoin(suppliersTable, eq(purchaseOrdersTable.supplierId, suppliersTable.id))
    .$dynamic();

  const conds: any[] = [];
  if (status) conds.push(eq(purchaseOrdersTable.status, status));
  if (supplierId) conds.push(eq(purchaseOrdersTable.supplierId, supplierId));
  if (from) conds.push(gte(purchaseOrdersTable.orderDate, new Date(from)));
  if (to) conds.push(lte(purchaseOrdersTable.orderDate, new Date(to)));
  if (conds.length) query = query.where(and(...conds));

  const rows = await query.orderBy(desc(purchaseOrdersTable.createdAt));
  res.json(rows);
});

// ─── GET /admin/purchase-orders/:id ───────────────────────────────────────────
router.get("/admin/purchase-orders/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [order] = await db.select({
    id: purchaseOrdersTable.id,
    supplierId: purchaseOrdersTable.supplierId,
    supplierName: suppliersTable.commercialName,
    status: purchaseOrdersTable.status,
    orderDate: purchaseOrdersTable.orderDate,
    expectedDeliveryDate: purchaseOrdersTable.expectedDeliveryDate,
    totalAmount: purchaseOrdersTable.totalAmount,
    notes: purchaseOrdersTable.notes,
    cancelReason: purchaseOrdersTable.cancelReason,
    createdAt: purchaseOrdersTable.createdAt,
    updatedAt: purchaseOrdersTable.updatedAt,
    sentAt: purchaseOrdersTable.sentAt,
    confirmedAt: purchaseOrdersTable.confirmedAt,
    cancelledAt: purchaseOrdersTable.cancelledAt,
  })
    .from(purchaseOrdersTable)
    .innerJoin(suppliersTable, eq(purchaseOrdersTable.supplierId, suppliersTable.id))
    .where(eq(purchaseOrdersTable.id, id));

  if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }

  const items = await db.select({
    id: purchaseOrderItemsTable.id,
    ingredientId: purchaseOrderItemsTable.ingredientId,
    ingredientName: ingredientsTable.name,
    ingredientUnit: ingredientsTable.unit,
    currentStock: ingredientsTable.currentStock,
    minStock: ingredientsTable.minStock,
    supplierCatalogItemId: purchaseOrderItemsTable.supplierCatalogItemId,
    quantity: purchaseOrderItemsTable.quantity,
    unit: purchaseOrderItemsTable.unit,
    unitPrice: purchaseOrderItemsTable.unitPrice,
    vatPct: purchaseOrderItemsTable.vatPct,
    discount: purchaseOrderItemsTable.discount,
    notes: purchaseOrderItemsTable.notes,
  })
    .from(purchaseOrderItemsTable)
    .innerJoin(ingredientsTable, eq(purchaseOrderItemsTable.ingredientId, ingredientsTable.id))
    .where(eq(purchaseOrderItemsTable.orderId, id))
    .orderBy(asc(ingredientsTable.name));

  res.json({ ...order, items });
});

// ─── POST /admin/purchase-orders ───────────────────────────────────────────────
router.post("/admin/purchase-orders", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { supplierId, expectedDeliveryDate, notes, items = [], copyFromOrderId } = req.body as {
    supplierId: string;
    expectedDeliveryDate?: string;
    notes?: string;
    items?: { ingredientId: string; quantity: string; unitPrice: string; unit?: string; vatPct?: string; discount?: string; notes?: string; supplierCatalogItemId?: string }[];
    copyFromOrderId?: string;
  };

  if (!supplierId) { res.status(400).json({ error: "supplierId es obligatorio" }); return; }
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
  if (!supplier) { res.status(404).json({ error: "Proveedor no encontrado" }); return; }

  const user = (req as any).user;
  let lineItems = items;

  // Copy from existing order
  if (copyFromOrderId) {
    const sourceItems = await db.select().from(purchaseOrderItemsTable)
      .where(eq(purchaseOrderItemsTable.orderId, copyFromOrderId));
    lineItems = sourceItems.map((i) => ({
      ingredientId: i.ingredientId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      unit: i.unit,
      vatPct: i.vatPct ?? "10",
      discount: i.discount ?? "0",
      notes: i.notes ?? undefined,
      supplierCatalogItemId: i.supplierCatalogItemId ?? undefined,
    }));
  }

  await db.transaction(async (tx) => {
    const [order] = await tx.insert(purchaseOrdersTable).values({
      supplierId,
      status: "draft",
      expectedDeliveryDate: expectedDeliveryDate ?? null,
      notes: notes ?? null,
      createdBy: user?.id ?? null,
      totalAmount: "0",
    }).returning();

    if (lineItems.length > 0) {
      await tx.insert(purchaseOrderItemsTable).values(
        lineItems.map((item) => ({
          orderId: order.id,
          ingredientId: item.ingredientId,
          supplierCatalogItemId: item.supplierCatalogItemId ?? null,
          quantity: String(item.quantity),
          unit: item.unit ?? "ud",
          unitPrice: String(item.unitPrice),
          vatPct: item.vatPct ? String(item.vatPct) : "10",
          discount: item.discount ? String(item.discount) : "0",
          notes: item.notes ?? null,
        })),
      );
      const total = computeOrderTotal(lineItems.map((i) => ({
        quantity: String(i.quantity), unitPrice: String(i.unitPrice),
        vatPct: i.vatPct ? String(i.vatPct) : "10", discount: i.discount ? String(i.discount) : "0",
      })));
      await tx.update(purchaseOrdersTable).set({ totalAmount: total.toFixed(4) }).where(eq(purchaseOrdersTable.id, order.id));
    }

    await tx.insert(purchaseAuditLogTable).values({
      entityType: "order", entityId: order.id, action: "create",
      employeeId: user?.id ?? null, details: `Supplier: ${supplier.commercialName}`,
    });

    const [full] = await tx.select({
      id: purchaseOrdersTable.id, supplierId: purchaseOrdersTable.supplierId,
      supplierName: suppliersTable.commercialName, status: purchaseOrdersTable.status,
      orderDate: purchaseOrdersTable.orderDate, totalAmount: purchaseOrdersTable.totalAmount,
    }).from(purchaseOrdersTable)
      .innerJoin(suppliersTable, eq(purchaseOrdersTable.supplierId, suppliersTable.id))
      .where(eq(purchaseOrdersTable.id, order.id));

    res.status(201).json(full);
  });
});

// ─── PATCH /admin/purchase-orders/:id ─────────────────────────────────────────
router.patch("/admin/purchase-orders/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }
  if (["received", "cancelled"].includes(order.status)) {
    res.status(409).json({ error: "No se puede modificar un pedido recibido o cancelado" }); return;
  }

  const { notes, expectedDeliveryDate, supplierId } = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (notes !== undefined) updates.notes = notes;
  if (expectedDeliveryDate !== undefined) updates.expectedDeliveryDate = expectedDeliveryDate;
  if (supplierId !== undefined && order.status === "draft") updates.supplierId = supplierId;

  const [updated] = await db.update(purchaseOrdersTable).set(updates as any).where(eq(purchaseOrdersTable.id, id)).returning();
  res.json(updated);
});

// ─── POST /admin/purchase-orders/:id/transition ───────────────────────────────
router.post("/admin/purchase-orders/:id/transition", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { status, cancelReason } = req.body as { status: OrderStatus; cancelReason?: string };

  const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }

  const allowed = STATUS_TRANSITIONS[order.status as OrderStatus] ?? [];
  if (!allowed.includes(status)) {
    res.status(409).json({ error: `No se puede pasar de '${order.status}' a '${status}'` }); return;
  }

  const user = (req as any).user;
  const updates: Record<string, unknown> = { status, updatedAt: new Date() };
  if (status === "sent") updates.sentAt = new Date();
  if (status === "confirmed") updates.confirmedAt = new Date();
  if (status === "cancelled") { updates.cancelledAt = new Date(); updates.cancelReason = cancelReason ?? null; }
  if (status === "pending_approval" && order.status === "draft") updates.approvedBy = null;
  if (status === "pending_approval" && user?.id) updates.approvedBy = null; // approver set on 'sent'

  const [updated] = await db.update(purchaseOrdersTable).set(updates as any).where(eq(purchaseOrdersTable.id, id)).returning();
  await auditLog(id, status, user?.id ?? null, cancelReason ?? undefined);
  res.json(updated);
});

// ─── POST /admin/purchase-orders/:id/items ────────────────────────────────────
router.post("/admin/purchase-orders/:id/items", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const orderId = req.params.id as string;
  const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }
  if (["received","cancelled"].includes(order.status)) {
    res.status(409).json({ error: "No se pueden añadir líneas a un pedido recibido o cancelado" }); return;
  }

  const { ingredientId, quantity, unitPrice, unit = "ud", vatPct = "10", discount = "0", notes, supplierCatalogItemId } = req.body as Record<string, unknown>;
  if (!ingredientId || !quantity) { res.status(400).json({ error: "ingredientId y quantity son obligatorios" }); return; }

  const [row] = await db.insert(purchaseOrderItemsTable).values({
    orderId,
    ingredientId: ingredientId as string,
    supplierCatalogItemId: (supplierCatalogItemId as string | undefined) ?? null,
    quantity: String(quantity),
    unit: String(unit),
    unitPrice: String(unitPrice ?? "0"),
    vatPct: String(vatPct),
    discount: String(discount),
    notes: (notes as string | undefined) ?? null,
  }).returning();

  // Recompute order total
  const allItems = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.orderId, orderId));
  const total = computeOrderTotal(allItems);
  await db.update(purchaseOrdersTable).set({ totalAmount: total.toFixed(4), updatedAt: new Date() }).where(eq(purchaseOrdersTable.id, orderId));

  res.status(201).json(row);
});

// ─── PATCH /admin/purchase-order-items/:itemId ────────────────────────────────
router.patch("/admin/purchase-order-items/:itemId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const itemId = req.params.itemId as string;
  const [existing] = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.id, itemId));
  if (!existing) { res.status(404).json({ error: "Línea no encontrada" }); return; }

  const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, existing.orderId));
  if (["received","cancelled"].includes(order?.status ?? "")) {
    res.status(409).json({ error: "No se puede modificar un pedido recibido o cancelado" }); return;
  }

  const fields = ["quantity","unitPrice","unit","vatPct","discount","notes"] as const;
  const updates: Record<string, unknown> = {};
  for (const f of fields) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  if (!Object.keys(updates).length) { res.status(400).json({ error: "Sin cambios" }); return; }

  const [updated] = await db.update(purchaseOrderItemsTable).set(updates as any).where(eq(purchaseOrderItemsTable.id, itemId)).returning();

  // Recompute total
  const allItems = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.orderId, existing.orderId));
  const total = computeOrderTotal(allItems);
  await db.update(purchaseOrdersTable).set({ totalAmount: total.toFixed(4), updatedAt: new Date() }).where(eq(purchaseOrdersTable.id, existing.orderId));

  res.json(updated);
});

// ─── DELETE /admin/purchase-order-items/:itemId ───────────────────────────────
router.delete("/admin/purchase-order-items/:itemId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const itemId = req.params.itemId as string;
  const [existing] = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.id, itemId));
  if (!existing) { res.status(404).json({ error: "Línea no encontrada" }); return; }

  const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, existing.orderId));
  if (["received","cancelled"].includes(order?.status ?? "")) {
    res.status(409).json({ error: "No se puede modificar un pedido recibido o cancelado" }); return;
  }

  await db.delete(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.id, itemId));
  const allItems = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.orderId, existing.orderId));
  const total = computeOrderTotal(allItems);
  await db.update(purchaseOrdersTable).set({ totalAmount: total.toFixed(4), updatedAt: new Date() }).where(eq(purchaseOrdersTable.id, existing.orderId));
  res.json({ ok: true });
});

// ─── POST /admin/purchase-orders/proposal ─────────────────────────────────────
// Auto-proposal: suggest reorder quantities based on stock/min/optimal/consumption
router.post("/admin/purchase-orders/proposal", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { supplierId, daysAhead = 7 } = req.body as { supplierId?: string; daysAhead?: number };

  // Get all active ingredients with stock data
  const ingredients = await db.select({
    id: ingredientsTable.id,
    name: ingredientsTable.name,
    unit: ingredientsTable.unit,
    currentStock: ingredientsTable.currentStock,
    minStock: ingredientsTable.minStock,
    optimalStock: ingredientsTable.optimalStock,
    purchaseCost: ingredientsTable.purchaseCost,
  }).from(ingredientsTable).where(eq(ingredientsTable.active, true));

  // Average daily consumption (last 30 days from sale movements)
  const fromDate = new Date(Date.now() - 30 * 86400_000);
  const movRows = await db.select({
    ingredientId: stockMovementsTable.ingredientId,
    totalQty: sum(stockMovementsTable.quantity).mapWith(Number),
  })
    .from(stockMovementsTable)
    .where(and(
      eq(stockMovementsTable.movementType, "sale"),
      gte(stockMovementsTable.createdAt, fromDate),
    ))
    .groupBy(stockMovementsTable.ingredientId);

  const consumptionMap = new Map<string, number>();
  for (const row of movRows) {
    consumptionMap.set(row.ingredientId, Math.abs(row.totalQty ?? 0) / 30);
  }

  // Pending quantities in active orders
  const pendingItems = await db.select({
    ingredientId: purchaseOrderItemsTable.ingredientId,
    qty: sum(purchaseOrderItemsTable.quantity).mapWith(Number),
  })
    .from(purchaseOrderItemsTable)
    .innerJoin(purchaseOrdersTable, eq(purchaseOrderItemsTable.orderId, purchaseOrdersTable.id))
    .where(inArray(purchaseOrdersTable.status, ["sent", "confirmed", "pending_approval"]))
    .groupBy(purchaseOrderItemsTable.ingredientId);

  const pendingMap = new Map<string, number>();
  for (const row of pendingItems) {
    pendingMap.set(row.ingredientId, row.qty ?? 0);
  }

  // Catalogue lookup for preferred supplier (or given supplier)
  let catalogueQuery = db.select({
    ingredientId: supplierCatalogItemsTable.ingredientId,
    supplierId: supplierCatalogItemsTable.supplierId,
    supplierName: suppliersTable.commercialName,
    price: supplierCatalogItemsTable.price,
    unitsPerPack: supplierCatalogItemsTable.unitsPerPack,
    isPreferred: supplierCatalogItemsTable.isPreferred,
    catalogueItemId: supplierCatalogItemsTable.id,
  })
    .from(supplierCatalogItemsTable)
    .innerJoin(suppliersTable, eq(supplierCatalogItemsTable.supplierId, suppliersTable.id))
    .$dynamic();

  if (supplierId) {
    catalogueQuery = catalogueQuery.where(and(
      eq(supplierCatalogItemsTable.supplierId, supplierId),
      eq(suppliersTable.active, true),
    ));
  } else {
    catalogueQuery = catalogueQuery.where(and(
      eq(supplierCatalogItemsTable.isPreferred, true),
      eq(suppliersTable.active, true),
    ));
  }
  const catalogue = await catalogueQuery;
  const catalogueMap = new Map<string, typeof catalogue[0]>();
  for (const c of catalogue) { catalogueMap.set(c.ingredientId, c); }

  const suggestions = [];
  for (const ing of ingredients) {
    const current = parseFloat(ing.currentStock ?? "0");
    const minStk = parseFloat(ing.minStock ?? "0");
    const optimal = parseFloat(ing.optimalStock ?? "0") || minStk * 2;
    const pending = pendingMap.get(ing.id) ?? 0;
    const dailyConsumption = consumptionMap.get(ing.id) ?? 0;
    const projectedConsumption = dailyConsumption * daysAhead;
    const effectiveStock = current + pending - projectedConsumption;

    if (effectiveStock < minStk) {
      const needed = Math.max(0, optimal - effectiveStock);
      const cat = catalogueMap.get(ing.id);
      suggestions.push({
        ingredientId: ing.id,
        ingredientName: ing.name,
        unit: ing.unit,
        currentStock: current.toFixed(4),
        minStock: minStk.toFixed(4),
        optimalStock: optimal.toFixed(4),
        pendingQty: pending.toFixed(4),
        dailyConsumption: dailyConsumption.toFixed(4),
        projectedConsumption: projectedConsumption.toFixed(4),
        effectiveStock: effectiveStock.toFixed(4),
        suggestedQty: needed.toFixed(4),
        supplierId: cat?.supplierId ?? null,
        supplierName: cat?.supplierName ?? null,
        unitPrice: cat?.price ?? null,
        catalogueItemId: cat?.catalogueItemId ?? null,
      });
    }
  }

  res.json({ suggestions, daysAhead });
});

export default router;
