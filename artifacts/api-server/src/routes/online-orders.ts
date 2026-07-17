/**
 * Online Orders API — Fase 1 del módulo de pedidos online.
 *
 * Rutas públicas (sin auth):
 *   GET  /public/online-config          — Configuración del servicio
 *   POST /public/check-zone             — Valida si una dirección está en zona de reparto
 *   POST /public/orders/online          — Crea un pedido desde el carrito
 *   GET  /public/order-status/:orderNumber — Estado del pedido para el cliente
 *
 * Rutas de personal (requireAuth):
 *   GET  /api/online-orders             — Bandeja de pedidos online (TPV)
 *   POST /api/online-orders/:id/confirm — Confirmar pedido (encargado)
 *   POST /api/online-orders/:id/reject  — Rechazar pedido (encargado)
 *   PATCH /api/online-orders/:id/status — Cambiar estado
 *   POST /api/online-orders/:id/payment-simulate — Simular pago online
 *   POST /api/online-orders/:id/assign-courier — Asignar repartidor
 *   POST /api/online-orders/:id/packaging-check — Marcar empaquetado revisado
 *
 * Config del servicio (admin):
 *   GET   /admin/online-config
 *   PATCH /admin/online-config
 *   GET   /admin/delivery-zones
 *   POST  /admin/delivery-zones
 *   PATCH /admin/delivery-zones/:id
 *   DELETE /admin/delivery-zones/:id
 *   GET   /admin/couriers
 *   POST  /admin/couriers
 *   PATCH /admin/couriers/:id
 *   DELETE /admin/couriers/:id
 *   GET   /api/courier/:courierId/deliveries — Vista del repartidor
 *   GET   /admin/online-reports             — Informes de pedidos online
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  productsTable,
  onlineOrdersConfigTable,
  deliveryZonesTable,
  deliveryAddressesTable,
  couriersTable,
  onlineOrderAuditTable,
  notificationLogTable,
  kitchenTasksTable,
  productFormatsTable,
  orderItemModifiersTable,
  crmClientsTable,
  modifiersTable,
  productModifierGroupsTable,
  modifierGroupsTable,
  deliveryOrderStatusHistoryTable,
} from "@workspace/db";
import { eq, and, inArray, desc, asc, gte, lte, count, avg, sum, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getIO } from "../lib/socket";
import { calcMultiRateBreakdown } from "../lib/tax";
import { issuePoints } from "./crm.js";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a human-readable order number like "ONL-20250716-0042" */
function generateOrderNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `ONL-${date}-${seq}`;
}

/** Record an event in the online order audit log */
async function auditOnlineOrder(
  orderId: string,
  event: string,
  userId?: string | null,
  userName?: string,
  metadata?: object,
) {
  try {
    await db.insert(onlineOrderAuditTable).values({
      orderId,
      event,
      userId: userId ?? null,
      userName: userName ?? "sistema",
      metadata: metadata ?? null,
    });
  } catch { /* audit must not break main operation */ }
}

/** Simulate sending a notification (records in notification_log) */
async function simulateNotification(
  orderId: string | null,
  type: string,
  recipient: string,
  payload: object,
) {
  try {
    await db.insert(notificationLogTable).values({
      orderId,
      type,
      recipient,
      payload,
      simulated: true,
    });
  } catch { /* non-fatal */ }
}

/** Emit a WebSocket event to refresh the online orders inbox */
function emitOnlineOrdersRefresh(extra?: object) {
  try { getIO().emit("online-orders:refresh", extra ?? {}); } catch { /* ignore */ }
}

/** Check if a given time is within the configured service hours */
function isWithinSchedule(
  schedule: Record<string, { open: string; close: string; open2?: string; close2?: string }> | null | undefined,
  at: Date = new Date(),
): boolean {
  if (!schedule) return true; // if no schedule configured, assume always open
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const day = days[at.getDay()];
  const slot = schedule[day];
  if (!slot) return false;

  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const now = at.getHours() * 60 + at.getMinutes();

  const inShift1 = now >= toMin(slot.open) && now < toMin(slot.close);
  const inShift2 = slot.open2 && slot.close2
    ? now >= toMin(slot.open2) && now < toMin(slot.close2)
    : false;

  return inShift1 || inShift2;
}

/** Find the best matching delivery zone for a postal code / city */
function findDeliveryZone(
  zones: typeof deliveryZonesTable.$inferSelect[],
  postalCode: string,
  city: string,
): typeof deliveryZonesTable.$inferSelect | null {
  const normalise = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  for (const zone of zones.filter((z) => z.active)) {
    const v = zone.value as any;
    if (zone.type === "postal_code") {
      const codes: string[] = v.postalCodes ?? [];
      if (codes.some((c) => c.trim() === postalCode.trim())) return zone;
    } else if (zone.type === "city") {
      const cities: string[] = v.cities ?? [];
      if (cities.some((c) => normalise(c) === normalise(city))) return zone;
    }
  }
  return null;
}

