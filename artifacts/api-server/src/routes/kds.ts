import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  kitchenTasksTable,
  ordersTable,
  restaurantTablesTable,
  employeesTable,
  waiterNotificationsTable,
  auditLogTable,
} from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getIO } from "../lib/socket";

const router: IRouter = Router();

// Zones: active/in-progress statuses + cancelled so cooks see void notifications
const ZONE_STATUSES = ["new", "preparing", "ready", "cancelled"];
const PASE_STATUSES = ["ready"];

const TASK_FIELDS = {
  id: kitchenTasksTable.id,
  orderId: kitchenTasksTable.orderId,
  orderItemId: kitchenTasksTable.orderItemId,
  prepZone: kitchenTasksTable.prepZone,
  productName: kitchenTasksTable.productName,
  quantity: kitchenTasksTable.quantity,
  status: kitchenTasksTable.status,
  notes: kitchenTasksTable.notes,
  allergyNote: kitchenTasksTable.allergyNote,
  hasAllergy: kitchenTasksTable.hasAllergy,
  createdAt: kitchenTasksTable.createdAt,
  updatedAt: kitchenTasksTable.updatedAt,
  readyAt: kitchenTasksTable.readyAt,
  collectedAt: kitchenTasksTable.collectedAt,
  servedAt: kitchenTasksTable.servedAt,
  cancelledAt: kitchenTasksTable.cancelledAt,
  // LEFT JOIN — null when the order has no table (takeaway/delivery online orders)
  tableName: restaurantTablesTable.name,
  employeeName: employeesTable.name,
  employeeId: ordersTable.employeeId,
  // Online order fields — present for takeaway/delivery
  orderType: ordersTable.orderType,
  clientName: ordersTable.clientName,
};

// ── GET /kds/history — recent completed/cancelled tasks (last 8 hours) ─────────
// IMPORTANT: this must come BEFORE GET /kds/:zone so "history" isn't treated as a zone name.

router.get("/kds/history", requireAuth, async (req, res): Promise<void> => {
  const cutoff = new Date(Date.now() - 8 * 60 * 60 * 1000);

  const tasks = await db
    .select(TASK_FIELDS)
    .from(kitchenTasksTable)
    .innerJoin(ordersTable, eq(kitchenTasksTable.orderId, ordersTable.id))
    .leftJoin(restaurantTablesTable, eq(ordersTable.tableId, restaurantTablesTable.id))
    .leftJoin(employeesTable, eq(ordersTable.employeeId, employeesTable.id))
    .where(inArray(kitchenTasksTable.status, ["collected", "served", "cancelled"]))
    .orderBy(desc(kitchenTasksTable.updatedAt))
    .limit(200);

  // Only tasks updated in the last 8 h
  const filtered = tasks.filter(t => new Date(t.updatedAt) >= cutoff);
  res.json(filtered);
});

// GET /kds/:zone
router.get("/kds/:zone", requireAuth, async (req, res): Promise<void> => {
  const { zone } = req.params;
  const validZones = ["cocina", "pizza", "ensalada", "barra", "pase"];

  if (!validZones.includes(zone)) {
    res.status(400).json({ error: "Zona no válida" });
    return;
  }

  const baseQuery = db
    .select(TASK_FIELDS)
    .from(kitchenTasksTable)
    .innerJoin(ordersTable, eq(kitchenTasksTable.orderId, ordersTable.id))
    .leftJoin(restaurantTablesTable, eq(ordersTable.tableId, restaurantTablesTable.id))
    .leftJoin(employeesTable, eq(ordersTable.employeeId, employeesTable.id));

  const rawTasks =
    zone === "pase"
      ? await baseQuery
          .where(inArray(kitchenTasksTable.status, PASE_STATUSES))
          .orderBy(kitchenTasksTable.createdAt)
      : await baseQuery
          .where(
            and(
              eq(kitchenTasksTable.prepZone, zone),
              inArray(kitchenTasksTable.status, ZONE_STATUSES),
            ),
          )
          .orderBy(kitchenTasksTable.createdAt);

  // Defense-in-depth: filter out collected/served in application code so that
  // a stale cache or unexpected DB result never surfaces finished tasks on the
  // kitchen display.
  const allowedStatuses = zone === "pase" ? PASE_STATUSES : ZONE_STATUSES;
  const tasks = rawTasks.filter((t) => allowedStatuses.includes(t.status));

  res.json(tasks);
});

