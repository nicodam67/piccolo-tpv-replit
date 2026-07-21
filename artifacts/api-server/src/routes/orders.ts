import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  kitchenTasksTable,
  productsTable,
  productFormatsTable,
  restaurantTablesTable,
  employeesTable,
  orderItemModifiersTable,
  waiterNotificationsTable,
  auditLogTable,
  prefacturaPrintsTable,
  businessConfigTable,
  idempotencyKeysTable,
} from "@workspace/db";
import { eq, and, inArray, desc, asc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { idempotency } from "../middlewares/idempotency";
import { recipeItemsTable, ingredientsTable, stockMovementsTable } from "@workspace/db";
import { emitToEmployee, emitToFunction } from "../lib/socket-events";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadOrderItems(orderId: string) {
  const rows = await db
    .select({
      id: orderItemsTable.id,
      orderId: orderItemsTable.orderId,
      productId: orderItemsTable.productId,
      productName: productsTable.name,
      formatId: orderItemsTable.formatId,
      formatName: orderItemsTable.formatName,
      quantity: orderItemsTable.quantity,
      unitPrice: orderItemsTable.unitPrice,
      status: orderItemsTable.status,
      notes: orderItemsTable.notes,
      allergyNote: orderItemsTable.allergyNote,
      hasAllergy: orderItemsTable.hasAllergy,
      isInvitation: orderItemsTable.isInvitation,
      createdAt: orderItemsTable.createdAt,
    })
    .from(orderItemsTable)
    .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(eq(orderItemsTable.orderId, orderId))
    .orderBy(orderItemsTable.createdAt);

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

async function writeAudit(
  orderId: string | null,
  employeeId: string | null | undefined,
  employeeName: string,
  action: string,
  details: string,
) {
  try {
    await db.insert(auditLogTable).values({
      orderId: orderId ?? null,
      employeeId: employeeId ?? null,
      employeeName,
      action,
      details,
    });
  } catch {
    // audit failure must not break the main operation
  }
}

function emitRefresh(orderId: string, employeeName?: string) {
  try {
    emitToFunction("floor", "orders:refresh", { orderId, employeeName });
  } catch { /* socket not initialised */ }
}

// ── GET /tables/:tableId/order ─────────────────────────────────────────────────

router.get("/tables/:tableId/order", requireAuth, async (req, res): Promise<void> => {
  const tableId = req.params.tableId as string;

  const [table] = await db
    .select()
    .from(restaurantTablesTable)
    .where(eq(restaurantTablesTable.id, tableId));

  if (!table) { res.status(404).json({ error: "Mesa no encontrada" }); return; }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.tableId, tableId), inArray(ordersTable.status, ["open", "sent", "ready", "bill_requested"])))
    .orderBy(ordersTable.createdAt)
    .limit(1);

  if (!order) { res.status(404).json({ error: "No hay pedido activo para esta mesa" }); return; }

  const items = await loadOrderItems(order.id);
  res.json({ table, order: { ...order, items } });
});

// ── PATCH /orders/:orderId — update guestCount / notes / status ───────────────

router.patch("/orders/:orderId", requireAuth, async (req, res): Promise<void> => {
  const orderId = req.params.orderId as string;
  const { guestCount, notes, status } = req.body as {
    guestCount?: number; notes?: string; status?: string;
  };

  const ALLOWED_STATUSES = ["open", "bill_requested"];
  const updates: Record<string, unknown> = {};
  if (guestCount != null && Number.isFinite(guestCount) && guestCount >= 1)
    updates.guestCount = Math.floor(guestCount);
  if (notes != null) updates.notes = notes;
  if (status != null && ALLOWED_STATUSES.includes(status)) updates.status = status;

  if (!Object.keys(updates).length) { res.status(400).json({ error: "Sin cambios" }); return; }

  const [order] = await db
    .update(ordersTable)
    .set(updates as Partial<typeof ordersTable.$inferInsert>)
    .where(eq(ordersTable.id, orderId))
    .returning();

  if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }

  if (status === "bill_requested") {
    // Update the table status as well
    if (order.tableId) {
      await db
        .update(restaurantTablesTable)
        .set({ status: "bill_requested" })
        .where(eq(restaurantTablesTable.id, order.tableId));
      try { emitToFunction("floor", "tables:refresh"); } catch { /* ignore */ }
    }
    await writeAudit(orderId, req.user?.id, req.user?.name ?? "", "bill_request", "Cuenta solicitada");
  }

  if (guestCount != null) {
    await writeAudit(orderId, req.user?.id, req.user?.name ?? "", "update_guests",
      `Comensales actualizado a ${Math.floor(guestCount)}`);
  }

  emitRefresh(orderId, req.user?.name);
  res.json({ ...order, items: [] });
});

