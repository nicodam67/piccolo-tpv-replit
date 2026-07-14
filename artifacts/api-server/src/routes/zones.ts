import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { roomZonesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/zones", requireAuth, async (_req, res): Promise<void> => {
  const zones = await db
    .select({
      id: roomZonesTable.id,
      name: roomZonesTable.name,
      type: roomZonesTable.type,
    })
    .from(roomZonesTable)
    .where(eq(roomZonesTable.active, true))
    .orderBy(asc(roomZonesTable.sortOrder), asc(roomZonesTable.name));

  res.json(zones);
});

export default router;