// PATCH /kitchen-tasks/:taskId/status
router.patch("/kitchen-tasks/:taskId/status", requireAuth, async (req, res): Promise<void> => {
  const { taskId } = req.params;
  const { status } = req.body as { status: string };

  const validStatuses = ["new", "preparing", "ready", "collected", "served", "cancelled"];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: "Estado inválido" });
    return;
  }

  const now = new Date();
  const updateData: Record<string, unknown> = { status, updatedAt: now };
  if (status === "ready") updateData.readyAt = now;
  if (status === "collected") updateData.collectedAt = now;
  if (status === "served") updateData.servedAt = now;

  const [task] = await db
    .update(kitchenTasksTable)
    .set(updateData)
    .where(eq(kitchenTasksTable.id, taskId))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Tarea no encontrada" });
    return;
  }

  try {
    getIO().emit("kds:refresh");
  } catch {
    // socket not initialised
  }

  // Check if all tasks for this order are ready → notify waiter
  if (status === "ready") {
    const allTasks = await db
      .select()
      .from(kitchenTasksTable)
      .where(eq(kitchenTasksTable.orderId, task.orderId));

    const allReady = allTasks.every((t) => ["ready", "collected", "served"].includes(t.status));

    if (allReady) {
      await db
        .update(ordersTable)
        .set({ status: "ready" })
        .where(eq(ordersTable.id, task.orderId));

      const [order] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, task.orderId));

      if (order?.tableId && order.employeeId) {
        const [tableRow] = await db
          .select({ name: restaurantTablesTable.name })
          .from(restaurantTablesTable)
          .where(eq(restaurantTablesTable.id, order.tableId));

        const tableName = tableRow?.name ?? "Mesa";

        // Persist notification in DB
        await db.insert(waiterNotificationsTable).values({
          employeeId: order.employeeId,
          orderId: order.id,
          type: "order_ready",
          title: `${tableName} lista para recoger`,
          message: `El pedido de ${tableName} está listo en el pase.`,
        });

        try {
          const io = getIO();
          const payload = {
            orderId: order.id,
            tableId: order.tableId,
            tableName,
            employeeId: order.employeeId,
          };
          // Broadcast: waiter:order-ready (all tablets)
          io.emit("waiter:order-ready", payload);
          // Targeted: only the responsible waiter
          io.emit(`waiter:${order.employeeId}:notification`, {
            type: "order_ready",
            title: `${tableName} lista para recoger`,
            message: `El pedido de ${tableName} está listo en el pase.`,
            ...payload,
          });
        } catch {
          // socket not initialised
        }
      }
    }
  }

  res.json(task);
});

// ── POST /kitchen-tasks/:taskId/resend ────────────────────────────────────────
// Resets a kitchen task to "new" so the cook can re-prepare it.
// Clears all completion timestamps and records an audit entry.

router.post("/kitchen-tasks/:taskId/resend", requireAuth, async (req, res): Promise<void> => {
  const { taskId } = req.params;

  const [existing] = await db
    .select({ id: kitchenTasksTable.id, orderId: kitchenTasksTable.orderId, productName: kitchenTasksTable.productName })
    .from(kitchenTasksTable)
    .where(eq(kitchenTasksTable.id, taskId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Tarea no encontrada" });
    return;
  }

  const now = new Date();
  const [updated] = await db
    .update(kitchenTasksTable)
    .set({
      status: "new",
      updatedAt: now,
      createdAt: now,       // reset timer so the card shows fresh elapsed time
      readyAt: null,
      collectedAt: null,
      servedAt: null,
      cancelledAt: null,
    })
    .where(eq(kitchenTasksTable.id, taskId))
    .returning();

  // Audit trail
  await db.insert(auditLogTable).values({
    orderId:      existing.orderId,
    employeeId:   req.user?.id ?? null,
    employeeName: req.user?.name ?? "",
    action:       "resend_kds",
    details:      `Reenviado a cocina: ${existing.productName}`,
  });

  try {
    getIO().emit("kds:refresh", { employeeName: req.user?.name ?? null });
  } catch { /* ignore */ }

  res.json(updated);
});

export default router;