// ── POST /orders/:orderId/items ────────────────────────────────────────────────

router.post("/orders/:orderId/items", requireAuth, async (req, res): Promise<void> => {
  const orderId = req.params.orderId as string;
  const {
    productId,
    quantity = 1,
    notes,
    formatId,
    isInvitation = false,
    modifiers,
  } = req.body as {
    productId: string;
    quantity?: number;
    notes?: string;
    formatId?: string;
    isInvitation?: boolean;
    modifiers?: { modifierId?: string; modifierName: string; priceDelta: string }[];
  };

  if (!productId) { res.status(400).json({ error: "productId es requerido" }); return; }

  // Guard: only add items to open or sent orders
  const [currentOrder] = await db
    .select({ status: ordersTable.status })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));
  if (!currentOrder) { res.status(404).json({ error: "Pedido no encontrado" }); return; }
  if (currentOrder.status === "bill_requested" || currentOrder.status === "paid" || currentOrder.status === "completed") {
    res.status(409).json({ error: "No se pueden añadir productos: el pedido no está abierto" }); return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId));

  if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }

  // Resolve unit price and taxRate: format overrides product
  let unitPrice = product.price;
  let resolvedFormatId: string | null = null;
  let resolvedFormatName: string | null = null;
  // taxRate: format.taxRate (if set) overrides product.taxRate; default 10
  let taxRate: number = product.taxRate ?? 10;

  if (formatId) {
    const [fmt] = await db
      .select()
      .from(productFormatsTable)
      .where(and(eq(productFormatsTable.id, formatId), eq(productFormatsTable.productId, productId)));
    if (fmt) {
      unitPrice = fmt.price;
      resolvedFormatId = fmt.id;
      resolvedFormatName = fmt.name;
      // Format taxRate overrides product taxRate when explicitly set
      if (fmt.taxRate != null) taxRate = fmt.taxRate;
    }
  }

  // Add modifier price deltas
  if (modifiers?.length) {
    const delta = modifiers.reduce((sum, m) => sum + parseFloat(m.priceDelta || "0"), 0);
    unitPrice = String(parseFloat(unitPrice) + delta);
  }

  const [item] = await db
    .insert(orderItemsTable)
    .values({
      orderId,
      productId,
      formatId: resolvedFormatId,
      formatName: resolvedFormatName,
      quantity,
      unitPrice,
      taxRate,
      status: "draft",
      notes: notes ?? "",
      allergyNote: "",
      hasAllergy: false,
      isInvitation,
    })
    .returning();

  // Insert modifiers inline
  if (modifiers?.length) {
    await db.insert(orderItemModifiersTable).values(
      modifiers.map((m) => ({
        orderItemId: item.id,
        modifierId: m.modifierId ?? null,
        modifierName: m.modifierName,
        priceDelta: m.priceDelta,
      })),
    );
  }

  const itemModifiers = modifiers?.length
    ? await db.select().from(orderItemModifiersTable).where(eq(orderItemModifiersTable.orderItemId, item.id))
    : [];

  // NOTE: Stock is decremented at send time (POST /orders/:orderId/send), not here.
  // This keeps draft items from prematurely locking inventory.

  await writeAudit(orderId, req.user?.id, req.user?.name ?? "", "add_item",
    `Añadido: ${product.name}${resolvedFormatName ? ` [${resolvedFormatName}]` : ""}`);

  // Log modification after prefactura if one was already printed
  const [existingPrintAdd] = await db
    .select({ id: prefacturaPrintsTable.id })
    .from(prefacturaPrintsTable)
    .where(eq(prefacturaPrintsTable.orderId, orderId))
    .limit(1);
  if (existingPrintAdd) {
    await writeAudit(orderId, req.user?.id, req.user?.name ?? "", "modified_after_prefactura",
      `Comanda modificada tras prefactura: ${product.name} añadido`);
  }

  emitRefresh(orderId, req.user?.name);

  res.status(201).json({
    id: item.id,
    orderId: item.orderId,
    productId: item.productId,
    productName: product.name,
    formatId: item.formatId,
    formatName: item.formatName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    status: item.status,
    notes: item.notes,
    allergyNote: item.allergyNote,
    hasAllergy: item.hasAllergy,
    isInvitation: item.isInvitation,
    modifiers: itemModifiers,
    createdAt: item.createdAt,
  });
});

