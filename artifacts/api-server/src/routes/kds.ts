import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  kitchenTasksTable,
  ordersTable,
  restaurantTablesTable,
  employeesTable,
  waiterNotificationsTable,
  auditLogTable,
  kdsStationsTable,
} from "@workspace/db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getIO } from "../lib/socket";

const router: IRouter = Router();

// ─── Zones & state machines ───────────────────────────────────────────────────

const VALID_ZONES = ["cocina", "pizza", "ensalada", "barra", "pase", "sin_partida"];

// Active statuses shown per zone
const ZONE_STATUSES = ["new", "preparing", "in_oven", "ready"];
const PASE_STATUSES = ["new", "preparing", "in_oven", "ready"];

// Per-zone allowed transitions: { fromStatus → allowedToStatuses[] }
// The resend endpoint resets to "new" regardless of zone.
const ZONE_TRANSITIONS: Record<string, Record<string, string[]>> = {
  cocina: {
    new:       ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready:     ["collected"],
    collected: [],
    cancelled: [],
  },
  pizza: {
    new:       ["preparing", "cancelled"],
    preparing: ["in_oven", "ready", "cancelled"],
    in_oven:   ["ready", "preparing", "cancelled"],
    ready:     ["collected"],
    collected: [],
    cancelled: [],
  },
  ensalada: {
    new:       ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready:     ["collected"],
    collected: [],
    cancelled: [],
  },
  barra: {
    new:       ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready:     ["collected"],
    collected: [],
    cancelled: [],
  },
  pase: {
    new:       [],
    preparing: [],
    in_oven:   [],
    ready:     ["collected", "served"],
    collected: [],
    served:    [],
    cancelled: [],
  },
  sin_partida: {
    new:       ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready:     ["collected"],
    collected: [],
    cancelled: [],
  },
};

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
  tableName: restaurantTablesTable.name,
  employeeName: employeesTable.name,
  employeeId: ordersTable.employeeId,
  orderType: ordersTable.orderType,
  clientName: ordersTable.clientName,
};

// ── GET /kds/history ──────────────────────────────────────────────────────────
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

  const filtered = tasks.filter(t => new Date(t.updatedAt) >= cutoff);
  res.json(filtered);
});

// ── GET /kds/:zone ─────────────────────────────────────────────────────────────
router.get("/kds/:zone", requireAuth, async (req, res): Promise<void> => {
  const zone = req.params.zone as string;

  if (!VALID_ZONES.includes(zone)) {
    res.status(400).json({ error: "Zona no válida" });
    return;
  }

  const baseQuery = db
    .select(TASK_FIELDS)
    .from(kitchenTasksTable)
    .innerJoin(ordersTable, eq(kitchenTasksTable.orderId, ordersTable.id))
    .leftJoin(restaurantTablesTable, eq(ordersTable.tableId, restaurantTablesTable.id))
    .leftJoin(employeesTable, eq(ordersTable.employeeId, employeesTable.id));

  let rawTasks;

  if (zone === "pase") {
    // Pase aggregator: find orders with at least one ready/in_oven task,
    // then return ALL active tasks for those orders so the pase has full visibility.
    const readyOrders = await db
      .selectDistinct({ orderId: kitchenTasksTable.orderId })
      .from(kitchenTasksTable)
      .where(inArray(kitchenTasksTable.status, ["ready", "in_oven"]));

    if (readyOrders.length === 0) {
      res.json([]);
      return;
    }

    const orderIds = readyOrders.map(r => r.orderId);
    rawTasks = await baseQuery
      .where(
        and(
          inArray(kitchenTasksTable.orderId, orderIds),
          inArray(kitchenTasksTable.status, PASE_STATUSES),
        ),
      )
      .orderBy(kitchenTasksTable.createdAt);
  } else {
    rawTasks = await baseQuery
      .where(
        and(
          eq(kitchenTasksTable.prepZone, zone),
          inArray(kitchenTasksTable.status, ZONE_STATUSES),
        ),
      )
      .orderBy(kitchenTasksTable.createdAt);
  }

  const tasks = rawTasks.filter(t =>
    zone === "pase"
      ? PASE_STATUSES.includes(t.status)
      : ZONE_STATUSES.includes(t.status)
  );

  res.json(tasks);
});