// ── PUBLIC: GET /public/online-config ─────────────────────────────────────────

router.get("/public/online-config", async (_req, res): Promise<void> => {
  const [cfg] = await db.select().from(onlineOrdersConfigTable).limit(1);
  if (!cfg) { res.json({ takeawayEnabled: false, deliveryEnabled: false }); return; }

  const zones = await db.select().from(deliveryZonesTable)
    .where(eq(deliveryZonesTable.active, true))
    .orderBy(asc(deliveryZonesTable.sortOrder));

  res.json({
    takeawayEnabled: cfg.takeawayEnabled,
    deliveryEnabled: cfg.deliveryEnabled,
    schedule: cfg.schedule,
    prepTimeMinutes: cfg.prepTimeMinutes,
    minOrder: cfg.minOrder,
    minOrderDelivery: cfg.minOrderDelivery,
    deliveryFee: cfg.deliveryFee,
    freeDeliveryFrom: cfg.freeDeliveryFrom,
    maxAdvanceHours: cfg.maxAdvanceHours,
    maxOrdersPerSlot: cfg.maxOrdersPerSlot,
    paused: cfg.paused,
    pauseReason: cfg.pauseReason,
    // v2 fields
    tipEnabled: cfg.tipEnabled ?? false,
    tipPercentages: Array.isArray(cfg.tipPercentages) ? cfg.tipPercentages : [5, 10, 15, 20],
    tableOrderingEnabled: cfg.tableOrderingEnabled ?? false,
    stripePublishableKey: cfg.stripePublishableKey ?? "",
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      type: z.type,
      value: z.value,
      deliveryFee: z.deliveryFee,
      minOrder: z.minOrder,
      estimatedMinutes: z.estimatedMinutes,
    })),
  });
});

// ── PUBLIC: POST /public/check-zone ───────────────────────────────────────────

router.post("/public/check-zone", async (req, res): Promise<void> => {
  const { postalCode = "", city = "" } = req.body as { postalCode?: string; city?: string };

  const zones = await db.select().from(deliveryZonesTable)
    .where(eq(deliveryZonesTable.active, true));

  const match = findDeliveryZone(zones, postalCode, city);

  if (!match) {
    res.json({ covered: false, reason: "La dirección no está dentro de las zonas de reparto disponibles." });
    return;
  }

  res.json({
    covered: true,
    zone: {
      id: match.id,
      name: match.name,
      deliveryFee: match.deliveryFee,
      minOrder: match.minOrder,
      estimatedMinutes: match.estimatedMinutes,
    },
  });
});

// ── PUBLIC: POST /public/orders/online — LEGACY v1 (410 Gone) ─────────────────
// This endpoint has been superseded by POST /public/orders/online-v2.
// All clients have been migrated. Returning 410 so legacy callers get a clear
// error instead of silently diverging from the v2 feature set.

router.post("/public/orders/online", async (_req, res): Promise<void> => {
  res.status(410).json({
    error: "Este endpoint ha sido reemplazado. Usa POST /api/public/orders/online-v2.",
    migratedTo: "/api/public/orders/online-v2",
  });
});


// ── PUBLIC: GET /public/order-status/:orderNumber ────────────────────────────

router.get("/public/order-status/:orderNumber", async (req, res): Promise<void> => {
  const orderNumber = req.params.orderNumber as string;

  const [order] = await db.select({
    id: ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    status: ordersTable.status,
    deliveryType: ordersTable.deliveryType,
    estimatedReadyAt: ordersTable.estimatedReadyAt,
    scheduledAt: ordersTable.scheduledAt,
    createdAt: ordersTable.createdAt,
  }).from(ordersTable).where((ordersTable as any).orderNumber ? eq((ordersTable as any).orderNumber, orderNumber) : sql`order_number = ${orderNumber}`).limit(1);

  if (!order) { res.status(404).json({ error: "Pedido no encontrado." }); return; }

  res.json({
    orderNumber: order.orderNumber,
    status: order.status,
    deliveryType: order.deliveryType,
    estimatedReadyAt: order.estimatedReadyAt,
    scheduledAt: order.scheduledAt,
    createdAt: order.createdAt,
  });
});

// ── STAFF: GET /api/online-orders ─────────────────────────────────────────────

