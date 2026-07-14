import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  kitchenTasksTable,
  productsTable,
  restaurantTablesTable,
  employeesTable,
  orderItemModifiersTable,
  waiterNotificationsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getIO } from "../lib/socket";

const router: IRouter = Router();

// Helper: load items with modifiers for an order
async function loadOrderItems(orderId: string) {
  const rows = await db
    .select({
      id: orderItemsTable.id,
      orderId: orderItemsTable.orderId,
      productId: orderItemsTable.productId,
      productName: productsTable.name,
      quantity: orderItemsTable.quantity,
      unitPrice: orderItemsTable.unitPrice,
      status: orderItemsTable.status,
      notes: orderItemsTable.notes,
      allergyNote: orderItemsTable.allergyNote,
      hasAllergy: orderItemsTable.hasAllergy,
      createdAt: orderItemsTable.createdAt,
    })
    .from(orderItemsTable)
    .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(eq(orderItemsTable.orderId, orderId))
    .orderBy(orderItemsTable.createdAt);

  // Load modifiers per item
  const itemIds = rows.map((r) => r.id);
  const allModifiers =
    itemIds.length > 0
      ? await db
          .select()
          .from(orderItemModifiersTable)
          .where(inArray(orderItemModifiersTable.orderItemId, itemIds))
      : [];

  const modsByItem = new Map<string, typeof allModifiers>();
  for (const m of allModifiers) {
    if (!modsByItem.has(m.orderItemId)) modsByItem.set(m.orderItemId, []);
    modsByItem.get(m.orderItemId)!.push(m);
  }

  return rows.map((item) => ({ ...item, modifiers: modsByItem.get(item.id) ?? [] }));
}

// GET /tables/:tableId/order
router.get("/tables/:tableId/order", requireAuth, async (req, res): Promise<void> => {
  const { tableId } = req.params;

  const [table] = await db
    .select()
    .from(restaurantTablesTable)
    .where(eq(restaurantTablesTable.id, tableId));

  if (!table) {
    res.status(404).json({ error: "Mesa no encontrada" });
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(
      and(eq(ordersTable.tableId, tableId), inArray(ordersTable.status, ["open", "sent", "ready"])),
    )
    .orderBy(ordersTable.createdAt)
    .limit(1);

  if (!order) {
    res.status(404).json({ error: "No hay pedido activo para esta mesa" });
    return;
  }

  const items = await loadOrderItems(order.id);
  res.json({ table, order: { ...order, items } });
});

// POST /orders/:orderId/items
router.post("/orders/:orderId/items", requireAuth, async (req, res): Promise<void> => {
  const { orderId } = req.params;
  const { productId, quantity = 1, notes } = req.body as {
    productId: string;
    quantity: number;
    notes?: string;
  };

  if (!productId) {
    res.status(400).json({ error: "productId es requerido" });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId));

  if (!product) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }

  const [item] = await db
    .insert(orderItemsTable)
    .values({
      orderId,
      productId,
      quantity,
      unitPrice: product.price,
      status: "draft",
      notes: notes ?? "",
      allergyNote: "",
      hasAllergy: false,
    })
    .returning();

  try {
    getIO().emit("orders:refresh", { orderId });
  } catch {
    // socket not initialised
  }

  res.status(201).json({
    id: item.id,
    orderId: item.orderId,
    productId: item.productId,
    productName: product.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    status: item.status,
    notes: item.notes,
    allergyNote: item.allergyNote,
    hasAllergy: item.hasAllergy,
    modifiers: [],
    createdAt: item.createdAt,
  });
});

// DELETE /order-items/:itemId
router.delete("/order-items/:itemId", requireAuth, async (req, res): Promise<void> => {
  const { itemId } = req.params;

  const [item] = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.id, itemId));

  if (!item) {
    res.status(404).json({ error: "Línea no encontrada" });
    return;
  }
  if (item.status !== "draft") {
    res.status(400).json({ error: "Solo se pueden eliminar líneas en borrador" });
    return;
  }

  await db.delete(orderItemsTable).where(eq(orderItemsTable.id, itemId));

  try {
    getIO().emit("orders:refresh", { orderId: item.orderId });
  } catch {
    // socket not initialised
  }

  res.status(204).send();
});

