import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  kitchenTasksTable,
  ordersTable,
  restaurantTablesTable,
  employeesTable,
  waiterNotificationsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getIO } from "../lib/socket";

const router: IRouter = Router();

const ZONE_STATUSES = ["new", "preparing", "ready"];
const PASE_STATUSES = ["ready", "collected"];

const TASK_FIELDS = {
  id: kitchenTasksTable.id,
  orderId: kitchenTasksTable.orderId,
  orderItemId: kitchenTasksTable.orderItemId,
  prepZone: kitchenTasksTable.prepZone,
  productName: kitchenTasksTable.productName,
  quantity: kitchenTasksTable.quantity,
  status: kitchenTasksTable.status,
  allergyNote: kitchenTasksTable.allergyNote,
  hasAllergy: kitchenTasksTable.hasAllergy,
  createdAt: kitchenTasksTable.createdAt,
  updatedAt: kitchenTasksTable.updatedAt,
  readyAt: kitchenTasksTable.readyAt,
  collectedAt: kitchenTasksTable.collectedAt,
  servedAt: kitchenTasksTable.servedAt,
  tableName: restaurantTablesTable.name,
  employeeName: employeesTable.name,
  employeeId: ordersTable.employeeId,
};

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
    .innerJoin(restaurantTablesTable, eq(ordersTable.tableId, restaurantTablesTable.id))
    .innerJoin(employeesTable, eq(ordersTable.employeeId, employeesTable.id));

  const tasks =
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

export default router;
