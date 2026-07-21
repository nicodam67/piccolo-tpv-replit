/**
 * Delivery Orders API — Manual order creation from the TPV for delivery/pickup.
 *
 * POST /api/delivery-orders          — Create delivery or pickup order manually
 * GET  /api/delivery-orders          — List delivery/pickup orders (with filters)
 * GET  /api/delivery-orders/:id      — Single order detail + status history
 * PATCH /api/delivery-orders/:id     — Update order (status, courier, etc.)
 * GET  /api/delivery-orders/:id/history — Status history for an order
 *
 * Courier settlements:
 * GET  /api/admin/couriers/:id/summary  — Active shift summary
 * POST /api/admin/couriers/:id/settle   — Close shift and create settlement
 * GET  /api/admin/courier-settlements   — List settlements (filterable)
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  productsTable,
  deliveryZonesTable,
  deliveryAddressesTable,
  couriersTable,
  onlineOrderAuditTable,
  onlineOrdersConfigTable,
  kitchenTasksTable,
  crmClientsTable,
  productFormatsTable,
  orderItemModifiersTable,
  modifiersTable,
  productModifierGroupsTable,
  modifierGroupsTable,
  deliveryOrderStatusHistoryTable,
  courierSettlementsTable,
} from "@workspace/db";
import { eq, and, inArray, desc, asc, gte, lte, count, avg, sum, sql, or, isNotNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { emitToFunction } from "../lib/socket-events";
import { calcMultiRateBreakdown } from "../lib/tax";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateOrderNumber(channel: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  const prefix = channel === "phone" ? "TEL" : channel === "counter" ? "MST" : "ONL";
  return `${prefix}-${date}-${seq}`;
}

async function recordStatusHistory(
  orderId: string,
  fromStatus: string | null,
  toStatus: string,
  changedBy: string | null,
  changedByName: string,
  device: string = "tpv",
  note: string = "",
) {
  try {
    await db.insert(deliveryOrderStatusHistoryTable).values({
      orderId,
      fromStatus: fromStatus ?? null,
      toStatus,
      changedBy: changedBy ?? null,
      changedByName,
      device,
      note,
    });
  } catch { /* non-fatal */ }
}

async function auditOrder(
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
  } catch { /* non-fatal */ }
}

