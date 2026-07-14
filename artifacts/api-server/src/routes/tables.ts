import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { restaurantTablesTable, roomZonesTable, ordersTable } from "@workspace/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/zones/:zoneId/tables", requireAuth, async (req, res): Promise<void> => {
  const zoneId = Array.isArray(req.params.zoneId) ? req.params.zoneId[0] : req.params.zoneId;

  const tables = await db
    .select({
      id: restaurantTablesTable.id,
      zoneId: restaurantTablesTable.zoneId,
      name: restaurantTablesTable.name,
      capacity: restaurantTablesTable.capacity,
      status: restaurantTablesTable.status,
      x: restaurantTablesTable.x,
      y: restaurantTablesTable.y,
      shape: restaurantTablesTable.shape,
    })
    .from(restaurantTablesTable)
    .where(and(eq(restaurantTablesTable.zoneId, zoneId), eq(restaurantTablesTable.active, true)))
    .orderBy(asc(restaurantTablesTable.name));

  res.json(tables);
});

router.get("/tables", requireAuth, async (_req, res): Promise<void> => {
  const tables = await db
    .select({
      id: restaurantTablesTable.id,
      zoneId: restaurantTablesTable.zoneId,
      name: restaurantTablesTable.name,
      capacity: restaurantTablesTable.capacity,
      status: restaurantTablesTable.status,
      x: restaurantTablesTable.x,
      y: restaurantTablesTable.y,
      shape: restaurantTablesTable.shape,
    })
    .from(restaurantTablesTable)
    .innerJoin(roomZonesTable, eq(restaurantTablesTable.zoneId, roomZonesTable.id))
    .where(and(eq(restaurantTablesTable.active, true), eq(roomZonesTable.active, true)))
    .orderBy(asc(roomZonesTable.sortOrder), asc(restaurantTablesTable.name));

  res.json(tables);
});

// Open a free table: mark occupied + create a new order, return {table, order}
router.post("/tables/:tableId/open", requireAuth, async (req, res): Promise<void> => {
  const tableId = Array.isArray(req.params.tableId) ? req.params.tableId[0] : req.params.tableId;
  const employeeId = (req as any).user?.id as string | undefined;

  const result = await db.transaction(async (tx) => {
    const [table] = await tx
      .update(restaurantTablesTable)
      .set({ status: "occupied" })
      .where(and(eq(restaurantTablesTable.id, tableId), eq(restaurantTablesTable.status, "free")))
      .returning();

    if (!table) return null;

    // Create a new open order
    const [order] = await tx
      .insert(ordersTable)
      .values({ tableId: table.id, employeeId: employeeId ?? null, status: "open" })
      .returning();

    return { table, order: { ...order, items: [] } };
  });

  if (!result) {
    res.status(409).json({ error: "La mesa no está libre" });
    return;
  }

  res.json(result);
});

router.post("/tables/:tableId/close", requireAuth, async (req, res): Promise<void> => {
  const tableId = Array.isArray(req.params.tableId) ? req.params.tableId[0] : req.params.tableId;

  const [table] = await db
    .update(restaurantTablesTable)
    .set({ status: "free" })
    .where(and(eq(restaurantTablesTable.id, tableId), eq(restaurantTablesTable.status, "occupied")))
    .returning();

  if (!table) {
    res.status(409).json({ error: "La mesa no está ocupada" });
    return;
  }

  res.json({
    id: table.id,
    zoneId: table.zoneId,
    name: table.name,
    capacity: table.capacity,
    status: table.status,
    x: table.x,
    y: table.y,
    shape: table.shape,
  });
});

export default router;
