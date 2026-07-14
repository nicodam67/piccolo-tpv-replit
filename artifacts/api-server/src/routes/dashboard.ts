import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { restaurantTablesTable, roomZonesTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (_req, res): Promise<void> => {
  const [tableStats] = await db
    .select({
      totalTables: count(restaurantTablesTable.id),
      occupiedTables: sql<number>`count(case when ${restaurantTablesTable.status} = 'occupied' then 1 end)`,
      freeTables: sql<number>`count(case when ${restaurantTablesTable.status} = 'free' then 1 end)`,
    })
    .from(restaurantTablesTable)
    .where(eq(restaurantTablesTable.active, true));

  const [zoneStats] = await db
    .select({ totalZones: count(roomZonesTable.id) })
    .from(roomZonesTable)
    .where(eq(roomZonesTable.active, true));

  res.json({
    totalTables: Number(tableStats?.totalTables ?? 0),
    occupiedTables: Number(tableStats?.occupiedTables ?? 0),
    freeTables: Number(tableStats?.freeTables ?? 0),
    totalZones: Number(zoneStats?.totalZones ?? 0),
  });
});

export default router;