function findDeliveryZone(
  zones: typeof deliveryZonesTable.$inferSelect[],
  postalCode: string,
  city: string,
): typeof deliveryZonesTable.$inferSelect | null {
  const normalise = (s: string) =>
    s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

// ── POST /api/delivery-orders ─────────────────────────────────────────────────
// Create a manual delivery or pickup order from the TPV (phone orders, counter)

router.post("/delivery-orders", requireAuth, async (req: any, res): Promise<void> => {
  const {
    deliveryType = "takeaway",  // "takeaway" | "delivery"
    channel = "phone",           // "phone" | "counter" | "tpv"
    clientName,
    clientPhone = "",
    scheduledAt,
    deliveryAddress,             // { street, number, floor, postalCode, city, notes }
    items = [],                  // [{ productId, quantity, formatId?, notes?, modifierIds? }]
    paymentMethod = "on_arrival",
    overrideDeliveryFee,         // manager can override zone fee
    discountAmount = 0,
    notes = "",
    courierId,
    saveAddress = false,
  } = req.body as {
    deliveryType?: string;
    channel?: string;
    clientName?: string;
    clientPhone?: string;
    scheduledAt?: string;
    deliveryAddress?: { street: string; number: string; floor?: string; postalCode: string; city: string; notes?: string };
    items: Array<{ productId: string; quantity: number; formatId?: string; notes?: string; modifierIds?: string[] }>;
    paymentMethod?: string;
    overrideDeliveryFee?: number;
    discountAmount?: number;
    notes?: string;
    courierId?: string;
    saveAddress?: boolean;
  };

  if (!clientName?.trim()) { res.status(400).json({ error: "El nombre del cliente es obligatorio." }); return; }
  if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ error: "El pedido debe contener al menos un producto." }); return; }
  if (!["takeaway", "delivery"].includes(deliveryType)) { res.status(400).json({ error: "Tipo de pedido no válido." }); return; }

  // ── Load delivery config ──────────────────────────────────────────────────
  const [cfg] = await db.select().from(onlineOrdersConfigTable).limit(1);
  const zones = await db.select().from(deliveryZonesTable).where(eq(deliveryZonesTable.active, true));

  // ── Zone validation ───────────────────────────────────────────────────────
  let matchedZone: typeof deliveryZonesTable.$inferSelect | null = null;
  let effectiveDeliveryFee = 0;

  if (deliveryType === "delivery") {
    if (!deliveryAddress?.street || !deliveryAddress?.postalCode) {
      res.status(400).json({ error: "La dirección de entrega es incompleta." }); return;
    }
    matchedZone = findDeliveryZone(zones, deliveryAddress.postalCode, deliveryAddress.city ?? "");
    // TPV staff can force-create out-of-zone orders (manual override)
    effectiveDeliveryFee = overrideDeliveryFee != null
      ? overrideDeliveryFee
      : matchedZone ? parseFloat(matchedZone.deliveryFee) : parseFloat(cfg?.deliveryFee ?? "3");
  }

  // ── Resolve products ──────────────────────────────────────────────────────
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await db.select().from(productsTable).where(inArray(productsTable.id, productIds));
  const productMap = new Map(products.map((p) => [p.id, p]));

  const subtotalLines: { lineTotal: number; taxRate: number }[] = [];
  const resolvedItems: Array<{
    productId: string; productName: string; quantity: number;
    unitPrice: string; taxRate: number; notes: string;
    formatId: string | null; formatName: string | null;
    modifiers: Array<{ modifierName: string; priceDelta: string }>;
  }> = [];

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) { res.status(404).json({ error: `Producto no encontrado: ${item.productId}` }); return; }
    if (!product.active) { res.status(400).json({ error: `El producto "${product.name}" no está activo.` }); return; }

    let unitPrice = parseFloat(product.price);
    const taxRate = product.taxRate ?? 10;
    let formatId: string | null = null;
    let formatName: string | null = null;

    if (item.formatId) {
      const [fmt] = await db.select().from(productFormatsTable)
        .where(and(eq(productFormatsTable.id, item.formatId), eq(productFormatsTable.productId, item.productId)));
      if (fmt) { unitPrice = parseFloat(fmt.price); formatId = fmt.id; formatName = fmt.name; }
    }

    const resolvedModifiers: Array<{ modifierName: string; priceDelta: string }> = [];
    if (item.modifierIds?.length) {
      const modIds = item.modifierIds.filter((id) => typeof id === "string");
      if (modIds.length) {
        const dbModifiers = await db.select({ id: modifiersTable.id, name: modifiersTable.name, priceDelta: modifiersTable.priceDelta, groupId: modifiersTable.groupId })
          .from(modifiersTable).where(and(inArray(modifiersTable.id, modIds), eq(modifiersTable.active, true)));
        for (const m of dbModifiers) {
          unitPrice += parseFloat(m.priceDelta);
          resolvedModifiers.push({ modifierName: m.name, priceDelta: m.priceDelta });
        }
      }
    }

    subtotalLines.push({ lineTotal: unitPrice * item.quantity, taxRate });
    resolvedItems.push({ productId: item.productId, productName: product.name, quantity: item.quantity, unitPrice: unitPrice.toFixed(2), taxRate, notes: item.notes ?? "", formatId, formatName, modifiers: resolvedModifiers });
  }

  const { total } = calcMultiRateBreakdown(subtotalLines, 0);
  const totalWithDelivery = (parseFloat(total) + effectiveDeliveryFee - discountAmount).toFixed(2);

  // ── CRM: find or create client ────────────────────────────────────────────
  let crmClientId: string | null = null;
  if (clientPhone.trim()) {
    try {
      const [existing] = await db.select().from(crmClientsTable)
        .where(eq(crmClientsTable.telefono, clientPhone.trim())).limit(1);
      if (existing) {
        crmClientId = existing.id;
      } else {
        const [newClient] = await db.insert(crmClientsTable).values({
          nombre: clientName.trim(), apellidos: "", telefono: clientPhone.trim(),
        }).returning();
        crmClientId = newClient.id;
      }
    } catch { /* non-fatal */ }
  }

  // ── Save delivery address ─────────────────────────────────────────────────
  let deliveryAddressId: string | null = null;
  if (deliveryType === "delivery" && deliveryAddress) {
    const [addr] = await db.insert(deliveryAddressesTable).values({
      clientId: crmClientId, name: clientName.trim(), phone: clientPhone.trim(),
      street: deliveryAddress.street, number: deliveryAddress.number,
      floor: deliveryAddress.floor ?? "", postalCode: deliveryAddress.postalCode,
      city: deliveryAddress.city, notes: deliveryAddress.notes ?? "",
    }).returning();
    deliveryAddressId = addr.id;
  }

  // ── Create order ──────────────────────────────────────────────────────────
  const estimatedReadyAt = new Date(Date.now() + (cfg?.prepTimeMinutes ?? 30) * 60 * 1000 + (matchedZone?.estimatedMinutes ?? 0) * 60 * 1000);
  const orderNumber = generateOrderNumber(channel);

  const [order] = await db.insert(ordersTable).values({
    channel: channel as any,
    deliveryType: deliveryType as any,
    orderType: deliveryType,
    status: "confirmed",  // Manual TPV orders go straight to confirmed
    clientName: clientName.trim(),
    clientId: crmClientId,
    clientPhone: clientPhone.trim(),
    deliveryAddressId,
    deliveryFee: effectiveDeliveryFee.toFixed(2),
    estimatedReadyAt,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    orderNumber,
    notes,
    courierId: courierId || null,
    onlinePaymentStatus: paymentMethod === "online" ? "pending" : "none",
    employeeId: (req as any).employee?.id ?? null,
  }).returning();

  // ── Insert order items ────────────────────────────────────────────────────
  const displayName = `${deliveryType === "delivery" ? "🛵" : "🏪"} ${clientName.trim()}`;
  for (const item of resolvedItems) {
    const [oi] = await db.insert(orderItemsTable).values({
      orderId: order.id, productId: item.productId,
      quantity: item.quantity, unitPrice: item.unitPrice, taxRate: item.taxRate,
      notes: item.notes, formatId: item.formatId ?? undefined, formatName: item.formatName ?? undefined,
      isInvitation: false,
    }).returning();
    if (item.modifiers.length) {
      await db.insert(orderItemModifiersTable).values(
        item.modifiers.map((m) => ({ orderItemId: oi.id, modifierName: m.modifierName, priceDelta: m.priceDelta }))
      );
    }

    // ── Send to KDS ─────────────────────────────────────────────────────────
    if (!scheduledAt) {
      await db.insert(kitchenTasksTable).values({
        orderId: order.id, orderItemId: oi.id, productName: item.productName,
        quantity: item.quantity, notes: item.notes, status: "new",
        prepZone: "cocina",
      } as any).catch(() => {});
    }
  }

  // ── Audit + status history ────────────────────────────────────────────────
  await auditOrder(order.id, "created_manual", (req as any).employee?.id, (req as any).employee?.name, { channel, deliveryType });
  await recordStatusHistory(order.id, null, "confirmed", (req as any).employee?.id, (req as any).employee?.name ?? "TPV");

  // ── WebSocket refresh ─────────────────────────────────────────────────────
  try { emitToFunction("floor", "online-orders:refresh", {}); } catch { /* ignore */ }

  res.status(201).json({
    id: order.id, orderNumber, status: "confirmed",
    total: totalWithDelivery, estimatedReadyAt, matchedZone: matchedZone?.name ?? null,
    deliveryFee: effectiveDeliveryFee,
  });
});

