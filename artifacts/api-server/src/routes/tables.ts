import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { restaurantTablesTable, roomZonesTable, ordersTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getIO } from "../lib/socket";

const router: IRouter = Router();

type Shape = "square" | "round" | "rect";
const VALID_SHAPES: Shape[] = ["square", "round", "rect"];

function tableShape(t: typeof restaurantTablesTable.$inferSelect) {
  return {
    id: t.id,
    zoneId: t.zoneId,
    name: t.name,
    capacity: t.capacity,
    status: t.status,
    x: t.x,
    y: t.y,
    width: t.width,
    height: t.height,
    shape: t.shape,
    mergeGroup: t.mergeGroup,
  };
}

// GET /zones/:zoneId/tables — all active tables (all roles)
router.get("/zones/:zoneId/tables", requireAuth, async (req, res): Promise<void> => {
  const zoneId = req.params.zoneId as string;
  const tables = await db
    .select()
    .from(restaurantTablesTable)
    .where(and(eq(restaurantTablesTable.zoneId, zoneId), eq(restaurantTablesTable.active, true)))
    .orderBy(asc(restaurantTablesTable.name));
  res.json(tables.map(tableShape));
});

// GET /tables — all active tables across zones (all roles)
router.get("/tables", requireAuth, async (_req, res): Promise<void> => {
  const tables = await db
    .select()
    .from(restaurantTablesTable)
    .innerJoin(roomZonesTable, eq(restaurantTablesTable.zoneId, roomZonesTable.id))
    .where(and(eq(restaurantTablesTable.active, true), eq(roomZonesTable.active, true)))
    .orderBy(asc(roomZonesTable.sortOrder), asc(restaurantTablesTable.name));
  res.json(tables.map(r => tableShape(r.restaurant_tables)));
});

// POST /zones/:zoneId/tables — create table (admin only)
router.post("/zones/:zoneId/tables", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const zoneId = req.params.zoneId as string;
  const b = req.body ?? {};
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) { res.status(400).json({ error: "Nombre requerido" }); return; }

  const capacity = Number.isFinite(b.capacity) && b.capacity >= 1 ? Math.floor(b.capacity) : 4;
  const x = Number.isFinite(b.x) ? Math.floor(b.x) : 40;
  const y = Number.isFinite(b.y) ? Math.floor(b.y) : 40;
  const width = Number.isFinite(b.width) && b.width >= 20 ? Math.floor(b.width) : 80;
  const height = Number.isFinite(b.height) && b.height >= 20 ? Math.floor(b.height) : 80;
  const shape: Shape = VALID_SHAPES.includes(b.shape) ? b.shape : "square";

  const [table] = await db
    .insert(restaurantTablesTable)
    .values({ zoneId, name, capacity, x, y, width, height, shape })
    .returning();

  res.status(201).json(tableShape(table));
});

// PATCH /tables/:tableId — update layout/props (admin only)
router.patch("/tables/:tableId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const tableId = req.params.tableId as string;
  const b = req.body ?? {};
  const updates: Record<string, unknown> = {};

  if (typeof b.name === "string" && b.name.trim()) updates.name = b.name.trim();
  if (Number.isFinite(b.capacity) && b.capacity >= 1)    updates.capacity = Math.floor(b.capacity);
  if (Number.isFinite(b.x))                              updates.x = Math.floor(b.x);
  if (Number.isFinite(b.y))                              updates.y = Math.floor(b.y);
  if (Number.isFinite(b.width) && b.width >= 20)         updates.width = Math.floor(b.width);
  if (Number.isFinite(b.height) && b.height >= 20)       updates.height = Math.floor(b.height);
  if (VALID_SHAPES.includes(b.shape))                     updates.shape = b.shape;
  if ("mergeGroup" in b)                                  updates.mergeGroup = b.mergeGroup ?? null;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Sin cambios" }); return; }

  const [table] = await db
    .update(restaurantTablesTable)
    .set(updates as Partial<typeof restaurantTablesTable.$inferInsert>)
    .where(and(eq(restaurantTablesTable.id, tableId), eq(restaurantTablesTable.active, true)))
    .returning();

  if (!table) { res.status(404).json({ error: "Mesa no encontrada" }); return; }
  res.json(tableShape(table));
});

// DELETE /tables/:tableId — soft-delete table (admin only)
router.delete("/tables/:tableId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const tableId = req.params.tableId as string;

  const [table] = await db
    .update(restaurantTablesTable)
    .set({ active: false })
    .where(and(eq(restaurantTablesTable.id, tableId), eq(restaurantTablesTable.active, true)))
    .returning();

  if (!table) { res.status(404).json({ error: "Mesa no encontrada" }); return; }
  res.status(204).send();
});

// POST /tables/:tableId/open — open free table + create order (all roles)
router.post("/tables/:tableId/open", requireAuth, async (req, res): Promise<void> => {
  const tableId = req.params.tableId as string;
  const employeeId = (req as any).user?.id as string | undefined;

  const result = await db.transaction(async (tx) => {
    const [table] = await tx
      .update(restaurantTablesTable)
      .set({ status: "occupied" })
      .where(and(eq(restaurantTablesTable.id, tableId), eq(restaurantTablesTable.status, "free")))
      .returning();
    if (!table) return null;
    const [order] = await tx
      .insert(ordersTable)
      .values({ tableId: table.id, employeeId: employeeId ?? null, status: "open" })
      .returning();
    return { table: tableShape(table), order: { ...order, items: [] } };
  });

  if (!result) { res.status(409).json({ error: "La mesa no está libre" }); return; }
  try { getIO().emit("tables:refresh"); } catch (_) {}
  res.json(result);
});

// POST /tables/:tableId/close — free an occupied table (all roles)
router.post("/tables/:tableId/close", requireAuth, async (req, res): Promise<void> => {
  const tableId = req.params.tableId as string;

  const [table] = await db
    .update(restaurantTablesTable)
    .set({ status: "free" })
    .where(and(eq(restaurantTablesTable.id, tableId), eq(restaurantTablesTable.status, "occupied")))
    .returning();

  if (!table) { res.status(409).json({ error: "La mesa no está ocupada" }); return; }
  try { getIO().emit("tables:refresh"); } catch (_) {}
  res.json(tableShape(table));
});

export default router;