// ── PATCH /kitchen-tasks/:taskId/status ───────────────────────────────────────
router.patch("/kitchen-tasks/:taskId/status", requireAuth, async (req, res): Promise<void> => {
  const taskId = req.params.taskId as string;
  const { status } = req.body as { status: string };

  const allValidStatuses = ["new", "preparing", "in_oven", "ready", "collected", "served", "cancelled"];
  if (!allValidStatuses.includes(status)) {
    res.status(400).json({ error: "Estado inválido" });
    return;
  }

  // Fetch current task to validate zone-specific transition
  const [existing] = await db
    .select({ id: kitchenTasksTable.id, status: kitchenTasksTable.status, prepZone: kitchenTasksTable.prepZone, orderId: kitchenTasksTable.orderId })
    .from(kitchenTasksTable)
    .where(eq(kitchenTasksTable.id, taskId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Tarea no encontrada" });
    return;
  }

  // Validate transition against zone machine
  const zone = existing.prepZone;
  const transitions = ZONE_TRANSITIONS[zone] ?? ZONE_TRANSITIONS.sin_partida;
  const allowed = transitions[existing.status] ?? [];

  if (!allowed.includes(status)) {
    res.status(422).json({
      error: "Transición de estado no permitida",
      from: existing.status,
      to: status,
      zone,
      allowed,
    });
    return;
  }

  const now = new Date();
  const updateData: Record<string, unknown> = { status, updatedAt: now };
  if (status === "ready")     updateData.readyAt     = now;
  if (status === "collected") updateData.collectedAt = now;
  if (status === "served")    updateData.servedAt    = now;
  if (status === "cancelled") updateData.cancelledAt = now;

  const [task] = await db
    .update(kitchenTasksTable)
    .set(updateData)
    .where(eq(kitchenTasksTable.id, taskId))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Tarea no encontrada" });
    return;
  }

  try { getIO().emit("kds:refresh"); } catch { /* socket not initialised */ }

  // Notify waiter when all tasks for an order are ready
  if (status === "ready") {
    const allTasks = await db
      .select()
      .from(kitchenTasksTable)
      .where(eq(kitchenTasksTable.orderId, task.orderId));

    const allReady = allTasks.every(t => ["ready", "collected", "served"].includes(t.status));

    if (allReady) {
      await db.update(ordersTable).set({ status: "ready" }).where(eq(ordersTable.id, task.orderId));

      const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, task.orderId));

      if (order?.tableId && order.employeeId) {
        const [tableRow] = await db
          .select({ name: restaurantTablesTable.name })
          .from(restaurantTablesTable)
          .where(eq(restaurantTablesTable.id, order.tableId));

        const tableName = tableRow?.name ?? "Mesa";

        await db.insert(waiterNotificationsTable).values({
          employeeId: order.employeeId,
          orderId: order.id,
          type: "order_ready",
          title: `${tableName} lista para recoger`,
          message: `El pedido de ${tableName} está listo en el pase.`,
        });

        try {
          const io = getIO();
          const payload = { orderId: order.id, tableId: order.tableId, tableName, employeeId: order.employeeId };
          io.emit("waiter:order-ready", payload);
          io.emit(`waiter:${order.employeeId}:notification`, {
            type: "order_ready",
            title: `${tableName} lista para recoger`,
            message: `El pedido de ${tableName} está listo en el pase.`,
            ...payload,
          });
        } catch { /* socket not initialised */ }
      }
    }
  }

  res.json(task);
});