// ── GET /api/delivery-orders — list with filters ──────────────────────────────

router.get("/delivery-orders", requireAuth, async (req, res): Promise<void> => {
  const { date, from, to, status, courierId: filterCourier, type } = req.query as Record<string, string>;

  const conditions: any[] = [
    or(
      eq(ordersTable.deliveryType, "delivery"),
      eq(ordersTable.deliveryType, "takeaway"),
    )!,
  ];

  if (date) {
    const d = new Date(date + "T00:00:00");
    const d2 = new Date(date + "T23:59:59");
    conditions.push(gte(ordersTable.createdAt, d));
    conditions.push(lte(ordersTable.createdAt, d2));
  } else if (from && to) {
    conditions.push(gte(ordersTable.createdAt, new Date(from)));
    conditions.push(lte(ordersTable.createdAt, new Date(to + "T23:59:59")));
  }
  if (status && status !== "all") conditions.push(eq(ordersTable.status, status));
  if (filterCourier) conditions.push(eq(ordersTable.courierId, filterCourier));
  if (type) conditions.push(eq(ordersTable.deliveryType, type));

  const orders = await db.select({
    id: ordersTable.id, orderNumber: ordersTable.orderNumber, status: ordersTable.status,
    channel: ordersTable.channel, deliveryType: ordersTable.deliveryType,
    clientName: ordersTable.clientName, clientPhone: ordersTable.clientPhone,
    estimatedReadyAt: ordersTable.estimatedReadyAt, scheduledAt: ordersTable.scheduledAt,
    deliveryFee: ordersTable.deliveryFee, onlinePaymentStatus: ordersTable.onlinePaymentStatus,
    courierId: ordersTable.courierId, notes: ordersTable.notes,
    createdAt: ordersTable.createdAt, deliveryAddressId: ordersTable.deliveryAddressId,
    rejectionReason: ordersTable.rejectionReason,
  }).from(ordersTable).where(and(...conditions)).orderBy(desc(ordersTable.createdAt)).limit(200);

  // Enrich with addresses and courier names
  const addrIds = orders.map((o) => o.deliveryAddressId).filter(Boolean) as string[];
  const courierIds = [...new Set(orders.map((o) => o.courierId).filter(Boolean) as string[])];

  const [addresses, couriers] = await Promise.all([
    addrIds.length ? db.select().from(deliveryAddressesTable).where(inArray(deliveryAddressesTable.id, addrIds)) : [],
    courierIds.length ? db.select().from(couriersTable).where(inArray(couriersTable.id, courierIds)) : [],
  ]);
  const addrMap = new Map(addresses.map((a) => [a.id, a]));
  const courierMap = new Map(couriers.map((c) => [c.id, c]));

  // Totals per order from items
  const orderIds = orders.map((o) => o.id);
  const items = orderIds.length ? await db.select({
    orderId: orderItemsTable.orderId,
    total: sql<string>`sum(${orderItemsTable.unitPrice}::numeric * ${orderItemsTable.quantity})`.as("total"),
  }).from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds)).groupBy(orderItemsTable.orderId) : [];
  const totalMap = new Map(items.map((i) => [i.orderId, i.total]));

  res.json(orders.map((o) => ({
    ...o,
    address: o.deliveryAddressId ? addrMap.get(o.deliveryAddressId) ?? null : null,
    courier: o.courierId ? courierMap.get(o.courierId) ?? null : null,
    total: ((parseFloat(totalMap.get(o.id) ?? "0") + parseFloat(o.deliveryFee)).toFixed(2)),
  })));
});

