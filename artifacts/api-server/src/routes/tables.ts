import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { restaurantTablesTable, roomZonesTable, ordersTable, tableEventsTable, alertConfigTable, reservationsTable, auditLogTable } from "@workspace/db";
import { sql, eq, and, asc, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { checkPermission } from "./role-permissions";

const router: IRouter = Router();

type Shape = "square" | "round" | "rect";
const VALID_SHAPES: Shape[] = ["square", "round", "rect"];
const VALID_LAYOUTS = ["normal", "verano", "invierno", "eventos"];

const CANVAS_W = 1600;
const CANVAS_H = 900;

// ── Shape helpers ─────────────────────────────────────────────────────────────

function rowToTable(r: Record<string, unknown>) {
  return {
    id:                 r.id,
    zoneId:             r.zone_id,
    name:               r.name,
    capacity:           r.capacity,
    status:             r.status,
    x:                  r.x,
    y:                  r.y,
    width:              r.width,
    height:             r.height,
    shape:              r.shape,
    rotation:           Number(r.rotation ?? 0),
    layout:             r.layout ?? "normal",
    mergeGroup:         r.merge_group ?? null,
    active:             r.active,
    currentOrderId:     r.current_order_id ?? null,
    openedAt:           r.opened_at ?? null,
    employeeName:       r.employee_name ?? null,
    guestCount:         r.guest_count !== null && r.guest_count !== undefined ? Number(r.guest_count) : null,
    clientName:         r.client_name ?? null,
    currentTotal:       r.current_total !== null && r.current_total !== undefined
                          ? parseFloat(String(r.current_total))
                          : null,
  };
}

function tableShape(t: typeof restaurantTablesTable.$inferSelect) {
  return {
    id:             t.id,
    zoneId:         t.zoneId,
    name:           t.name,
    capacity:       t.capacity,
    status:         t.status,
    x:              t.x,
    y:              t.y,
    width:          t.width,
    height:         t.height,
    shape:          t.shape,
    rotation:       t.rotation,
    layout:         t.layout,
    mergeGroup:     t.mergeGroup ?? null,
    active:         t.active,
    currentOrderId: null,
    openedAt:       null,
    employeeName:   null,
    guestCount:     null,
    clientName:     null,
    currentTotal:   null,
  };
}

/** Insert a table event (history entry). Fire-and-forget — callers do not await. */
async function addTableEvent(params: {
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
  } catch { /* non-critical — never crash the main request */ }
}

// ── GET /zones/:zoneId/tables ──────────────────────────────────────────────────
// ?layout=xxx — admin editor passes explicit layout; waiter gets active layout

router.get("/zones/:zoneId/tables", requireAuth, async (req, res): Promise<void> => {
  const zoneId = req.params.zoneId as string;
  const isAdmin = (req as any).user?.role === "admin";

  let layoutFilter: string | null = null;

  if (typeof req.query.layout === "string" && VALID_LAYOUTS.includes(req.query.layout)) {
    layoutFilter = req.query.layout;
  } else if (!isAdmin) {
    const [zone] = await db
      .select({ activeLayout: roomZonesTable.activeLayout })
      .from(roomZonesTable)
      .where(eq(roomZonesTable.id, zoneId));
    layoutFilter = zone?.activeLayout ?? "normal";
  }

  const layoutClause = layoutFilter
    ? sql` AND t.layout = ${layoutFilter}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      t.id, t.zone_id, t.name, t.capacity, t.status,
      t.x, t.y, t.width, t.height, t.shape, t.merge_group, t.active, t.rotation, t.layout,
      o.id             AS current_order_id,
      o.created_at     AS opened_at,
      o.guest_count    AS guest_count,
      o.client_name    AS client_name,
      e.name           AS employee_name,
      COALESCE(SUM(CAST(oi.unit_price AS numeric) * oi.quantity), 0)::float AS current_total
    FROM restaurant_tables t
    LEFT JOIN orders o        ON o.table_id = t.id AND o.status IN ('open','sent','ready','served','bill_requested')
    LEFT JOIN employees e     ON e.id = o.employee_id
    LEFT JOIN order_items oi  ON oi.order_id = o.id
    WHERE t.zone_id = ${zoneId} AND t.active = true${layoutClause}
    GROUP BY t.id, o.id, e.id
    ORDER BY t.name
  `);

  res.json((rows.rows as Record<string, unknown>[]).map(rowToTable));
});

