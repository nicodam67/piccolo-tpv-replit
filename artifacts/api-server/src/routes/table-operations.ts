/**
 * Table operations: transfer, merge, separate, move-items, transfer-waiter.
 * All mutating operations run inside DB transactions for atomicity.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  restaurantTablesTable,
  ordersTable,
  orderItemsTable,
  tableEventsTable,
} from "@workspace/db";
import { sql, eq, and, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

/** Fire-and-forget event logging */
async function addEvent(params: {
  tableId: string;
  orderId?: string | null;
  employeeId?: string | null;
  employeeName?: string;
  action: string;
  details?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(tableEventsTable).values({
      tableId:      params.tableId,
      orderId:      params.orderId ?? null,
      employeeId:   params.employeeId ?? null,
      employeeName: params.employeeName ?? "",
      action:       params.action,
      details:      params.details ?? "",
      metadata:     params.metadata ?? null,
    });
  } catch { /* non-critical */ }
}

// ── POST /tables/:tableId/transfer ────────────────────────────────────────────
// Moves the full order (all items) from sourceTable → targetTable atomically.
// Source table becomes pendiente_limpieza; target becomes occupied.

router.post("/tables/:tableId/transfer", requireAuth, async (req, res): Promise<void> => {
  const sourceTableId = req.params.tableId as string;
  const { targetTableId } = req.body ?? {};
  const user = (req as any).user as { id?: string; name?: string } | undefined;

  if (!targetTableId || typeof targetTableId !== "string") {
    res.status(400).json({ error: "targetTableId requerido" }); return;
  }
  if (sourceTableId === targetTableId) {
    res.status(400).json({ error: "La mesa de destino debe ser diferente" }); return;
  }

  const result = await db.transaction(async (tx) => {
    // 1. Find source order
    const [sourceOrder] = await tx
      .select({ id: ordersTable.id, employeeId: ordersTable.employeeId })
      .from(ordersTable)
      .where(and(eq(ordersTable.tableId, sourceTableId), eq(ordersTable.status, "open")))
      .limit(1);
    if (!sourceOrder) return { error: "La mesa origen no tiene comanda abierta", status: 409 };

    // 2. Validate target is free
    const [target] = await tx
      .select({ id: restaurantTablesTable.id, status: restaurantTablesTable.status, name: restaurantTablesTable.name })
      .from(restaurantTablesTable)
      .where(and(eq(restaurantTablesTable.id, targetTableId), eq(restaurantTablesTable.active, true)))
      .limit(1);
    if (!target) return { error: "Mesa destino no encontrada", status: 404 };
    if (target.status !== "free") return { error: "La mesa destino no está libre", status: 409 };

    // 3. Move order to target table
    const [updatedOrder] = await tx
      .update(ordersTable)
      .set({ tableId: targetTableId })
      .where(eq(ordersTable.id, sourceOrder.id))
      .returning();

    // 4. Update table statuses
    await tx
      .update(restaurantTablesTable)
      .set({ status: "pendiente_limpieza" })
      .where(eq(restaurantTablesTable.id, sourceTableId));
    await tx
      .update(restaurantTablesTable)
      .set({ status: "occupied" })
      .where(eq(restaurantTablesTable.id, targetTableId));

    return { order: updatedOrder, targetName: target.name };
  });

  if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }

  void addEvent({ tableId: sourceTableId, employeeId: user?.id, employeeName: user?.name, action: "table_transfer", details: `Trasladada a ${result.targetName}`, metadata: { targetTableId } });
  void addEvent({ tableId: targetTableId, orderId: result.order.id, employeeId: user?.id, employeeName: user?.name, action: "table_transfer", details: `Recibida de traslado`, metadata: { sourceTableId } });

  res.json({ success: true, orderId: result.order.id });
});

// ── POST /tables/merge ────────────────────────────────────────────────────────
// Merges 2+ tables into a group. Items from all non-host orders move to the
// host order; non-host orders are closed; all tables share a mergeGroup.