// ── PATCH /order-items/:itemId — update quantity / notes / flags ──────────────

router.patch("/order-items/:itemId", requireAuth, async (req, res): Promise<void> => {
  const itemId = req.params.itemId as string;
  const { quantity, notes, allergyNote, hasAllergy, isInvitation } = req.body as {
    quantity?: number;
    notes?: string;
    allergyNote?: string;
    hasAllergy?: boolean;
    isInvitation?: boolean;
  };

  const [item] = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.id, itemId));

  if (!item) { res.status(404).json({ error: "Línea no encontrada" }); return; }

  if (quantity != null && item.status !== "draft") {
    res.status(400).json({ error: "Solo se puede cambiar la cantidad de líneas en borrador" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (quantity != null && Number.isFinite(quantity) && quantity >= 1) updates.quantity = Math.floor(quantity);
  if (notes != null) updates.notes = notes;
  if (allergyNote != null) updates.allergyNote = allergyNote;
  if (hasAllergy != null) updates.hasAllergy = hasAllergy;
  if (isInvitation != null) updates.isInvitation = isInvitation;

  if (!Object.keys(updates).length) { res.status(400).json({ error: "Sin cambios" }); return; }

  const [updated] = await db
    .update(orderItemsTable)
    .set(updates as Partial<typeof orderItemsTable.$inferInsert>)
    .where(eq(orderItemsTable.id, itemId))
    .returning();

  const itemModifiers = await db
    .select()
    .from(orderItemModifiersTable)
    .where(eq(orderItemModifiersTable.orderItemId, itemId));

  const [product] = await db
    .select({ name: productsTable.name })
    .from(productsTable)
    .where(eq(productsTable.id, item.productId));

  // Log modification after prefactura if one was already printed
  const [existingPrint] = await db
    .select({ id: prefacturaPrintsTable.id })
    .from(prefacturaPrintsTable)
    .where(eq(prefacturaPrintsTable.orderId, item.orderId))
    .limit(1);
  if (existingPrint) {
    await writeAudit(item.orderId, req.user?.id, req.user?.name ?? "", "modified_after_prefactura",
      `Comanda modificada tras prefactura: ${product?.name ?? "ítem"} actualizado`);
  }

  emitRefresh(item.orderId, req.user?.name);
  res.json({ ...updated, productName: product?.name ?? "", modifiers: itemModifiers });
});

// ── POST /order-items/:itemId/duplicate ───────────────────────────────────────

router.post("/order-items/:itemId/duplicate", requireAuth, async (req, res): Promise<void> => {
  const itemId = req.params.itemId as string;

  const [original] = await db
    .select()
    .from(orderItemsTable)
    .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(eq(orderItemsTable.id, itemId));

  if (!original) { res.status(404).json({ error: "Línea no encontrada" }); return; }

  const srcItem = original.order_items;
  const srcProduct = original.products;

  const originalMods = await db
    .select()
    .from(orderItemModifiersTable)
    .where(eq(orderItemModifiersTable.orderItemId, itemId));

  const [copy] = await db
    .insert(orderItemsTable)
    .values({
      orderId: srcItem.orderId,
      productId: srcItem.productId,
      formatId: srcItem.formatId,
      formatName: srcItem.formatName,
      quantity: 1,
      unitPrice: srcItem.unitPrice,
      taxRate: srcItem.taxRate,
      status: "draft",
      notes: srcItem.notes,
      allergyNote: srcItem.allergyNote,
      hasAllergy: srcItem.hasAllergy,
      isInvitation: srcItem.isInvitation,
    })
    .returning();

  let copyMods: typeof originalMods = [];
  if (originalMods.length) {
    await db.insert(orderItemModifiersTable).values(
      originalMods.map((m) => ({
        orderItemId: copy.id,
        modifierId: m.modifierId,
        modifierName: m.modifierName,
        priceDelta: m.priceDelta,
      })),
    );
    copyMods = await db.select().from(orderItemModifiersTable).where(eq(orderItemModifiersTable.orderItemId, copy.id));
  }

  await writeAudit(srcItem.orderId, req.user?.id, req.user?.name ?? "", "duplicate_item", `Duplicado: ${srcProduct.name}`);
  emitRefresh(srcItem.orderId, req.user?.name);

  res.status(201).json({
    ...copy,
    productName: srcProduct.name,
    modifiers: copyMods,
  });
});

// ── DELETE /order-items/:itemId ────────────────────────────────────────────────

router.delete("/order-items/:itemId", requireAuth, async (req, res): Promise<void> => {
  const itemId = req.params.itemId as string;

  const [item] = await db
    .select()
    .from(orderItemsTable)
    .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(eq(orderItemsTable.id, itemId));

  if (!item) { res.status(404).json({ error: "Línea no encontrada" }); return; }

  const itemStatus = item.order_items.status;

  if (itemStatus === "sent") {
    // Item already sent to KDS — cancel the kitchen task and propagate to KDS displays
    const now = new Date();
    await db
      .update(kitchenTasksTable)
      .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
      .where(eq(kitchenTasksTable.orderItemId, itemId));

    // ── Stock restore: reverse the consumption logged at send time ────────────
    try {
      const recipeLines = await db
        .select({
          ingredientId: recipeItemsTable.ingredientId,
          quantity: recipeItemsTable.quantity,
          wastePercent: recipeItemsTable.wastePercent,
          averageCost: ingredientsTable.averageCost,
          purchaseCost: ingredientsTable.purchaseCost,
        })
        .from(recipeItemsTable)
        .innerJoin(ingredientsTable, eq(recipeItemsTable.ingredientId, ingredientsTable.id))
        .where(and(
          eq(recipeItemsTable.productId, item.order_items.productId),
          item.order_items.formatId
            ? eq(recipeItemsTable.formatId, item.order_items.formatId)
            : sql`(${recipeItemsTable.formatId} IS NULL)`,
        ));

      if (recipeLines.length > 0) {
        const restoreMap = new Map<string, { qty: number; avgCost: string }>();
        for (const line of recipeLines) {
          if (!line.ingredientId) continue;
          const qty =
            parseFloat(line.quantity) *
            (1 + parseFloat(line.wastePercent) / 100) *
            item.order_items.quantity;
          const existing = restoreMap.get(line.ingredientId);
          if (existing) existing.qty += qty;
          else restoreMap.set(line.ingredientId, { qty, avgCost: String(line.averageCost ?? line.purchaseCost ?? "0") });
        }

        await db.transaction(async (tx) => {
          for (const [ingredientId, { qty, avgCost }] of restoreMap) {
            await tx
              .update(ingredientsTable)
              .set({
                currentStock: sql`(${ingredientsTable.currentStock})::numeric + ${qty}::numeric`,
                updatedAt: new Date(),
              })
              .where(eq(ingredientsTable.id, ingredientId));

            await tx.insert(stockMovementsTable).values({
              ingredientId,
              movementType: "sale_reversal",
              quantity: String(qty),
              unitCost: avgCost,
              reason: `Anulación: ${item.products.name}`,
              employeeId: req.user?.id ?? null,
              orderItemId: item.order_items.id,
            });
          }
        });
      }
    } catch (_) { /* best-effort stock restore */ }

    await db.delete(orderItemsTable).where(eq(orderItemsTable.id, itemId));

    await writeAudit(item.order_items.orderId, req.user?.id, req.user?.name ?? "", "cancel_sent_item",
      `Anulado tras envío a cocina: ${item.products.name}`);

    // Notify KDS displays immediately
    try { emitToFunction("kds", "kds:refresh", { employeeName: req.user?.name ?? null }); } catch { /* ignore */ }
    emitRefresh(item.order_items.orderId, req.user?.name);
    res.status(204).send();
    return;
  }

  if (itemStatus !== "draft") {
    res.status(400).json({ error: "Solo se pueden eliminar líneas en borrador o enviadas" });
    return;
  }

  await db.delete(orderItemsTable).where(eq(orderItemsTable.id, itemId));

  await writeAudit(item.order_items.orderId, req.user?.id, req.user?.name ?? "", "cancel_item",
    `Anulado: ${item.products.name}`);

  // Log modification after prefactura if one was already printed
  const [existingPrintDel] = await db
    .select({ id: prefacturaPrintsTable.id })
    .from(prefacturaPrintsTable)
    .where(eq(prefacturaPrintsTable.orderId, item.order_items.orderId))
    .limit(1);
  if (existingPrintDel) {
    await writeAudit(item.order_items.orderId, req.user?.id, req.user?.name ?? "", "modified_after_prefactura",
      `Comanda modificada tras prefactura: ${item.products.name} eliminado`);
  }

  emitRefresh(item.order_items.orderId, req.user?.name);

  res.status(204).send();
});

// ── POST /orders/:orderId/send — send drafts to KDS ───────────────────────────

router.post("/orders/:orderId/send", requireAuth, idempotency, async (req, res): Promise<void> => {
  const orderId = req.params.orderId as string;

  // Guard: cannot send when bill is already requested
  const [currentOrder] = await db
    .select({ status: ordersTable.status })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));
  if (!currentOrder) { res.status(404).json({ error: "Pedido no encontrado" }); return; }
  if (currentOrder.status === "bill_requested") {
    res.status(409).json({ error: "No se puede enviar a cocina: la cuenta ya ha sido solicitada" }); return;
  }

  // Load print mode — determines whether KDS tasks and socket events are created.
  // kds_only (default): KDS tasks + kds:refresh, no physical printing.
  // printers_only: no KDS tasks, no kds:refresh, physical printing only.
  // both: KDS tasks + kds:refresh + physical printing.
  const [businessCfg] = await db
    .select({ printMode: businessConfigTable.printMode })
    .from(businessConfigTable)
    .limit(1);
  const printMode = (businessCfg?.printMode ?? "kds_only") as "kds_only" | "printers_only" | "both";
  const sendToKds = printMode !== "printers_only";

  // Capture sentAt BEFORE the transaction so isAdded is correct on first send.
  // After the transaction, sentAt is always non-null, so deriving it post-update
  // would wrongly flag every first send as "AÑADIDO".
  const [preUpdateOrder] = await db
    .select({ sentAt: ordersTable.sentAt })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));
  const wasAlreadySent = preUpdateOrder?.sentAt !== null;

  let draftItems = await db
    .select()
    .from(orderItemsTable)
    .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(and(eq(orderItemsTable.orderId, orderId), eq(orderItemsTable.status, "draft")));

  if (draftItems.length === 0) {
    res.status(400).json({ error: "No hay líneas en borrador para enviar" });
    return;
  }

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

  let updated: typeof ordersTable.$inferSelect | undefined;
  try {
    updated = await db.transaction(async (tx) => {
    // Serialize every send for this order, including requests with different
    // idempotency keys or no key at all.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"order-send:" + orderId}))`);

    const [lockedOrder] = await tx
      .select({ status: ordersTable.status })
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .for("update");
    if (!lockedOrder) throw new Error("ORDER_NOT_FOUND");
    if (lockedOrder.status === "bill_requested") throw new Error("BILL_REQUESTED");

    // Re-read drafts only after acquiring the lock. A concurrent request that
    // already sent them will observe an empty set and cannot duplicate effects.
    draftItems = await tx
      .select()
      .from(orderItemsTable)
      .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
      .where(and(eq(orderItemsTable.orderId, orderId), eq(orderItemsTable.status, "draft")));
    if (draftItems.length === 0) throw new Error("NO_DRAFT_ITEMS");

    const lockedDraftItemIds = draftItems.map((row) => row.order_items.id);
    const lockedMods = await tx
      .select()
      .from(orderItemModifiersTable)
      .where(inArray(orderItemModifiersTable.orderItemId, lockedDraftItemIds));
    modsByItem.clear();
    for (const modifier of lockedMods) {
      if (!modsByItem.has(modifier.orderItemId)) modsByItem.set(modifier.orderItemId, []);
      modsByItem.get(modifier.orderItemId)!.push(modifier);
    }

    // Only create KDS tasks when the mode includes KDS (kds_only or both).
    // printers_only mode routes entirely through physical printers — no KDS tasks.
    if (sendToKds) {
      for (const row of draftItems) {
        const item = row.order_items;
        const product = row.products;

        const mods = modsByItem.get(item.id) ?? [];
        const modText = mods.map((m) => m.modifierName).join(", ");
        const formatPart = item.formatName ? `[${item.formatName}]` : "";
        const fullNote = [formatPart, modText, item.notes].filter(Boolean).join(" | ");

        await tx.insert(kitchenTasksTable).values({
          orderId,
          orderItemId: item.id,
          prepZone: product.prepZone,
          productName: product.name + (item.formatName ? ` (${item.formatName})` : ""),
          quantity: item.quantity,
          status: "new",
          notes: fullNote,
          allergyNote: item.allergyNote,
          hasAllergy: item.hasAllergy,
        });
      }
    }

    await tx
      .update(orderItemsTable)
      .set({ status: "sent" })
      .where(inArray(orderItemsTable.id, lockedDraftItemIds));

    await tx
      .update(ordersTable)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(ordersTable.id, orderId));

    // Stock movement creation and decrement are part of the SAME transaction as
    // KDS task creation. A failure rolls back the whole send.
    const consumptionMap = new Map<string, {
      ingredientId: string;
      consumed: number;
      avgCost: string;
      productName: string;
      formatName: string | null;
      itemId: string;
    }>();
    for (const row of draftItems) {
      const item = row.order_items;
      const product = row.products;

      // Try format-specific recipe first, fall back to base recipe
      let recipeLines = await tx
        .select({
          ingredientId: recipeItemsTable.ingredientId,
          quantity: recipeItemsTable.quantity,
          wastePercent: recipeItemsTable.wastePercent,
          averageCost: ingredientsTable.averageCost,
          purchaseCost: ingredientsTable.purchaseCost,
        })
        .from(recipeItemsTable)
        .innerJoin(ingredientsTable, eq(recipeItemsTable.ingredientId, ingredientsTable.id))
        .where(and(
          eq(recipeItemsTable.productId, item.productId),
          item.formatId
            ? eq(recipeItemsTable.formatId, item.formatId)
            : sql`(${recipeItemsTable.formatId} IS NULL)`,
        ));

      // If format-specific returned nothing AND we have a formatId, try base recipe
      if (recipeLines.length === 0 && item.formatId) {
        recipeLines = await tx
          .select({
            ingredientId: recipeItemsTable.ingredientId,
            quantity: recipeItemsTable.quantity,
            wastePercent: recipeItemsTable.wastePercent,
            averageCost: ingredientsTable.averageCost,
            purchaseCost: ingredientsTable.purchaseCost,
          })
          .from(recipeItemsTable)
          .innerJoin(ingredientsTable, eq(recipeItemsTable.ingredientId, ingredientsTable.id))
          .where(and(
            eq(recipeItemsTable.productId, item.productId),
            sql`(${recipeItemsTable.formatId} IS NULL)`,
          ));
      }

      for (const line of recipeLines) {
        if (!line.ingredientId) continue;
        const consumed =
          parseFloat(line.quantity) *
          (1 + parseFloat(line.wastePercent) / 100) *
          item.quantity;
        const movementKey = `${item.id}:${line.ingredientId}`;
        const existing = consumptionMap.get(movementKey);
        const avgCost = String(line.averageCost ?? line.purchaseCost ?? "0");
        if (existing) {
          existing.consumed += consumed;
        } else {
          consumptionMap.set(movementKey, {
            ingredientId: line.ingredientId,
            consumed,
            avgCost,
            productName: product.name,
            formatName: item.formatName,
            itemId: item.id,
          });
        }
      }
    }

    for (const {
      ingredientId,
      consumed,
      avgCost,
      productName,
      formatName,
      itemId,
    } of consumptionMap.values()) {
      const [movement] = await tx
        .insert(stockMovementsTable)
        .values({
            ingredientId,
            movementType: "sale",
            quantity: String(-consumed),
            unitCost: avgCost,
            reason: `Venta: ${productName}${formatName ? ` [${formatName}]` : ""}`,
            employeeId: req.user?.id ?? null,
            orderItemId: itemId,
          })
        .onConflictDoNothing()
        .returning({ id: stockMovementsTable.id });
      if (!movement) continue;

      await tx
        .update(ingredientsTable)
        .set({
          currentStock: sql`GREATEST(0, (${ingredientsTable.currentStock})::numeric - ${consumed}::numeric)`,
          updatedAt: new Date(),
        })
        .where(eq(ingredientsTable.id, ingredientId));
    }

    const [updatedOrder] = await tx
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    if (!updatedOrder) throw new Error("ORDER_NOT_FOUND");

    // Persist the exact successful response in the SAME transaction as KDS and
    // stock side effects. A process crash after COMMIT can still be replayed.
    const requestKey = req.headers["idempotency-key"];
    if (typeof requestKey === "string" && req.user?.id) {
      await tx
        .insert(idempotencyKeysTable)
        .values({
          cacheKey: `${req.user.id}:${requestKey}`,
          userId: req.user.id,
          statusCode: 200,
          response: updatedOrder,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .onConflictDoNothing();
    }
    return updatedOrder;
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "SEND_FAILED";
    if (reason === "ORDER_NOT_FOUND") {
      res.status(404).json({ error: "Pedido no encontrado" });
      return;
    }
    if (reason === "BILL_REQUESTED") {
      res.status(409).json({ error: "No se puede enviar a cocina: la cuenta ya ha sido solicitada" });
      return;
    }
    if (reason === "NO_DRAFT_ITEMS") {
      res.status(409).json({ error: "La comanda ya fue enviada" });
      return;
    }
    logger.error({ orderId, err }, "Atomic order send failed");
    res.status(503).json({ error: "No se pudo enviar la comanda de forma segura" });
    return;
  }

  await writeAudit(orderId, req.user?.id, req.user?.name ?? "", "send_kds",
    `${draftItems.length} línea(s) enviada(s) a preparación`);

  try {
    // kds:refresh is only meaningful when KDS is active (kds_only or both).
    // printers_only mode skips KDS socket event to avoid confusing KDS screens.
    if (sendToKds) {
      emitToFunction("kds", "kds:refresh", { employeeName: req.user?.name ?? null });
    }
    emitRefresh(orderId, req.user?.name);
  } catch { /* ignore */ }

  // ── Print dispatch (non-blocking, does not affect KDS flow) ──────────────
  try {
    const { dispatchKitchenPrint } = await import("../lib/print-dispatch");
    // isAdded is true only when the order had already been sent BEFORE this
    // request — derived from the pre-transaction snapshot captured above.
    const isAdded = wasAlreadySent;

    const printItems = draftItems.map(row => {
      const item = row.order_items;
      const product = row.products;
      const mods = (modsByItem.get(item.id) ?? []).map(m => m.modifierName);
      return {
        productId: product.id,
        categoryId: product.categoryId,
        prepZone: product.prepZone,
        ticketItem: {
          quantity: item.quantity,
          name: product.name,
          formatName: item.formatName,
          notes: item.notes,
          allergyNote: item.allergyNote,
          hasAllergy: item.hasAllergy,
          modifiers: mods,
        },
      };
    });

    const tableName = updated?.tableId
      ? (await db.select({ name: restaurantTablesTable.name })
          .from(restaurantTablesTable)
          .where(eq(restaurantTablesTable.id, updated.tableId)))[0]?.name
      : null;

    await dispatchKitchenPrint({
      order: {
        id: orderId,
        tableName: tableName ?? null,
        orderNumber: updated?.orderNumber ?? null,
        orderType: updated?.orderType,
        deliveryType: updated?.deliveryType,
        clientName: updated?.clientName,
        guestCount: updated?.guestCount,
        employeeName: req.user?.name,
        estimatedReadyAt: updated?.estimatedReadyAt,
        sentAt: updated?.sentAt,
        createdAt: updated?.createdAt,
      },
      items: printItems,
      isAdded,
      actorId: req.user?.id,
      actorName: req.user?.name,
    });
  } catch { /* print errors never fail the order send */ }

  res.json(updated);
});

// ── POST /orders/:orderId/prefactura/print ─────────────────────────────────────

router.post("/orders/:orderId/prefactura/print", requireAuth, async (req, res): Promise<void> => {
  const orderId = req.params.orderId as string;

  const [order] = await db
    .select({ status: ordersTable.status })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));

  if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }
  if (order.status === "paid") {
    res.status(409).json({ error: "Esta comanda ya ha sido cobrada. No se puede generar una nueva prefactura." });
    return;
  }

  // Compute current total from items (outside transaction — read-only, no contention)
  const items = await db
    .select({ unitPrice: orderItemsTable.unitPrice, quantity: orderItemsTable.quantity })
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, orderId));
  const amount = items.reduce((s, it) => s + parseFloat(it.unitPrice) * it.quantity, 0);

  // Atomic first-print assignment: lock the order row so two concurrent
  // first-print requests can never assign different P-XXXX numbers to the same
  // order.  Inside the transaction:
  //   • SELECT FOR UPDATE serializes concurrent prints for the same order.
  //   • We check existing prints and either reuse the first number or call
  //     nextval() to get a brand-new one — all within the same transaction.
  const { prefacturaNumber, isReprint, totalPrints } = await db.transaction(async (tx) => {
    // Lock the order row for the duration of this transaction
    await tx.execute(sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`);

    const existingPrints = await tx
      .select({ prefacturaNumber: prefacturaPrintsTable.prefacturaNumber })
      .from(prefacturaPrintsTable)
      .where(eq(prefacturaPrintsTable.orderId, orderId))
      .orderBy(asc(prefacturaPrintsTable.printedAt));

    const isReprint = existingPrints.length > 0;

    let prefacturaNumber: number;
    if (isReprint) {
      // Reuse the number that was assigned on the very first print
      prefacturaNumber = existingPrints[0].prefacturaNumber;
    } else {
      // Allocate a new consecutive number; nextval() is itself atomic
      const seqResult = await tx.execute(sql`SELECT nextval('prefactura_number_seq') AS num`);
      prefacturaNumber = Number((seqResult.rows[0] as Record<string, unknown>).num);
    }

    // Always insert one row so totalPrints is a true audit count
    await tx.insert(prefacturaPrintsTable).values({
      orderId,
      prefacturaNumber,
      employeeId: req.user?.id ?? null,
      employeeName: req.user?.name ?? "",
      amount: amount.toFixed(2),
    });

    return { prefacturaNumber, isReprint, totalPrints: existingPrints.length + 1 };
  });

  const action = isReprint ? "reprint_prefactura" : "print_prefactura";
  const code = `P-${String(prefacturaNumber).padStart(4, "0")}`;
  await writeAudit(orderId, req.user?.id, req.user?.name ?? "", action,
    `${isReprint ? "Reimpresión" : "Impresión"} prefactura ${code}, importe: ${amount.toFixed(2)}€`);

  res.status(201).json({
    prefacturaNumber,
    prefacturaCode: code,
    isReprint,
    totalPrints,
    amount: amount.toFixed(2),
  });
});

// ── GET /orders/:orderId/prefactura/status ─────────────────────────────────────

router.get("/orders/:orderId/prefactura/status", requireAuth, async (req, res): Promise<void> => {
  const orderId = req.params.orderId as string;

  const prints = await db
    .select()
    .from(prefacturaPrintsTable)
    .where(eq(prefacturaPrintsTable.orderId, orderId))
    .orderBy(asc(prefacturaPrintsTable.printedAt));

  const hasPrinted = prints.length > 0;
  const firstPrint = prints[0] ?? null;
  const lastPrint  = prints[prints.length - 1] ?? null;

  res.json({
    hasPrinted,
    totalPrints: prints.length,
    prefacturaNumber: firstPrint?.prefacturaNumber ?? null,
    prefacturaCode: firstPrint ? `P-${String(firstPrint.prefacturaNumber).padStart(4, "0")}` : null,
    lastPrintedAt: lastPrint?.printedAt?.toISOString() ?? null,
  });
});

// ── GET /orders/:orderId/audit ─────────────────────────────────────────────────

router.get("/orders/:orderId/audit", requireAuth, async (req, res): Promise<void> => {
  const orderId = req.params.orderId as string;
  const entries = await db
    .select()
    .from(auditLogTable)
    .where(eq(auditLogTable.orderId, orderId))
    .orderBy(desc(auditLogTable.createdAt));
  res.json(entries);
});

// ── POST /orders/:orderId/pase ─────────────────────────────────────────────────

router.post("/orders/:orderId/pase", requireAuth, async (req, res): Promise<void> => {
  const orderId = req.params.orderId as string;
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

    if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }

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
      if (order.tableId) {
        const [tableRow] = await db
          .select({ name: restaurantTablesTable.name })
          .from(restaurantTablesTable)
          .where(eq(restaurantTablesTable.id, order.tableId));
        emitToFunction("floor", "tables:refresh");
        const payload = {
          orderId,
          tableId: order.tableId,
          tableName: tableRow?.name,
          employeeId: order.employeeId,
        };
        emitToFunction("floor", "waiter:order-served", payload);
        if (order.employeeId) emitToEmployee(order.employeeId, "waiter:order-served", payload);
      }
    } catch { /* ignore */ }
  }

  const [updated] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  res.json(updated);
});

export default router;