// ── GET /api/delivery-orders/:id — single order with history ─────────────────

router.get("/delivery-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }

  const [items, history, address, courier] = await Promise.all([
    db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id)),
    db.select().from(deliveryOrderStatusHistoryTable).where(eq(deliveryOrderStatusHistoryTable.orderId, id)).orderBy(asc(deliveryOrderStatusHistoryTable.createdAt)),
    order.deliveryAddressId ? db.select().from(deliveryAddressesTable).where(eq(deliveryAddressesTable.id, order.deliveryAddressId)).then(r => r[0] ?? null) : Promise.resolve(null),
    order.courierId ? db.select().from(couriersTable).where(eq(couriersTable.id, order.courierId)).then(r => r[0] ?? null) : Promise.resolve(null),
  ]);

  res.json({ ...order, items, history, address, courier });
});

// ── GET /api/delivery-orders/:id/history ─────────────────────────────────────

router.get("/delivery-orders/:id/history", requireAuth, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const history = await db.select().from(deliveryOrderStatusHistoryTable)
    .where(eq(deliveryOrderStatusHistoryTable.orderId, id))
    .orderBy(asc(deliveryOrderStatusHistoryTable.createdAt));
  res.json(history);
});

// ── PATCH /api/delivery-orders/:id — update status, courier, etc. ─────────────

