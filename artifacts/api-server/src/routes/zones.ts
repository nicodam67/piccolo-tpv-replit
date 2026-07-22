import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { roomZonesTable, restaurantTablesTable, ordersTable } from "@workspace/db";
import { sql, eq, asc, max, and, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { emitToFunction } from "../lib/socket-events";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const VALID_LAYOUTS = ["normal", "verano", "invierno", "eventos"] as const;

// ── GET /zones ─────────────────────────────────────────────────────────────────
// ?all=true (admin only) returns inactive zones too

router.get("/zones", requireAuth, async (req, res): Promise<void> => {
  const showAll = (req as any).user?.role === "admin" && req.query.all === "true";

  const query = db
    .select({
      id:           roomZonesTable.id,
      name:         roomZonesTable.name,
      type:         roomZonesTable.type,
      sortOrder:    roomZonesTable.sortOrder,
      color:        roomZonesTable.color,
      icon:         roomZonesTable.icon,
      active:       roomZonesTable.active,
      activeLayout: roomZonesTable.activeLayout,
    })
    .from(roomZonesTable)
    .orderBy(asc(roomZonesTable.sortOrder), asc(roomZonesTable.name));

  const zones = showAll
    ? await query
    : await query.where(eq(roomZonesTable.active, true));

  // Re-normalise sortOrder values when a partial reorder left ties.
  // A partial reorder (first PATCH succeeds, second never arrives) can produce
  // two zones sharing the same sortOrder.  We detect this, fix the response
  // payload immediately, and fire a background UPDATE to persist the corrected
  // values so ties don't accumulate in the DB over time.
  const hasTies =
    zones.length > 0 &&
    new Set(zones.map(z => z.sortOrder)).size !== zones.length;

  if (!hasTies) {
    res.json(zones);
    return;
  }

  const normalised = zones.map((z, i) => ({ ...z, sortOrder: i + 1 }));

  // Respond immediately with the corrected order.
  res.json(normalised);

  // Fire-and-forget: persist the new sortOrder values to the DB so the tie
  // is healed at rest and future GETs don't have to renormalise again.
  //
  // Each UPDATE is guarded by WHERE sort_order = <original value> so that if a
  // concurrent PATCH reorder landed between this GET's read and our background
  // write, the stale heal cannot clobber the newer committed value.  Any row
  // updated concurrently will simply not match the WHERE and will be skipped —
  // the next GET will re-detect the remaining tie and try again.
  const changed = normalised
    .map((z, i) => ({ zone: z, originalSortOrder: zones[i]!.sortOrder }))
    .filter(({ zone, originalSortOrder }) => zone.sortOrder !== originalSortOrder);

  Promise.all(
    changed.map(({ zone, originalSortOrder }) =>
      db.update(roomZonesTable)
        .set({ sortOrder: zone.sortOrder })
        .where(and(eq(roomZonesTable.id, zone.id), eq(roomZonesTable.sortOrder, originalSortOrder)))
    )
  ).catch(err => {
    logger.error({ err }, "sortOrder heal-write failed — ties may persist in DB");
  });
});

// ── POST /zones — create zone (admin) ─────────────────────────────────────────

router.post("/zones", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const type = typeof req.body?.type === "string" ? req.body.type.trim() : "dining";
  if (!name) { res.status(400).json({ error: "Nombre requerido" }); return; }

  const color = typeof req.body?.color === "string" ? req.body.color : null;
  const icon  = typeof req.body?.icon  === "string" ? req.body.icon  : null;

  // Advisory lock 1001 serialises all zone-creation writes so two concurrent
  // POSTs cannot both read the same MAX(sort_order) and produce a duplicate.
  const [zone] = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1001)`);

    const [maxRow] = await tx
      .select({ v: max(roomZonesTable.sortOrder) })
      .from(roomZonesTable)
      .where(eq(roomZonesTable.active, true));
    const nextSort = (maxRow?.v ?? 0) + 1;

    return tx
      .insert(roomZonesTable)
      .values({ name, type, sortOrder: nextSort, color, icon })
      .returning();
  });

  emitToFunction("floor", "zones:refresh");
  res.status(201).json(zone);
});

// ── POST /zones/:zoneId/duplicate — clone zone + tables (admin) ───────────────

router.post("/zones/:zoneId/duplicate", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const zoneId = req.params.zoneId as string;

  const [original] = await db
    .select()
    .from(roomZonesTable)
    .where(eq(roomZonesTable.id, zoneId));

  if (!original) { res.status(404).json({ error: "Sala no encontrada" }); return; }

  // Same advisory lock as POST /zones so a concurrent create + duplicate cannot
  // both read the same MAX(sort_order) and produce a duplicate sort position.
  const [newZone] = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1001)`);

    const [maxRow] = await tx
      .select({ v: max(roomZonesTable.sortOrder) })
      .from(roomZonesTable)
      .where(eq(roomZonesTable.active, true));
    const nextSort = (maxRow?.v ?? 0) + 1;

    return tx
      .insert(roomZonesTable)
      .values({ name: original.name + " (copia)", type: original.type, sortOrder: nextSort, color: original.color, icon: original.icon })
      .returning();
  });

  // Copy all active tables from original zone
  const tables = await db
    .select()
    .from(restaurantTablesTable)
    .where(and(eq(restaurantTablesTable.zoneId, zoneId), eq(restaurantTablesTable.active, true)));

  if (tables.length > 0) {
    await db.insert(restaurantTablesTable).values(
      tables.map(t => ({
        zoneId:     newZone.id,
        name:       t.name,
        capacity:   t.capacity,
        status:     "free" as const,
        x:          t.x,
        y:          t.y,
        width:      t.width,
        height:     t.height,
        shape:      t.shape,
        rotation:   t.rotation,
        layout:     t.layout,
        mergeGroup: null,
        active:     true,
      }))
    );
  }

  emitToFunction("floor", "zones:refresh");
  res.status(201).json(newZone);
});

