import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { roomZonesTable } from "@workspace/db";
import { eq, asc, max } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// GET /zones — all active zones (all roles)
router.get("/zones", requireAuth, async (_req, res): Promise<void> => {
  const zones = await db
    .select({
      id: roomZonesTable.id,
      name: roomZonesTable.name,
      type: roomZonesTable.type,
      sortOrder: roomZonesTable.sortOrder,
      color: roomZonesTable.color,
    })
    .from(roomZonesTable)
    .where(eq(roomZonesTable.active, true))
    .orderBy(asc(roomZonesTable.sortOrder), asc(roomZonesTable.name));

  res.json(zones);
});

// POST /zones — create zone (admin only)
router.post("/zones", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const type = typeof req.body?.type === "string" ? req.body.type.trim() : "dining";
  if (!name) { res.status(400).json({ error: "Nombre requerido" }); return; }

  const [maxRow] = await db.select({ v: max(roomZonesTable.sortOrder) }).from(roomZonesTable);
  const nextSort = (maxRow?.v ?? 0) + 1;

  const [zone] = await db
    .insert(roomZonesTable)
    .values({ name, type, sortOrder: nextSort })
    .returning();

  res.status(201).json(zone);
});

// PATCH /zones/:zoneId — rename / reorder / recolor zone (admin only)
router.patch("/zones/:zoneId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const zoneId = req.params.zoneId as string;
  const updates: Partial<typeof roomZonesTable.$inferInsert> = {};
  if (typeof req.body?.name === "string" && req.body.name.trim()) updates.name = req.body.name.trim();
  if (typeof req.body?.sortOrder === "number") updates.sortOrder = req.body.sortOrder;
  if (typeof req.body?.color === "string") updates.color = req.body.color || null;
  if (req.body?.color === null) updates.color = null;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Sin cambios" }); return; }

  const [zone] = await db
    .update(roomZonesTable)
    .set(updates)
    .where(eq(roomZonesTable.id, zoneId))
    .returning();

  if (!zone) { res.status(404).json({ error: "Sala no encontrada" }); return; }
  res.json(zone);
});

// DELETE /zones/:zoneId — soft-delete zone (admin only)
router.delete("/zones/:zoneId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const zoneId = req.params.zoneId as string;

  const [zone] = await db
    .update(roomZonesTable)
    .set({ active: false })
    .where(eq(roomZonesTable.id, zoneId))
    .returning();

  if (!zone) { res.status(404).json({ error: "Sala no encontrada" }); return; }
  res.status(204).send();
});

export default router;