router.patch("/delivery-orders/:id", requireAuth, async (req: any, res): Promise<void> => {
  const id = req.params.id as string;
  const { status, courierId, estimatedReadyAt, notes, note } = req.body as {
    status?: string; courierId?: string; estimatedReadyAt?: string;
    notes?: string; note?: string;
  };

  // Read existing order including its assigned courier and payment status
  const [current] = await db.select({
    status: ordersTable.status,
    existingCourierId: (ordersTable as any).courierId,
    onlinePaymentStatus: (ordersTable as any).onlinePaymentStatus,
    deliveryFee: (ordersTable as any).deliveryFee,
  }).from(ordersTable).where(eq(ordersTable.id, id));
  if (!current) { res.status(404).json({ error: "Pedido no encontrado" }); return; }

  // ── Transition guard for status changes ──────────────────────────────────────
  // Prevents idempotency bugs (double-delivered inflating stats) and illegal jumps.
  const STATUS_TRANSITIONS: Record<string, string[]> = {
    delivered:      ["confirmed", "in_preparation", "waiting_courier", "in_delivery", "ready_to_collect"],
    in_delivery:    ["confirmed", "in_preparation", "waiting_courier", "ready_to_collect"],
    in_preparation: ["confirmed", "pending_confirm"],
    ready_to_collect: ["in_preparation", "waiting_courier"],
    waiting_courier:  ["confirmed", "in_preparation", "ready_to_collect"],
    cancelled:      ["confirmed", "pending_confirm", "in_preparation"],
    rejected:       ["pending_confirm", "confirmed"],
    incident:       ["in_delivery", "waiting_courier", "in_preparation"],
  };

  if (status) {
    const allowed = STATUS_TRANSITIONS[status];
    if (allowed !== undefined && current.status === status) {
      // Already in target state — idempotent no-op, skip all side effects
      res.json({ success: true, courierId: (current as any).existingCourierId, idempotent: true });
      return;
    }
    if (allowed !== undefined && !allowed.includes(current.status)) {
      res.status(409).json({ error: `Transición no permitida: ${current.status} → ${status}` });
      return;
    }
  }

  const updates: Partial<typeof ordersTable.$inferInsert> = {};
  if (status) updates.status = status;
  if (courierId !== undefined) updates.courierId = courierId || null;
  if (estimatedReadyAt) updates.estimatedReadyAt = new Date(estimatedReadyAt);
  if (notes !== undefined) updates.notes = notes;

  await db.update(ordersTable).set(updates).where(eq(ordersTable.id, id));

  if (status && status !== current.status) {
    await recordStatusHistory(id, current.status, status, req.employee?.id, req.employee?.name ?? "TPV", "tpv", note ?? "");
    await auditOrder(id, `status_changed:${status}`, req.employee?.id, req.employee?.name, { from: current.status, to: status });
  }

  // Resolve the effective courier: prefer body param, fall back to order's existing courier
  const effectiveCourierId: string | null = courierId ?? (current as any).existingCourierId ?? null;

  // ── Courier side-effects (only on status transition, after guard above) ───────
  if (status === "in_delivery" && effectiveCourierId) {
    await db.update(couriersTable)
      .set({ status: "busy" } as any)
      .where(eq(couriersTable.id, effectiveCourierId));
  }
  if (status === "delivered" && effectiveCourierId) {
    await db.update(couriersTable)
      .set({ status: "available" } as any)
      .where(eq(couriersTable.id, effectiveCourierId));
    // Increment total_deliveries counter
    await db.execute(sql`UPDATE couriers SET total_deliveries = total_deliveries + 1 WHERE id = ${effectiveCourierId}`);
    // Accumulate cash pending for unpaid orders
    if ((current as any).onlinePaymentStatus !== "paid") {
      await db.execute(sql`
        UPDATE couriers
        SET earned_cash_pending = COALESCE(earned_cash_pending, 0) + (
          SELECT COALESCE(SUM(unit_price::numeric * quantity), 0)
                 + COALESCE(${(current as any).deliveryFee ?? "0"}::numeric, 0)
          FROM order_items WHERE order_id = ${id}
        )
        WHERE id = ${effectiveCourierId}
      `);
    }
  }
  // If order is cancelled or incident/rejected, free the courier if they were busy
  if ((status === "cancelled" || status === "rejected" || status === "incident") && effectiveCourierId) {
    await db.update(couriersTable)
      .set({ status: "available" } as any)
      .where(eq(couriersTable.id, effectiveCourierId));
  }

  try { emitToFunction("floor", "online-orders:refresh", { orderId: id }); } catch { /* ignore */ }
  res.json({ success: true, courierId: effectiveCourierId });
});

// ── GET /api/admin/couriers/:id/summary ──────────────────────────────────────