// ── GET /tables — all active tables across zones (waiter view) ────────────────

router.get("/tables", requireAuth, async (_req, res): Promise<void> => {
  const tables = await db
    .select()
    .from(restaurantTablesTable)
    .innerJoin(roomZonesTable, eq(restaurantTablesTable.zoneId, roomZonesTable.id))
    .where(and(eq(restaurantTablesTable.active, true), eq(roomZonesTable.active, true)))
    .orderBy(asc(roomZonesTable.sortOrder), asc(restaurantTablesTable.name));
  res.json(tables.map(r => tableShape(r.restaurant_tables)));
});

// ── GET /tables/occupation-summary ────────────────────────────────────────────
// Must be registered BEFORE /tables/:tableId routes

router.get("/tables/occupation-summary", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT
      t.status,
      COUNT(*)::int                      AS count,
      COALESCE(SUM(o.guest_count), 0)::int AS guests,
      COALESCE(
        AVG(EXTRACT(EPOCH FROM (NOW() - o.created_at)) / 60)
        FILTER (WHERE o.id IS NOT NULL), 0
      )::float AS avg_open_min
    FROM restaurant_tables t
    LEFT JOIN orders o ON o.table_id = t.id AND o.status IN ('open','sent','ready','served','bill_requested')
    WHERE t.active = true
    GROUP BY t.status
  `);

  const statusMap: Record<string, { count: number; guests: number; avgMin: number }> = {};
  for (const r of rows.rows as any[]) {
    statusMap[r.status as string] = {
      count: Number(r.count),
      guests: Number(r.guests),
      avgMin: Number(r.avg_open_min),
    };
  }

  const freeCount           = (statusMap["free"]?.count ?? 0);
  const reservedCount       = (statusMap["reserved"]?.count ?? 0);
  const pendingCleaningCount= (statusMap["pendiente_limpieza"]?.count ?? 0);
  const blockedCount        = (statusMap["bloqueada"]?.count ?? 0) + (statusMap["out_of_service"]?.count ?? 0);

  // All occupied-like statuses
  const OCCUPIED_KEYS = ["occupied", "comanda_abierta", "prefactura_impresa", "pendiente_cobro",
                         "parcialmente_cobrada", "waiting", "bill_requested"];
  const occupiedCount = OCCUPIED_KEYS.reduce((acc, k) => acc + (statusMap[k]?.count ?? 0), 0);
  const currentGuests = OCCUPIED_KEYS.reduce((acc, k) => acc + (statusMap[k]?.guests ?? 0), 0);
  const avgMinutes    = OCCUPIED_KEYS.reduce((acc, k) => acc + (statusMap[k]?.avgMin ?? 0), 0)
                        / Math.max(OCCUPIED_KEYS.filter(k => (statusMap[k]?.count ?? 0) > 0).length, 1);

  // Count today's upcoming/active reservations
  const ACTIVE_RESERVATION_STATUSES = ["pendiente", "confirmada", "cliente_llegado"];
  const resResult = await db.execute(sql`
    SELECT COUNT(*)::int AS pending FROM reservations
    WHERE fecha = CURRENT_DATE
      AND status = ANY(ARRAY[${sql.join(ACTIVE_RESERVATION_STATUSES.map(s => sql`${s}`), sql`, `)}])
  `);
  const pendingReservations = Number((resResult.rows?.[0] as any)?.pending ?? 0);

  res.json({
    freeCount,
    occupiedCount,
    reservedCount,
    pendingCleaningCount,
    blockedCount,
    currentGuests,
    pendingReservations,
    avgOccupationMinutes: Math.round(avgMinutes),
  });
});

// ── GET /tables/:tableId/history ──────────────────────────────────────────────

router.get("/tables/:tableId/history", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const tableId = req.params.tableId as string;
  const events = await db
    .select()
    .from(tableEventsTable)
    .where(eq(tableEventsTable.tableId, tableId))
    .orderBy(asc(tableEventsTable.createdAt));
  res.json(events);
});

// ── GET /admin/alert-config ───────────────────────────────────────────────────

router.get("/admin/alert-config", requireAuth, requireRole("manager", "admin"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(alertConfigTable).limit(1);
  if (!rows.length) {
    await db.insert(alertConfigTable).values({});
    const [row] = await db.select().from(alertConfigTable).limit(1);
    res.json(row);
  } else {
    res.json(rows[0]);
  }
});

// ── PATCH /admin/alert-config ─────────────────────────────────────────────────

router.patch("/admin/alert-config", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const b = req.body ?? {};
  const updates: Partial<typeof alertConfigTable.$inferInsert> = { updatedAt: new Date() };

  if (Number.isFinite(b.reservaProximaMin) && b.reservaProximaMin >= 1)
    updates.reservaProximaMin = Math.floor(b.reservaProximaMin);
  if (Number.isFinite(b.sinComandaMin) && b.sinComandaMin >= 1)
    updates.sinComandaMin = Math.floor(b.sinComandaMin);
  if (Number.isFinite(b.prefacturaPendienteMin) && b.prefacturaPendienteMin >= 1)
    updates.prefacturaPendienteMin = Math.floor(b.prefacturaPendienteMin);
  if (Number.isFinite(b.mesaSuciaMin) && b.mesaSuciaMin >= 1)
    updates.mesaSuciaMin = Math.floor(b.mesaSuciaMin);

  // Ensure a row exists
  const existing = await db.select({ id: alertConfigTable.id }).from(alertConfigTable).limit(1);
  if (!existing.length) {
    await db.insert(alertConfigTable).values({});
  }

  const [row] = await db.update(alertConfigTable)
    .set(updates)
    .where(eq(alertConfigTable.id, (existing[0] ?? (await db.select().from(alertConfigTable).limit(1))[0]).id))
    .returning();
  res.json(row);
});

// ── POST /zones/:zoneId/tables — create table (admin) ─────────────────────────

router.post("/zones/:zoneId/tables", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const zoneId = req.params.zoneId as string;
  const b = req.body ?? {};
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) { res.status(400).json({ error: "Nombre requerido" }); return; }

  const capacity = Number.isFinite(b.capacity) && b.capacity >= 1 ? Math.floor(b.capacity) : 4;
  const x        = Number.isFinite(b.x) ? Math.floor(b.x) : 40;
  const y        = Number.isFinite(b.y) ? Math.floor(b.y) : 40;
  const width    = Number.isFinite(b.width)  && b.width  >= 20 ? Math.floor(b.width)  : 80;
  const height   = Number.isFinite(b.height) && b.height >= 20 ? Math.floor(b.height) : 80;
  const shape: Shape = VALID_SHAPES.includes(b.shape) ? b.shape : "square";
  const rotation = Number.isFinite(b.rotation) ? Math.round(b.rotation) % 360 : 0;
  const layout   = VALID_LAYOUTS.includes(b.layout) ? b.layout : "normal";

  const [table] = await db
    .insert(restaurantTablesTable)
    .values({ zoneId, name, capacity, x, y, width, height, shape, rotation, layout })
    .returning();

  res.status(201).json(tableShape(table));
});

// ── POST /tables/:tableId/duplicate — clone table (admin) ─────────────────────

router.post("/tables/:tableId/duplicate", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const tableId = req.params.tableId as string;

  const [original] = await db
    .select()
    .from(restaurantTablesTable)
    .where(and(eq(restaurantTablesTable.id, tableId), eq(restaurantTablesTable.active, true)));

  if (!original) { res.status(404).json({ error: "Mesa no encontrada" }); return; }

  const newX = Math.min(original.x + 40, CANVAS_W - original.width);
  const newY = Math.min(original.y + 40, CANVAS_H - original.height);

  const [copy] = await db
    .insert(restaurantTablesTable)
    .values({
      zoneId:     original.zoneId,
      name:       original.name + " (copia)",
      capacity:   original.capacity,
      status:     "free",
      x:          newX,
      y:          newY,
      width:      original.width,
      height:     original.height,
      shape:      original.shape,
      rotation:   original.rotation,
      layout:     original.layout,
      mergeGroup: null,
      active:     true,
    })
    .returning();

  res.status(201).json(tableShape(copy));
});

// ── PATCH /tables/:tableId — update layout/props (admin) ──────────────────────

router.patch("/tables/:tableId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const tableId = req.params.tableId as string;
  const b = req.body ?? {};
  const updates: Record<string, unknown> = {};

  if (typeof b.name === "string" && b.name.trim())           updates.name     = b.name.trim();
  if (Number.isFinite(b.capacity) && b.capacity >= 1)         updates.capacity = Math.floor(b.capacity);
  if (Number.isFinite(b.x))                                   updates.x        = Math.floor(b.x);
  if (Number.isFinite(b.y))                                   updates.y        = Math.floor(b.y);
  if (Number.isFinite(b.width)  && b.width  >= 20)            updates.width    = Math.floor(b.width);
  if (Number.isFinite(b.height) && b.height >= 20)            updates.height   = Math.floor(b.height);
  if (VALID_SHAPES.includes(b.shape))                          updates.shape    = b.shape;
  if (Number.isFinite(b.rotation))                             updates.rotation = Math.round(b.rotation) % 360;
  if (b.status !== undefined) {
    res.status(400).json({ error: "El estado de mesa solo puede cambiarse mediante acciones operativas" });
    return;
  }
  if (VALID_LAYOUTS.includes(b.layout))                        updates.layout   = b.layout;
  if ("mergeGroup" in b)                                       updates.mergeGroup = b.mergeGroup ?? null;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Sin cambios" }); return; }

  const [table] = await db
    .update(restaurantTablesTable)
    .set(updates as Partial<typeof restaurantTablesTable.$inferInsert>)
    .where(and(eq(restaurantTablesTable.id, tableId), eq(restaurantTablesTable.active, true)))
    .returning();

  if (!table) { res.status(404).json({ error: "Mesa no encontrada" }); return; }
  res.json(tableShape(table));
});

// ── DELETE /tables/:tableId — soft-delete (admin) ─────────────────────────────

router.delete("/tables/:tableId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const tableId = req.params.tableId as string;

  const result = await db.transaction(async (tx) => {
    const [lockedTable] = await tx.select({ id: restaurantTablesTable.id })
      .from(restaurantTablesTable)
      .where(and(eq(restaurantTablesTable.id, tableId), eq(restaurantTablesTable.active, true)))
      .for("update");
    if (!lockedTable) return { status: 404 as const };
    const [openOrder] = await tx.select({ id: ordersTable.id }).from(ordersTable)
      .where(and(
        eq(ordersTable.tableId, tableId),
        inArray(ordersTable.status, ["open", "sent", "ready", "served", "bill_requested"]),
      )).limit(1);
    if (openOrder) return { status: 409 as const };
    const [table] = await tx.update(restaurantTablesTable)
      .set({ active: false })
      .where(and(eq(restaurantTablesTable.id, tableId), eq(restaurantTablesTable.active, true)))
      .returning();
    return { status: 204 as const, table };
  });

  if (result.status === 409) { res.status(409).json({ error: "La mesa tiene una comanda abierta" }); return; }
  if (result.status === 404 || !result.table) { res.status(404).json({ error: "Mesa no encontrada" }); return; }
  res.status(204).send();
});

// ── POST /tables/:tableId/open — open free or reserved table ──────────────────

router.post("/tables/:tableId/open", requireAuth, async (req, res): Promise<void> => {
  const tableId    = req.params.tableId as string;
  const user       = (req as any).user as { id?: string; name?: string } | undefined;
  const employeeId = user?.id as string | undefined;

  const rawGuests  = req.body?.guestCount;
  const guestCount = Number.isFinite(Number(rawGuests)) && Number(rawGuests) >= 1
    ? Math.floor(Number(rawGuests))
    : 1;
  const clientName       = typeof req.body?.clientName === "string" ? req.body.clientName.trim() : "";
  const notes            = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
  const terminalName     = typeof req.body?.terminalName === "string" ? req.body.terminalName.trim() : "";
  // Allow caller to override employeeId (useful for manager opening on behalf of waiter)
  const effectiveEmpId   = typeof req.body?.employeeId === "string" && req.body.employeeId
    ? req.body.employeeId
    : (employeeId ?? null);

  const result = await db.transaction(async (tx) => {
    const [table] = await tx
      .update(restaurantTablesTable)
      .set({ status: "occupied" })
      .where(and(
        eq(restaurantTablesTable.id, tableId),
        eq(restaurantTablesTable.active, true),
        sql`status IN ('free', 'reserved')`,
      ))
      .returning();
    if (!table) return null;

    const [order] = await tx
      .insert(ordersTable)
      .values({
        tableId:          table.id,
        employeeId:       effectiveEmpId,
        status:           "open",
        guestCount,
        notes,
        clientName,
        openedByTerminal: terminalName,
      })
      .returning();
    return { table: tableShape(table), order: { ...order, items: [] } };
  });

  if (!result) { res.status(409).json({ error: "La mesa no está disponible" }); return; }

  // Record history event (fire-and-forget)
  void addTableEvent({
    tableId,
    orderId:      result.order.id,
    employeeId:   effectiveEmpId,
    employeeName: user?.name ?? "",
    action:       "open_table",
    details:      `${guestCount} comensales${clientName ? ` · Cliente: ${clientName}` : ""}`,
    metadata:     { guestCount, clientName, terminalName },
  });

  res.json(result);
});

// ── POST /tables/:tableId/close — transition to pending-cleaning ───────────────

router.post("/tables/:tableId/close", requireAuth, async (req, res): Promise<void> => {
  const tableId  = req.params.tableId as string;
  const user     = (req as any).user as { id?: string; name?: string } | undefined;
  const { force = false, reason = "" } = (req.body ?? {}) as { force?: boolean; reason?: string };

  const [activeOrder] = await db.select({ id: ordersTable.id, status: ordersTable.status })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.tableId, tableId),
      inArray(ordersTable.status, ["open", "sent", "ready", "served", "bill_requested"]),
    ))
    .limit(1);

  if (activeOrder) {
    if (!force) {
      res.status(409).json({ error: "La mesa tiene un pedido pendiente de cobro" });
      return;
    }
    const allowed = await checkPermission(req.user?.role ?? "", "config", "force_close_unpaid");
    if (!allowed) {
      res.status(403).json({ error: "Permiso requerido: cierre excepcional sin cobro" });
      return;
    }
    if (reason.trim().length < 3) {
      res.status(422).json({ error: "El motivo del cierre excepcional es obligatorio" });
      return;
    }
    const table = await db.transaction(async (tx) => {
      await tx.update(ordersTable).set({ status: "completed" }).where(eq(ordersTable.id, activeOrder.id));
      const [updated] = await tx.update(restaurantTablesTable)
        .set({ status: "pendiente_limpieza" })
        .where(eq(restaurantTablesTable.id, tableId))
        .returning();
      await tx.insert(auditLogTable).values({
        orderId: activeOrder.id,
        employeeId: req.user?.id ?? null,
        employeeName: req.user?.name ?? "",
        action: "force_close_unpaid",
        details: reason.trim(),
      });
      return updated;
    });
    void addTableEvent({
      tableId,
      orderId: activeOrder.id,
      employeeId: user?.id,
      employeeName: user?.name ?? "",
      action: "force_close_unpaid",
      details: reason.trim(),
    });
    res.json(tableShape(table));
    return;
  }

  const [table] = await db.update(restaurantTablesTable)
    .set({ status: "pendiente_limpieza" })
    .where(and(
      eq(restaurantTablesTable.id, tableId),
      sql`status NOT IN ('free', 'pendiente_limpieza', 'bloqueada', 'out_of_service', 'reserved')`,
    ))
    .returning();
  if (!table) { res.status(409).json({ error: "La mesa no puede cerrarse desde su estado actual" }); return; }

  void addTableEvent({
    tableId,
    employeeId:   user?.id,
    employeeName: user?.name ?? "",
    action:       "close_table",
    details:      "Mesa cerrada — pendiente de limpieza",
  });

  res.json(tableShape(table));
});

// ── POST /tables/:tableId/clean — mark as free after cleaning ─────────────────

router.post("/tables/:tableId/clean", requireAuth, async (req, res): Promise<void> => {
  const tableId = req.params.tableId as string;
  const user    = (req as any).user as { id?: string; name?: string } | undefined;

  const [table] = await db
    .update(restaurantTablesTable)
    .set({ status: "free" })
    .where(and(eq(restaurantTablesTable.id, tableId), eq(restaurantTablesTable.status, "pendiente_limpieza")))
    .returning();

  if (!table) { res.status(409).json({ error: "La mesa no está pendiente de limpieza" }); return; }

  void addTableEvent({
    tableId,
    employeeId:   user?.id,
    employeeName: user?.name ?? "",
    action:       "clean_table",
    details:      "Mesa limpia — disponible",
  });

  res.json(tableShape(table));
});

// ── POST /tables/:tableId/block — block/unblock table (manager+) ──────────────

router.post("/tables/:tableId/block", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const tableId = req.params.tableId as string;
  const reason  = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const user    = (req as any).user as { id?: string; name?: string } | undefined;

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select({ status: restaurantTablesTable.status })
      .from(restaurantTablesTable)
      .where(and(eq(restaurantTablesTable.id, tableId), eq(restaurantTablesTable.active, true)))
      .for("update");
    if (!existing) return { status: 404 as const };
    const [activeOrder] = await tx.select({ id: ordersTable.id }).from(ordersTable)
      .where(and(
        eq(ordersTable.tableId, tableId),
        inArray(ordersTable.status, ["open", "sent", "ready", "served", "bill_requested"]),
      )).limit(1);
    if (activeOrder) return { status: 409 as const };
    const newStatus = existing.status === "bloqueada" ? "free" : "bloqueada";
    const [table] = await tx.update(restaurantTablesTable)
      .set({ status: newStatus })
      .where(eq(restaurantTablesTable.id, tableId))
      .returning();
    return { status: 200 as const, table, newStatus };
  });
  if (result.status === 404) { res.status(404).json({ error: "Mesa no encontrada" }); return; }
  if (result.status === 409) {
    res.status(409).json({ error: "No se puede bloquear ni liberar una mesa con pedido pendiente" });
    return;
  }
  const { table, newStatus } = result;

  void addTableEvent({
    tableId,
    employeeId:   user?.id,
    employeeName: user?.name ?? "",
    action:       newStatus === "bloqueada" ? "block_table" : "unblock_table",
    details:      reason || (newStatus === "bloqueada" ? "Mesa bloqueada" : "Mesa desbloqueada"),
  });

  res.json(tableShape(table));
});

export default router;