// POST /orders/:orderId/send
router.post("/orders/:orderId/send", requireAuth, async (req, res): Promise<void> => {
  const { orderId } = req.params;

  const draftItems = await db
    .select()
    .from(orderItemsTable)
    .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(and(eq(orderItemsTable.orderId, orderId), eq(orderItemsTable.status, "draft")));

  if (draftItems.length === 0) {
    res.status(400).json({ error: "No hay líneas en borrador para enviar" });
    return;
  }

  // Load modifiers for all draft items
  const draftItemIds = draftItems.map((r) => r.order_items.id);
  const allMods =
    draftItemIds.length > 0
      ? await db
          .select()
          .from(orderItemModifiersTable)
          .where(inArray(orderItemModifiersTable.orderItemId, draftItemIds))
      : [];

  const modsByItem = new Map<string, typeof allMods>();
  for (const m of allMods) {
    if (!modsByItem.has(m.orderItemId)) modsByItem.set(m.orderItemId, []);
    modsByItem.get(m.orderItemId)!.push(m);
  }

  await db.transaction(async (tx) => {
    for (const row of draftItems) {
      const item = row.order_items;
      const product = row.products;

      // Build notes string with modifiers
      const mods = modsByItem.get(item.id) ?? [];
      const modText = mods.map((m) => m.modifierName).join(", ");
      const fullNote = [modText, item.notes].filter(Boolean).join(" | ");

      await tx.insert(kitchenTasksTable).values({
        orderId,
        orderItemId: item.id,
        prepZone: product.prepZone,
        productName: product.name,
        quantity: item.quantity,
        status: "new",
        allergyNote: item.allergyNote,
        hasAllergy: item.hasAllergy,
      });
    }

    const itemIds = draftItems.map((r) => r.order_items.id);
    await tx
      .update(orderItemsTable)
      .set({ status: "sent" })
      .where(inArray(orderItemsTable.id, itemIds));

    await tx
      .update(ordersTable)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(ordersTable.id, orderId));
  });

  const [updated] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));

  try {
    const io = getIO();
    io.emit("kds:refresh");
    io.emit("orders:refresh", { orderId });
  } catch {
    // socket not initialised
  }

  res.json(updated);
});

// POST /orders/:orderId/pase
router.post("/orders/:orderId/pase", requireAuth, async (req, res): Promise<void> => {
  const { orderId } = req.params;
  const { action } = req.body as { action: "collected" | "served" };

  if (!["collected", "served"].includes(action)) {
    res.status(400).json({ error: "Acción inválida. Usa collected o served." });
    return;
  }

  const now = new Date();

  if (action === "collected") {
    await db
      .update(kitchenTasksTable)
      .set({ status: "collected", collectedAt: now, updatedAt: now })
      .where(and(eq(kitchenTasksTable.orderId, orderId), eq(kitchenTasksTable.status, "ready")));
  } else {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));

    if (!order) {
      res.status(404).json({ error: "Pedido no encontrado" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(kitchenTasksTable)
        .set({ status: "served", servedAt: now, updatedAt: now })
        .where(eq(kitchenTasksTable.orderId, orderId));

      await tx
        .update(ordersTable)
        .set({ status: "served" })
        .where(eq(ordersTable.id, orderId));

      if (order.tableId) {
        await tx
          .update(restaurantTablesTable)
          .set({ status: "free" })
          .where(eq(restaurantTablesTable.id, order.tableId));
      }
    });

    try {
      const io = getIO();
      if (order.tableId) {
        const [tableRow] = await db
          .select({ name: restaurantTablesTable.name })
          .from(restaurantTablesTable)
          .where(eq(restaurantTablesTable.id, order.tableId));
        io.emit("tables:refresh");
        io.emit("waiter:order-served", {
          orderId,
          tableId: order.tableId,
          tableName: tableRow?.name,
          employeeId: order.employeeId,
        });
      }
    } catch {
      // socket not initialised
    }
  }

  const [updated] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  res.json(updated);
});

export default router;