router.get("/online-orders", requireAuth, async (req, res): Promise<void> => {
  const { status, date } = req.query as { status?: string; date?: string };

  const ONLINE_DELIVERY_TYPES = ["takeaway", "delivery"];

  // Build conditions
  const conditions = [
    inArray(ordersTable.deliveryType as any, ONLINE_DELIVERY_TYPES),
  ];

  if (status && status !== "all") {
    (conditions as any[]).push(eq(ordersTable.status, status));
  }

  if (date) {
    const from = new Date(date);
    from.setHours(0, 0, 0, 0);
    const to = new Date(date);
    to.setHours(23, 59, 59, 999);
    (conditions as any[]).push(gte(ordersTable.createdAt, from));
    (conditions as any[]).push(lte(ordersTable.createdAt, to));
  } else {
    // Default: today + recent
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    (conditions as any[]).push(gte(ordersTable.createdAt, from));
  }

  const orders = await db.select({
    id: ordersTable.id,
    orderNumber: (ordersTable as any).orderNumber,
    status: ordersTable.status,
    channel: (ordersTable as any).channel,
    deliveryType: (ordersTable as any).deliveryType,
    clientName: ordersTable.clientName,
    clientPhone: (ordersTable as any).clientPhone,
    estimatedReadyAt: (ordersTable as any).estimatedReadyAt,
    scheduledAt: (ordersTable as any).scheduledAt,
    deliveryFee: (ordersTable as any).deliveryFee,
    onlinePaymentStatus: (ordersTable as any).onlinePaymentStatus,
    onlinePaymentRef: (ordersTable as any).onlinePaymentRef,
    courierId: (ordersTable as any).courierId,
    rejectionReason: (ordersTable as any).rejectionReason,
    packagingCheckedAt: (ordersTable as any).packagingCheckedAt,
    deliveryAddressId: (ordersTable as any).deliveryAddressId,
    notes: ordersTable.notes,
    createdAt: ordersTable.createdAt,
  }).from(ordersTable)
    .where(and(...conditions as any))
    .orderBy(desc(ordersTable.createdAt))
    .limit(100);

  // Enrich with items and addresses
  const enriched = await Promise.all(orders.map(async (order) => {
    const items = await db.select({
      id: orderItemsTable.id,
      productName: productsTable.name,
      quantity: orderItemsTable.quantity,
      unitPrice: orderItemsTable.unitPrice,
    }).from(orderItemsTable)
      .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
      .where(eq(orderItemsTable.orderId, order.id));

    let address = null;
    if ((order as any).deliveryAddressId) {
      const [addr] = await db.select().from(deliveryAddressesTable)
        .where(eq(deliveryAddressesTable.id, (order as any).deliveryAddressId));
      address = addr ?? null;
    }

    let courier = null;
    if ((order as any).courierId) {
      const [c] = await db.select({ id: couriersTable.id, name: couriersTable.name, phone: couriersTable.phone })
        .from(couriersTable).where(eq(couriersTable.id, (order as any).courierId));
      courier = c ?? null;
    }

    const lineTotals = items.map((it) => ({
      lineTotal: parseFloat(it.unitPrice) * it.quantity,
      taxRate: 10,
    }));
    const { total } = calcMultiRateBreakdown(lineTotals, 0);
    const deliveryFee = parseFloat((order as any).deliveryFee ?? "0");
    const grandTotal = (parseFloat(total) + deliveryFee).toFixed(2);

    return { ...order, items, address, courier, total: grandTotal };
  }));

  res.json(enriched);
});

// ── STAFF: POST /api/online-orders/:id/confirm ────────────────────────────────