router.post("/tables/merge", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { tableIds } = req.body ?? {};
  const user = (req as any).user as { id?: string; name?: string } | undefined;

  if (!Array.isArray(tableIds) || tableIds.length < 2) {
    res.status(400).json({ error: "Se necesitan al menos 2 mesas para unir" }); return;
  }

  const result = await db.transaction(async (tx) => {
    // Load all tables
    const tables = await tx
      .select()
      .from(restaurantTablesTable)
      .where(and(inArray(restaurantTablesTable.id, tableIds), eq(restaurantTablesTable.active, true)));

    if (tables.length !== tableIds.length) return { error: "Una o más mesas no encontradas", status: 404 };

    const hostTableId = tableIds[0] as string;
    const mergeGroupId = hostTableId; // use host table id as group key

    // Get or create host order
    let [hostOrder] = await tx
      .select({ id: ordersTable.id, employeeId: ordersTable.employeeId })
      .from(ordersTable)
      .where(and(eq(ordersTable.tableId, hostTableId), eq(ordersTable.status, "open")))
      .limit(1);

    if (!hostOrder) {
      const [created] = await tx.insert(ordersTable).values({
        tableId: hostTableId,
        employeeId: user?.id ?? null,
        status: "open",
        guestCount: 1,
      }).returning();
      hostOrder = created;
    }

    // Tag host order's existing items with originalTableId
    await tx
      .update(orderItemsTable)
      .set({ originalTableId: hostTableId } as any)
      .where(and(eq(orderItemsTable.orderId, hostOrder.id), sql`original_table_id IS NULL`));

    // For each non-host table: move items + close its order
    for (const tableId of tableIds.slice(1)) {
      const [nonHostOrder] = await tx
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(and(eq(ordersTable.tableId, tableId as string), eq(ordersTable.status, "open")))
        .limit(1);

      if (nonHostOrder) {
        // Move items: stamp originalTableId and change orderId to host
        await tx
          .update(orderItemsTable)
          .set({ orderId: hostOrder.id, originalTableId: tableId } as any)
          .where(eq(orderItemsTable.orderId, nonHostOrder.id));

        // Close non-host order
        await tx
          .update(ordersTable)
          .set({ status: "closed" } as any)
          .where(eq(ordersTable.id, nonHostOrder.id));
      }
    }

    // Set mergeGroup + occupied on all tables
    await tx
      .update(restaurantTablesTable)
      .set({ mergeGroup: mergeGroupId, status: "occupied" })
      .where(inArray(restaurantTablesTable.id, tableIds));

    return { mergeGroupId, hostOrderId: hostOrder.id };
  });

  if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }

  for (const tableId of tableIds) {
    void addEvent({ tableId: tableId as string, orderId: result.hostOrderId, employeeId: user?.id, employeeName: user?.name, action: "merge_table", details: `Unida en grupo ${result.mergeGroupId}`, metadata: { mergeGroupId: result.mergeGroupId, tableIds } });
  }

  res.json({ success: true, mergeGroupId: result.mergeGroupId, hostOrderId: result.hostOrderId });
});

// ── POST /tables/:tableId/separate ───────────────────────────────────────────
// Separates a merged group. Items are returned to their original tables.

router.post("/tables/:tableId/separate", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const tableId = req.params.tableId as string;
  const user = (req as any).user as { id?: string; name?: string } | undefined;

  const result = await db.transaction(async (tx) => {
    // Find host table
    const [hostTable] = await tx
      .select()
      .from(restaurantTablesTable)
      .where(and(eq(restaurantTablesTable.id, tableId), eq(restaurantTablesTable.active, true)))
      .limit(1);

    if (!hostTable || !hostTable.mergeGroup) return { error: "La mesa no pertenece a ningún grupo unido", status: 409 };

    const mergeGroupId = hostTable.mergeGroup;

    // Find all tables in the group
    const groupTables = await tx
      .select()
      .from(restaurantTablesTable)
      .where(eq(restaurantTablesTable.mergeGroup, mergeGroupId));

    // Find the host order — the host table ID equals mergeGroupId by convention,
    // so this works regardless of which table in the group triggered the request.
    const [hostOrder] = await tx
      .select({ id: ordersTable.id, tableId: ordersTable.tableId })
      .from(ordersTable)
      .where(and(eq(ordersTable.tableId, mergeGroupId), eq(ordersTable.status, "open")))
      .limit(1);

    if (!hostOrder) return { error: "No se encontró la comanda del grupo", status: 409 };

    // Get all items from host order
    const allItems = await tx
      .select({ id: orderItemsTable.id, originalTableId: (orderItemsTable as any).originalTableId })
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, hostOrder.id));

    // For each non-host table: create order + move items
    const hostTableId = hostOrder.tableId;
    for (const t of groupTables) {
      if (t.id === hostTableId) continue; // host keeps its items

      const tableItems = allItems.filter((i: any) => i.originalTableId === t.id);

      // Create new order for this table
      const [newOrder] = await tx.insert(ordersTable).values({
        tableId: t.id,
        employeeId: user?.id ?? null,
        status: "open",
        guestCount: 1,
      }).returning();

      // Move items to new order
      if (tableItems.length > 0) {
        await tx
          .update(orderItemsTable)
          .set({ orderId: newOrder.id })
          .where(inArray(orderItemsTable.id, tableItems.map((i: any) => i.id)));
      }
    }

    // Clear originalTableId for all items still in host order
    await tx
      .update(orderItemsTable)
      .set({ originalTableId: null } as any)
      .where(eq(orderItemsTable.orderId, hostOrder.id));

    // Clear mergeGroup on all tables; they remain occupied
    await tx
      .update(restaurantTablesTable)
      .set({ mergeGroup: null })
      .where(eq(restaurantTablesTable.mergeGroup, mergeGroupId));

    return { success: true, groupTableCount: groupTables.length };
  });

  if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }

  void addEvent({ tableId, employeeId: user?.id, employeeName: user?.name, action: "separate_table", details: `Grupo separado — ${result.groupTableCount} mesas` });

  res.json({ success: true });
});