// ── PATCH /zones/:zoneId — rename / reorder / color / activeLayout (admin) ────

router.patch("/zones/:zoneId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const zoneId = req.params.zoneId as string;
  const updates: Partial<typeof roomZonesTable.$inferInsert> = {};
  if (typeof req.body?.name === "string" && req.body.name.trim()) updates.name         = req.body.name.trim();
  if (typeof req.body?.sortOrder === "number")                     updates.sortOrder    = req.body.sortOrder;
  if ("color" in (req.body ?? {}))                                  updates.color       = req.body.color ?? null;
  if ("icon"  in (req.body ?? {}))                                  updates.icon        = req.body.icon  ?? null;
  if (typeof req.body?.active === "boolean")                        updates.active      = req.body.active;
  if (typeof req.body?.activeLayout === "string" && VALID_LAYOUTS.includes(req.body.activeLayout as any))
                                                                    updates.activeLayout = req.body.activeLayout;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Sin cambios" }); return; }

  // ── Optimistic concurrency control for sortOrder reordering ──────────────────
  // When the client sends expectedSortOrder together with a new sortOrder, we
  // only apply the update if the row's current sortOrder still matches.
  // A mismatch means another admin already reordered since the client last
  // fetched — return 409 so the client can re-fetch and retry.
  const expectedSortOrder: number | undefined =
    typeof req.body?.expectedSortOrder === "number" ? req.body.expectedSortOrder : undefined;

  const useConditionalUpdate =
    typeof updates.sortOrder === "number" && expectedSortOrder !== undefined;

  const whereClause = useConditionalUpdate
    ? and(eq(roomZonesTable.id, zoneId), eq(roomZonesTable.sortOrder, expectedSortOrder!))
    : eq(roomZonesTable.id, zoneId);

  const [zone] = await db
    .update(roomZonesTable)
    .set(updates)
    .where(whereClause)
    .returning();

  if (!zone) {
    if (useConditionalUpdate) {
      // Check whether the zone exists at all (to distinguish 404 from 409)
      const [existing] = await db
        .select({ id: roomZonesTable.id })
        .from(roomZonesTable)
        .where(eq(roomZonesTable.id, zoneId));

      if (!existing) {
        res.status(404).json({ error: "Sala no encontrada" });
      } else {
        res.status(409).json({ error: "Conflicto de orden: otro usuario reordenó las salas. Recargando..." });
      }
      return;
    }
    res.status(404).json({ error: "Sala no encontrada" });
    return;
  }

  emitToFunction("floor", "zones:refresh");
  res.json(zone);
});

// ── DELETE /zones/:zoneId — soft-delete zone (admin) ──────────────────────────

router.delete("/zones/:zoneId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const zoneId = req.params.zoneId as string;

  const tables = await db
    .select({ id: restaurantTablesTable.id })
    .from(restaurantTablesTable)
    .where(and(eq(restaurantTablesTable.zoneId, zoneId), eq(restaurantTablesTable.active, true)));

  if (tables.length > 0) {
    const tableIds = tables.map(t => t.id);
    const [openOrder] = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(and(inArray(ordersTable.tableId, tableIds), eq(ordersTable.status, "open")))
      .limit(1);

    if (openOrder) {
      res.status(409).json({ error: "No se puede eliminar una sala con comandas abiertas" });
      return;
    }
  }

  const [zone] = await db
    .update(roomZonesTable)
    .set({ active: false })
    .where(eq(roomZonesTable.id, zoneId))
    .returning();

  if (!zone) { res.status(404).json({ error: "Sala no encontrada" }); return; }
  res.status(204).send();
});

export default router;