router.post("/online-orders/:id/confirm", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { estimatedReadyAt } = req.body as { estimatedReadyAt?: string };

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) { res.status(404).json({ error: "Pedido no encontrado." }); return; }

  const allowedStatuses = ["pending_confirm", "paid", "pending_payment"];
  if (!allowedStatuses.includes(order.status)) {
    res.status(409).json({ error: `No se puede confirmar un pedido en estado "${order.status}".` }); return;
  }

  const now = new Date();
  const readyAt = estimatedReadyAt ? new Date(estimatedReadyAt) : (order as any).estimatedReadyAt ?? now;

  // Update order status
  await db.update(ordersTable).set({
    status: "confirmed",
    estimatedReadyAt: readyAt,
  } as any).where(eq(ordersTable.id, id));

  // Create kitchen tasks for each item
  const items = await db.select({
    id: orderItemsTable.id,
    productId: orderItemsTable.productId,
    productName: productsTable.name,
    quantity: orderItemsTable.quantity,
    notes: orderItemsTable.notes,
    allergyNote: orderItemsTable.allergyNote,
    hasAllergy: orderItemsTable.hasAllergy,
    prepZone: productsTable.prepZone,
  }).from(orderItemsTable)
    .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(eq(orderItemsTable.orderId, id));

  const deliveryType = (order as any).deliveryType ?? "takeaway";
  const label = deliveryType === "delivery" ? "🛵 REPARTO" : "🏪 RECOGIDA";
  const clientName = order.clientName;
  const orderNumber = (order as any).orderNumber ?? id.slice(0, 8);

  for (const item of items) {
    await db.insert(kitchenTasksTable).values({
      orderId: id,
      orderItemId: item.id,
      prepZone: item.prepZone ?? "cocina",
      productName: item.productName,
      quantity: item.quantity,
      status: "new",
      notes: `${label} · ${clientName} · ${orderNumber}${item.notes ? ` | ${item.notes}` : ""}`,
      allergyNote: item.allergyNote ?? "",
      hasAllergy: item.hasAllergy ?? false,
    } as any);

    // Mark order item as sent
    await db.update(orderItemsTable).set({ status: "sent" }).where(eq(orderItemsTable.id, item.id));
  }

  // Update order to sent_to_kitchen
  await db.update(ordersTable).set({ status: "sent_to_kitchen" } as any).where(eq(ordersTable.id, id));

  await auditOnlineOrder(id, "confirmed", req.user?.id, req.user?.name, { readyAt });
  await simulateNotification(id, "order_confirmed", (order as any).clientPhone ?? "", {
    orderNumber,
    estimatedReadyAt: readyAt.toISOString(),
    message: `Tu pedido ${orderNumber} ha sido confirmado. Estará listo aproximadamente a las ${readyAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}.`,
  });

  try { getIO().emit("kds:refresh"); } catch { /* ignore */ }
  emitOnlineOrdersRefresh({ orderId: id });

  res.json({ ok: true, status: "sent_to_kitchen", estimatedReadyAt: readyAt.toISOString() });
});

// ── STAFF: POST /api/online-orders/:id/reject ─────────────────────────────────

router.post("/online-orders/:id/reject", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { reason } = req.body as { reason: string };

  if (!reason?.trim()) { res.status(400).json({ error: "El motivo del rechazo es obligatorio." }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) { res.status(404).json({ error: "Pedido no encontrado." }); return; }

  await db.update(ordersTable).set({
    status: "rejected",
    rejectionReason: reason.trim(),
  } as any).where(eq(ordersTable.id, id));

  const orderNumber = (order as any).orderNumber ?? id.slice(0, 8);
  await auditOnlineOrder(id, "rejected", req.user?.id, req.user?.name, { reason });
  await simulateNotification(id, "order_rejected", (order as any).clientPhone ?? "", {
    orderNumber,
    reason,
    message: `Lo sentimos, tu pedido ${orderNumber} ha sido cancelado. Motivo: ${reason}.`,
  });

  emitOnlineOrdersRefresh({ orderId: id });
  res.json({ ok: true, status: "rejected" });
});

// ── STAFF: PATCH /api/online-orders/:id/status ────────────────────────────────

router.patch("/online-orders/:id/status", requireAuth, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { status, estimatedReadyAt } = req.body as { status: string; estimatedReadyAt?: string };

  const ALLOWED = [
    "pending_confirm", "confirmed", "rejected", "pending_payment", "paid",
    "sent_to_kitchen", "in_preparation", "ready_to_collect", "waiting_courier",
    "in_delivery", "delivered", "cancelled", "not_collected", "incident",
  ];

  if (!ALLOWED.includes(status)) {
    res.status(400).json({ error: "Estado no válido." }); return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) { res.status(404).json({ error: "Pedido no encontrado." }); return; }

  const updates: Record<string, unknown> = { status };
  if (estimatedReadyAt) updates.estimatedReadyAt = new Date(estimatedReadyAt);

  // When delivered, issue CRM points
  if (status === "delivered" && order.clientId) {
    try {
      const items = await db.select({
        unitPrice: orderItemsTable.unitPrice,
        quantity: orderItemsTable.quantity,
      }).from(orderItemsTable).where(eq(orderItemsTable.orderId, id));

      const lineTotals = items.map((it) => ({ lineTotal: parseFloat(it.unitPrice) * it.quantity, taxRate: 10 }));
      const { total } = calcMultiRateBreakdown(lineTotals, 0);

      await issuePoints({
        clientId: order.clientId,
        orderId: id,
        importeTotal: parseFloat(total),
        empleadoId: req.user?.id ?? null,
        empleadoNombre: req.user?.name ?? "sistema",
      });
    } catch { /* non-fatal */ }
  }

  await db.update(ordersTable).set(updates as any).where(eq(ordersTable.id, id));
  await auditOnlineOrder(id, `status_changed:${status}`, req.user?.id, req.user?.name);

  const notifMap: Record<string, string> = {
    ready_to_collect: "order_ready",
    in_delivery: "order_in_delivery",
    delivered: "order_delivered",
    cancelled: "order_cancelled",
  };
  if (notifMap[status]) {
    await simulateNotification(id, notifMap[status], (order as any).clientPhone ?? "", { status });
  }

  emitOnlineOrdersRefresh({ orderId: id });
  res.json({ ok: true, status });
});