router.get("/admin/couriers/:id/summary", requireAuth, async (req, res): Promise<void> => {
  const courierId = req.params.id as string;
  const [courier] = await db.select().from(couriersTable).where(eq(couriersTable.id, courierId));
  if (!courier) { res.status(404).json({ error: "Repartidor no encontrado" }); return; }

  // Active orders
  const activeOrders = await db.select({
    id: ordersTable.id, orderNumber: ordersTable.orderNumber,
    status: ordersTable.status, clientName: ordersTable.clientName,
    estimatedReadyAt: ordersTable.estimatedReadyAt, createdAt: ordersTable.createdAt,
    onlinePaymentStatus: ordersTable.onlinePaymentStatus,
    total: sql<string>`(SELECT COALESCE(SUM(unit_price::numeric * quantity), 0) FROM order_items WHERE order_id = ${ordersTable.id})::text`.as("total"),
    deliveryFee: ordersTable.deliveryFee,
  }).from(ordersTable).where(
    and(
      eq(ordersTable.courierId, courierId),
      inArray(ordersTable.status, ["waiting_courier", "in_delivery"]),
    )
  );

  // Today's completed orders
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayDeliveries = await db.select({ count: count() }).from(ordersTable).where(
    and(
      eq(ordersTable.courierId, courierId),
      eq(ordersTable.status, "delivered"),
      gte(ordersTable.createdAt, todayStart),
    )
  );

  res.json({
    courier: {
      id: courier.id, name: courier.name, phone: courier.phone,
      status: courier.status, vehicleType: (courier as any).vehicleType,
      plate: (courier as any).plate, earnedCashPending: (courier as any).earnedCashPending,
      earnedCardPending: (courier as any).earnedCardPending, totalDeliveries: (courier as any).totalDeliveries,
    },
    activeOrders,
    todayDeliveries: todayDeliveries[0]?.count ?? 0,
  });
});

// ── POST /api/admin/couriers/:id/settle ──────────────────────────────────────

router.post("/admin/couriers/:id/settle", requireAuth, requireRole("manager", "admin"), async (req: any, res): Promise<void> => {
  const courierId = req.params.id as string;
  const { tips = 0, expenses = 0, differences = 0, notes = "" } = req.body as {
    tips?: number; expenses?: number; differences?: number; notes?: string;
  };

  const [courier] = await db.select().from(couriersTable).where(eq(couriersTable.id, courierId));
  if (!courier) { res.status(404).json({ error: "Repartidor no encontrado" }); return; }

  // Find last settlement to determine period start
  const [lastSettlement] = await db.select({ createdAt: courierSettlementsTable.createdAt })
    .from(courierSettlementsTable).where(eq(courierSettlementsTable.courierId, courierId))
    .orderBy(desc(courierSettlementsTable.createdAt)).limit(1);

  const periodStart = lastSettlement?.createdAt ?? (courier as any).createdAt;
  const periodEnd = new Date();

  // Count orders in period
  const [{ total: ordersCount }] = await db.select({ total: count() }).from(ordersTable).where(
    and(
      eq(ordersTable.courierId, courierId),
      eq(ordersTable.status, "delivered"),
      gte(ordersTable.createdAt, periodStart),
    )
  );

  const [settlement] = await db.insert(courierSettlementsTable).values({
    courierId,
    periodStart,
    periodEnd,
    ordersCount: ordersCount ?? 0,
    totalCash: String((courier as any).earnedCashPending ?? "0"),
    totalCard: String((courier as any).earnedCardPending ?? "0"),
    totalOnline: "0",
    tips: tips.toString(),
    expenses: expenses.toString(),
    differences: differences.toString(),
    closedBy: req.employee?.id ?? null,
    closedByName: req.employee?.name ?? "manager",
    notes,
  }).returning();

  // Reset courier pending amounts
  await db.update(couriersTable).set({
    earnedCashPending: "0",
    earnedCardPending: "0",
  } as any).where(eq(couriersTable.id, courierId));

  res.json({ settlement });
});

// ── GET /api/admin/courier-settlements ───────────────────────────────────────

router.get("/admin/courier-settlements", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { courierId: filterCourier, from, to } = req.query as Record<string, string>;

  const conditions: any[] = [];
  if (filterCourier) conditions.push(eq(courierSettlementsTable.courierId, filterCourier));
  if (from) conditions.push(gte(courierSettlementsTable.createdAt, new Date(from)));
  if (to) conditions.push(lte(courierSettlementsTable.createdAt, new Date(to + "T23:59:59")));

  const settlements = await db.select().from(courierSettlementsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(courierSettlementsTable.createdAt)).limit(100);

  // Enrich with courier names
  const courierIds = [...new Set(settlements.map((s) => s.courierId))];
  const couriers = courierIds.length
    ? await db.select({ id: couriersTable.id, name: couriersTable.name }).from(couriersTable).where(inArray(couriersTable.id, courierIds))
    : [];
  const courierMap = new Map(couriers.map((c) => [c.id, c.name]));

  res.json(settlements.map((s) => ({ ...s, courierName: courierMap.get(s.courierId) ?? "—" })));
});

export default router;