// ── POST /orders/:orderId/move-items ──────────────────────────────────────────
// Moves specific items from one order to another (or to a new order on targetTable).

router.post("/orders/:orderId/move-items", requireAuth, async (req, res): Promise<void> => {
  const orderId = req.params.orderId as string;
  const { itemIds, targetTableId } = req.body ?? {};
  const user = (req as any).user as { id?: string; name?: string } | undefined;

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    res.status(400).json({ error: "itemIds requerido (array no vacío)" }); return;
  }
  if (!targetTableId || typeof targetTableId !== "string") {
    res.status(400).json({ error: "targetTableId requerido" }); return;
  }

  const result = await db.transaction(async (tx) => {
    // Validate target table is occupied (has open order)
    const [targetOrder] = await tx
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(and(eq(ordersTable.tableId, targetTableId), eq(ordersTable.status, "open")))
      .limit(1);

    if (!targetOrder) {
      // Auto-create order on target if table is free
      const [targetTable] = await tx
        .select()
        .from(restaurantTablesTable)
        .where(and(eq(restaurantTablesTable.id, targetTableId), eq(restaurantTablesTable.active, true)))
        .limit(1);
      if (!targetTable) return { error: "Mesa destino no encontrada", status: 404 };
      if (targetTable.status !== "free" && targetTable.status !== "occupied") {
        return { error: "La mesa destino no puede recibir productos", status: 409 };
      }
    }

    let targetOrderId: string;
    if (targetOrder) {
      targetOrderId = targetOrder.id;
    } else {
      // Create order on the free table and mark it occupied atomically
      const [newOrder] = await tx.insert(ordersTable).values({
        tableId: targetTableId,
        employeeId: user?.id ?? null,
        status: "open",
        guestCount: 1,
      }).returning();
      await tx
        .update(restaurantTablesTable)
        .set({ status: "occupied" })
        .where(eq(restaurantTablesTable.id, targetTableId));
      targetOrderId = newOrder.id;
    }

    // Move items
    await tx
      .update(orderItemsTable)
      .set({ orderId: targetOrderId })
      .where(and(eq(orderItemsTable.orderId, orderId), inArray(orderItemsTable.id, itemIds)));

    return { targetOrderId };
  });

  if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }

  void addEvent({ tableId: targetTableId, orderId: result.targetOrderId, employeeId: user?.id, employeeName: user?.name, action: "move_items", details: `${itemIds.length} producto(s) movidos`, metadata: { itemIds, sourceOrderId: orderId } });

  res.json({ success: true, targetOrderId: result.targetOrderId });
});

// ── POST /tables/:tableId/transfer-waiter ─────────────────────────────────────
// Reassigns the table's current order to a different waiter.

router.post("/tables/:tableId/transfer-waiter", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const tableId = req.params.tableId as string;
  const { newEmployeeId, authorisedById } = req.body ?? {};
  const user = (req as any).user as { id?: string; name?: string } | undefined;

  if (!newEmployeeId || typeof newEmployeeId !== "string") {
    res.status(400).json({ error: "newEmployeeId requerido" }); return;
  }

  // Find open order
  const [order] = await db
    .select({ id: ordersTable.id, employeeId: ordersTable.employeeId })
    .from(ordersTable)
    .where(and(eq(ordersTable.tableId, tableId), eq(ordersTable.status, "open")))
    .limit(1);

  if (!order) { res.status(409).json({ error: "No hay comanda abierta en esta mesa" }); return; }

  const prevEmployeeId = order.employeeId;

  await db
    .update(ordersTable)
    .set({ employeeId: newEmployeeId })
    .where(eq(ordersTable.id, order.id));

  void addEvent({
    tableId,
    orderId: order.id,
    employeeId: user?.id,
    employeeName: user?.name,
    action: "waiter_transfer",
    details: `Camarero cambiado`,
    metadata: { prevEmployeeId, newEmployeeId, authorisedById: authorisedById ?? user?.id },
  });

  res.json({ success: true, orderId: order.id, newEmployeeId });
});

export default router;