// ── STAFF: POST /api/online-orders/:id/payment-simulate ──────────────────────

router.post("/online-orders/:id/payment-simulate", requireAuth, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { approve = true } = req.body as { approve?: boolean };

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) { res.status(404).json({ error: "Pedido no encontrado." }); return; }

  if ((order as any).onlinePaymentStatus === "paid") {
    res.status(409).json({ error: "El pago ya está registrado." }); return;
  }

  const ref = `SIM-${Date.now()}`;

  await db.update(ordersTable).set({
    onlinePaymentStatus: approve ? "paid" : "failed",
    onlinePaymentRef: approve ? ref : null,
    status: approve ? "pending_confirm" : "pending_payment",
  } as any).where(eq(ordersTable.id, id));

  await auditOnlineOrder(id, approve ? "payment_simulated_approved" : "payment_simulated_failed",
    req.user?.id, req.user?.name, { ref });

  emitOnlineOrdersRefresh({ orderId: id });
  res.json({ ok: true, approved: approve, ref: approve ? ref : null });
});

// ── STAFF: POST /api/online-orders/:id/assign-courier ────────────────────────

router.post("/online-orders/:id/assign-courier", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { courierId } = req.body as { courierId: string };

  const [courier] = await db.select().from(couriersTable)
    .where(and(eq(couriersTable.id, courierId), eq(couriersTable.active, true)));

  if (!courier) { res.status(404).json({ error: "Repartidor no encontrado." }); return; }

  await db.update(ordersTable).set({
    courierId,
    status: "waiting_courier",
  } as any).where(eq(ordersTable.id, id));

  await db.update(couriersTable).set({ status: "busy" }).where(eq(couriersTable.id, courierId));

  await auditOnlineOrder(id, "courier_assigned", req.user?.id, req.user?.name, { courierId, courierName: courier.name });
  emitOnlineOrdersRefresh({ orderId: id });

  res.json({ ok: true, courier: { id: courier.id, name: courier.name } });
});

// ── STAFF: POST /api/online-orders/:id/packaging-check ───────────────────────

router.post("/online-orders/:id/packaging-check", requireAuth, async (req, res): Promise<void> => {
  const id = req.params.id as string;

  await db.update(ordersTable).set({
    packagingCheckedBy: req.user?.id ?? null,
    packagingCheckedAt: new Date(),
  } as any).where(eq(ordersTable.id, id));

  await auditOnlineOrder(id, "packaging_checked", req.user?.id, req.user?.name);
  emitOnlineOrdersRefresh({ orderId: id });
  res.json({ ok: true });
});

// ── ADMIN: GET /admin/online-config ──────────────────────────────────────────

router.get("/admin/online-config", requireAuth, requireRole("manager", "admin"), async (_req, res): Promise<void> => {
  const [cfg] = await db.select().from(onlineOrdersConfigTable).limit(1);
  const zones = await db.select().from(deliveryZonesTable).orderBy(asc(deliveryZonesTable.sortOrder));
  const couriers = await db.select().from(couriersTable).where(eq(couriersTable.active, true)).orderBy(asc(couriersTable.name));

  res.json({ config: cfg ?? null, zones, couriers });
});

// ── ADMIN: PATCH /admin/online-config ────────────────────────────────────────

router.patch("/admin/online-config", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const fields = req.body as Partial<typeof onlineOrdersConfigTable.$inferInsert>;

  const [existing] = await db.select().from(onlineOrdersConfigTable).limit(1);

  let result;
  if (!existing) {
    [result] = await db.insert(onlineOrdersConfigTable).values({
      ...fields,
      updatedAt: new Date(),
    } as any).returning();
  } else {
    [result] = await db.update(onlineOrdersConfigTable)
      .set({ ...fields, updatedAt: new Date() } as any)
      .where(eq(onlineOrdersConfigTable.id, existing.id))
      .returning();
  }

  res.json(result);
});

// ── ADMIN: Delivery Zones CRUD ────────────────────────────────────────────────

router.get("/admin/delivery-zones", requireAuth, requireRole("manager", "admin"), async (_req, res): Promise<void> => {
  const zones = await db.select().from(deliveryZonesTable).orderBy(asc(deliveryZonesTable.sortOrder));
  res.json(zones);
});