// ── POST /kitchen-tasks/:taskId/resend ────────────────────────────────────────
router.post("/kitchen-tasks/:taskId/resend", requireAuth, async (req, res): Promise<void> => {
  const taskId = req.params.taskId as string;

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
    .set({ status: "new", updatedAt: now, createdAt: now, readyAt: null, collectedAt: null, servedAt: null, cancelledAt: null })
    .where(eq(kitchenTasksTable.id, taskId))
    .returning();

  await db.insert(auditLogTable).values({
    orderId:      existing.orderId,
    employeeId:   req.user?.id ?? null,
    employeeName: req.user?.name ?? "",
    action:       "resend_kds",
    details:      `Reenviado a cocina: ${existing.productName}`,
  });

  try { getIO().emit("kds:refresh", { employeeName: req.user?.name ?? null }); } catch { /* ignore */ }

  res.json(updated);
});

// ═══ KDS STATIONS CRUD ═══════════════════════════════════════════════════════

// ── GET /admin/kds-stations ───────────────────────────────────────────────────
router.get("/admin/kds-stations", requireAuth, requireRole("manager", "admin"), async (_req, res): Promise<void> => {
  const stations = await db.select().from(kdsStationsTable).orderBy(kdsStationsTable.name);
  res.json(stations);
});

// ── POST /admin/kds-stations ──────────────────────────────────────────────────
router.post("/admin/kds-stations", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { name, zoneType, ip, displayUrl, notes } = req.body as Record<string, string>;
  if (!name?.trim()) { res.status(400).json({ error: "El nombre es obligatorio." }); return; }

  const [station] = await db.insert(kdsStationsTable).values({
    name: name.trim(),
    zoneType: zoneType ?? "cocina",
    ip: ip ?? "",
    displayUrl: displayUrl ?? null,
    notes: notes ?? null,
  }).returning();

  res.status(201).json(station);
});

// ── PATCH /admin/kds-stations/:id ─────────────────────────────────────────────
router.patch("/admin/kds-stations/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { name, zoneType, ip, displayUrl, notes, active } = req.body as Record<string, unknown>;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined)       patch.name       = String(name).trim();
  if (zoneType !== undefined)   patch.zoneType   = zoneType;
  if (ip !== undefined)         patch.ip         = ip;
  if (displayUrl !== undefined) patch.displayUrl = displayUrl || null;
  if (notes !== undefined)      patch.notes      = notes || null;
  if (active !== undefined)     patch.active     = Boolean(active);

  const [station] = await db.update(kdsStationsTable)
    .set(patch as any)
    .where(eq(kdsStationsTable.id, id))
    .returning();

  if (!station) { res.status(404).json({ error: "Estación no encontrada." }); return; }
  res.json(station);
});

// ── DELETE /admin/kds-stations/:id ────────────────────────────────────────────
router.delete("/admin/kds-stations/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [station] = await db.update(kdsStationsTable)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(kdsStationsTable.id, id))
    .returning();

  if (!station) { res.status(404).json({ error: "Estación no encontrada." }); return; }
  res.json({ ok: true });
});

// ── POST /admin/kds-stations/:id/ping ─────────────────────────────────────────
router.post("/admin/kds-stations/:id/ping", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;

  const [station] = await db.select().from(kdsStationsTable).where(eq(kdsStationsTable.id, id));
  if (!station) { res.status(404).json({ error: "Estación no encontrada." }); return; }

  // Simple HTTP probe to the display URL or IP
  let reachable = false;
  let latencyMs: number | null = null;
  const target = station.displayUrl || (station.ip ? `http://${station.ip}` : null);

  if (target) {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const r = await fetch(target, { method: "HEAD", signal: controller.signal }).catch(() => null);
      clearTimeout(timeout);
      latencyMs = Date.now() - start;
      reachable = r !== null;
    } catch { /* unreachable */ }
  }

  await db.update(kdsStationsTable)
    .set({ lastPingAt: new Date(), updatedAt: new Date() })
    .where(eq(kdsStationsTable.id, id));

  res.json({ ok: true, reachable, latencyMs, target });
});

// ── GET /admin/kds-zones/transitions — expose state machine for docs/debug ────
router.get("/admin/kds-zones/transitions", requireAuth, requireRole("manager", "admin"), (_req, res): void => {
  res.json(ZONE_TRANSITIONS);
});

export default router;