router.post("/admin/delivery-zones", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { name, type = "postal_code", value = {}, deliveryFee = "0", minOrder = "0", estimatedMinutes = 45, sortOrder = 0 } = req.body as any;
  if (!name?.trim()) { res.status(400).json({ error: "El nombre es obligatorio." }); return; }

  const [zone] = await db.insert(deliveryZonesTable).values({
    name: name.trim(), type, value, deliveryFee, minOrder, estimatedMinutes, sortOrder,
  }).returning();
  res.status(201).json(zone);
});

router.patch("/admin/delivery-zones/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const updates = req.body as Partial<typeof deliveryZonesTable.$inferInsert>;
  const [zone] = await db.update(deliveryZonesTable).set(updates as any).where(eq(deliveryZonesTable.id, id)).returning();
  if (!zone) { res.status(404).json({ error: "Zona no encontrada." }); return; }
  res.json(zone);
});

router.delete("/admin/delivery-zones/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db.update(deliveryZonesTable).set({ active: false }).where(eq(deliveryZonesTable.id, id));
  res.json({ ok: true });
});

// ── ADMIN: Couriers CRUD ──────────────────────────────────────────────────────

router.get("/admin/couriers", requireAuth, requireRole("manager", "admin"), async (_req, res): Promise<void> => {
  const list = await db.select().from(couriersTable).where(eq(couriersTable.active, true)).orderBy(asc(couriersTable.name));
  res.json(list);
});

router.post("/admin/couriers", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { name, phone = "" } = req.body as { name: string; phone?: string };
  if (!name?.trim()) { res.status(400).json({ error: "El nombre es obligatorio." }); return; }
  const [c] = await db.insert(couriersTable).values({ name: name.trim(), phone }).returning();
  res.status(201).json(c);
});

router.patch("/admin/couriers/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const updates = req.body as Partial<typeof couriersTable.$inferInsert>;
  const [c] = await db.update(couriersTable).set(updates as any).where(eq(couriersTable.id, id)).returning();
  if (!c) { res.status(404).json({ error: "Repartidor no encontrado." }); return; }
  res.json(c);
});

router.delete("/admin/couriers/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db.update(couriersTable).set({ active: false }).where(eq(couriersTable.id, id));
  res.json({ ok: true });
});

// ── COURIER: GET /api/courier/:courierId/deliveries ──────────────────────────
// Protected by per-courier token (query param ?token=...).  The token is a
// UUID stored in couriers.token and shown to staff when assigning the courier.

router.get("/courier/:courierId/deliveries", async (req, res): Promise<void> => {
  const courierId = req.params.courierId as string;
  const token = (req.query.token as string | undefined) ?? "";

  // Reject clearly invalid UUIDs before hitting the DB (avoids PostgreSQL cast errors)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!token || !UUID_RE.test(courierId)) {
    res.status(401).json({ error: "Token no válido." });
    return;
  }

  // Validate token against the couriers table
  const [courier] = await db
    .select({ id: couriersTable.id, token: couriersTable.token })
    .from(couriersTable)
    .where(eq(couriersTable.id, courierId));

  if (!courier || !courier.token || courier.token !== token) {
    res.status(401).json({ error: "Token no válido." });
    return;
  }

  const orders = await db.select({
    id: ordersTable.id,
    orderNumber: (ordersTable as any).orderNumber,
    status: ordersTable.status,
    clientName: ordersTable.clientName,
    clientPhone: (ordersTable as any).clientPhone,
    estimatedReadyAt: (ordersTable as any).estimatedReadyAt,
    deliveryAddressId: (ordersTable as any).deliveryAddressId,
    onlinePaymentStatus: (ordersTable as any).onlinePaymentStatus,
    deliveryFee: (ordersTable as any).deliveryFee,
    notes: ordersTable.notes,
    createdAt: ordersTable.createdAt,
  }).from(ordersTable)
    .where(and(
      eq((ordersTable as any).courierId, courierId),
      inArray(ordersTable.status, ["waiting_courier", "in_delivery"]),
    ));

  const enriched = await Promise.all(orders.map(async (o) => {
    let address = null;
    if ((o as any).deliveryAddressId) {
      const [addr] = await db.select().from(deliveryAddressesTable)
        .where(eq(deliveryAddressesTable.id, (o as any).deliveryAddressId));
      address = addr;
    }

    const items = await db.select({
      productName: productsTable.name,
      quantity: orderItemsTable.quantity,
      unitPrice: orderItemsTable.unitPrice,
    }).from(orderItemsTable)
      .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
      .where(eq(orderItemsTable.orderId, o.id));

    const lineTotals = items.map((it) => ({ lineTotal: parseFloat(it.unitPrice) * it.quantity, taxRate: 10 }));
    const { total } = calcMultiRateBreakdown(lineTotals, 0);
    const grandTotal = (parseFloat(total) + parseFloat((o as any).deliveryFee ?? "0")).toFixed(2);

    return { ...o, address, items, total: grandTotal };
  }));

  res.json(enriched);
});

// ── COURIER: GET /courier/:courierId/summary — token-authenticated shift summary ──
// Returns persisted courier counters so the driver app can show accurate shift totals.

router.get("/courier/:courierId/summary", async (req, res): Promise<void> => {
  const courierId = req.params.courierId as string;
  const token = (req.query.token as string | undefined) ?? "";

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!token || !UUID_RE.test(courierId)) {
    res.status(401).json({ error: "Token no válido." });
    return;
  }

  const [courier] = await db
    .select({
      id: couriersTable.id, name: couriersTable.name, token: couriersTable.token,
      status: couriersTable.status,
      earnedCashPending: (couriersTable as any).earnedCashPending,
      earnedCardPending: (couriersTable as any).earnedCardPending,
      totalDeliveries: (couriersTable as any).totalDeliveries,
    })
    .from(couriersTable)
    .where(eq(couriersTable.id, courierId));

  if (!courier || !courier.token || courier.token !== token) {
    res.status(401).json({ error: "Token no válido." });
    return;
  }

  res.json({
    courier: {
      id: courier.id, name: courier.name, status: courier.status,
      earnedCashPending: courier.earnedCashPending ?? "0",
      earnedCardPending: courier.earnedCardPending ?? "0",
      totalDeliveries: courier.totalDeliveries ?? 0,
    },
  });
});

// ── COURIER: PATCH /courier/:courierId/orders/:orderId/status ─────────────────
// Token-authenticated (same ?token= as the deliveries endpoint).
// Allows transitions to 'in_delivery', 'delivered', or 'incident'.
// Accepts an optional 'note' for delivery receipts and incident details.

router.patch("/courier/:courierId/orders/:orderId/status", async (req, res): Promise<void> => {
  const courierId = req.params.courierId as string;
  const orderId = req.params.orderId as string;
  const token = (req.query.token as string | undefined) ?? "";
  const { status, note = "" } = req.body as { status?: string; note?: string };

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!token || !UUID_RE.test(courierId) || !UUID_RE.test(orderId)) {
    res.status(401).json({ error: "Token no válido." });
    return;
  }

  const ALLOWED_STATUSES = ["in_delivery", "delivered", "incident"];
  if (!status || !ALLOWED_STATUSES.includes(status)) {
    res.status(400).json({ error: "Estado no permitido desde la vista de repartidor." });
    return;
  }

  // Validate courier token
  const [courier] = await db
    .select({ id: couriersTable.id, token: couriersTable.token, name: couriersTable.name })
    .from(couriersTable)
    .where(eq(couriersTable.id, courierId));

  if (!courier || !courier.token || courier.token !== token) {
    res.status(401).json({ error: "Token no válido." });
    return;
  }

  // Verify the order is assigned to this courier
  const [order] = await db
    .select({ id: ordersTable.id, status: ordersTable.status, courierId: (ordersTable as any).courierId })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));

  if (!order) {
    res.status(404).json({ error: "Pedido no encontrado." });
    return;
  }

  if ((order as any).courierId !== courierId) {
    res.status(403).json({ error: "Este pedido no está asignado a este repartidor." });
    return;
  }

  const prevStatus = order.status;

  // ── State-transition guard ─────────────────────────────────────────────────
  // Define allowed transitions to prevent replayed calls from corrupting stats.
  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    "delivered":  ["waiting_courier", "in_delivery", "ready_to_collect"],
    "in_delivery": ["waiting_courier", "ready_to_collect", "confirmed"],
    "incident":   ["waiting_courier", "in_delivery", "confirmed"],
  };
  const allowed = ALLOWED_TRANSITIONS[status] ?? [];
  if (allowed.length > 0 && !allowed.includes(prevStatus)) {
    // Idempotent: if already in the target status, just return OK without side effects
    if (prevStatus === status) {
      res.json({ ok: true, status, note, idempotent: true });
      return;
    }
    res.status(409).json({ error: `Transición no permitida: ${prevStatus} → ${status}` });
    return;
  }

  await db.update(ordersTable)
    .set({ status } as any)
    .where(eq(ordersTable.id, orderId));

  // ── Persist status history ─────────────────────────────────────────────────
  try {
    await db.insert(deliveryOrderStatusHistoryTable).values({
      orderId,
      fromStatus: prevStatus,
      toStatus: status,
      changedBy: courier.id,
      changedByName: courier.name,
      device: "driver-app",
      note: note ?? "",
    });
  } catch { /* non-fatal */ }

  // ── Side effects (only run when transition was valid, not idempotent) ───────
  if (status === "delivered") {
    await db.update(couriersTable)
      .set({ status: "available" } as any)
      .where(eq(couriersTable.id, courierId));
    await db.execute(sql`UPDATE couriers SET total_deliveries = total_deliveries + 1 WHERE id = ${courierId}`);
    // Accumulate cash from this delivery if not paid online
    const [ord] = await db.select({
      paymentStatus: (ordersTable as any).onlinePaymentStatus,
      deliveryFee: (ordersTable as any).deliveryFee,
    }).from(ordersTable).where(eq(ordersTable.id, orderId));
    if (ord && (ord as any).paymentStatus !== "paid") {
      await db.execute(sql`
        UPDATE couriers
        SET earned_cash_pending = COALESCE(earned_cash_pending, 0) + (
          SELECT COALESCE(SUM(unit_price::numeric * quantity), 0)
                 + COALESCE(${(ord as any).deliveryFee ?? "0"}::numeric, 0)
          FROM order_items WHERE order_id = ${orderId}
        )
        WHERE id = ${courierId}
      `);
    }
  } else if (status === "in_delivery") {
    await db.update(couriersTable)
      .set({ status: "busy" } as any)
      .where(eq(couriersTable.id, courierId));
  }

  // Emit WebSocket refresh so the board updates
  try { getIO().emit("online-orders:refresh", {}); } catch { /* ignore */ }

  res.json({ ok: true, status, note });
});

// ── ADMIN: GET /admin/online-reports ─────────────────────────────────────────

router.get("/admin/online-reports", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { desde, hasta } = req.query as { desde?: string; hasta?: string };

  const from = desde ? new Date(desde) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = hasta ? new Date(hasta) : new Date();

  const ONLINE_TYPES = ["takeaway", "delivery"];

  const allOrders = await db.select({
    id: ordersTable.id,
    status: ordersTable.status,
    channel: (ordersTable as any).channel,
    deliveryType: (ordersTable as any).deliveryType,
    deliveryFee: (ordersTable as any).deliveryFee,
    createdAt: ordersTable.createdAt,
    estimatedReadyAt: (ordersTable as any).estimatedReadyAt,
  }).from(ordersTable)
    .where(and(
      inArray((ordersTable as any).deliveryType, ONLINE_TYPES),
      gte(ordersTable.createdAt, from),
      lte(ordersTable.createdAt, to),
    ));

  const completedIds = allOrders.filter((o) => ["delivered", "paid"].includes(o.status)).map((o) => o.id);

  let totalRevenue = 0;
  let totalDeliveryFees = 0;
  const productCounts: Record<string, { name: string; count: number }> = {};

  if (completedIds.length) {
    const items = await db.select({
      productId: orderItemsTable.productId,
      productName: productsTable.name,
      quantity: orderItemsTable.quantity,
      unitPrice: orderItemsTable.unitPrice,
      orderId: orderItemsTable.orderId,
    }).from(orderItemsTable)
      .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
      .where(inArray(orderItemsTable.orderId, completedIds));

    for (const item of items) {
      totalRevenue += parseFloat(item.unitPrice) * item.quantity;
      if (!productCounts[item.productId]) {
        productCounts[item.productId] = { name: item.productName, count: 0 };
      }
      productCounts[item.productId].count += item.quantity;
    }
  }

  const completedOrders = allOrders.filter((o) => ["delivered", "paid"].includes(o.status));
  for (const o of completedOrders) {
    totalDeliveryFees += parseFloat((o as any).deliveryFee ?? "0");
  }

  const ticketMedio = completedOrders.length > 0 ? (totalRevenue / completedOrders.length) : 0;

  const topProducts = Object.values(productCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const byChannel: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const o of allOrders) {
    const ch = (o as any).channel ?? "qr";
    const dt = (o as any).deliveryType ?? "takeaway";
    byChannel[ch] = (byChannel[ch] ?? 0) + 1;
    byType[dt] = (byType[dt] ?? 0) + 1;
  }

  const cancelados = allOrders.filter((o) => o.status === "cancelled").length;
  const incidencias = allOrders.filter((o) => o.status === "incident").length;

  res.json({
    periodo: { desde: from.toISOString(), hasta: to.toISOString() },
    totales: {
      pedidos: allOrders.length,
      completados: completedOrders.length,
      cancelados,
      incidencias,
      ventaTotal: totalRevenue.toFixed(2),
      gastosEntrega: totalDeliveryFees.toFixed(2),
      ticketMedio: ticketMedio.toFixed(2),
    },
    porCanal: byChannel,
    porTipo: byType,
    productosMasPedidos: topProducts,
  });
});

export default router;
