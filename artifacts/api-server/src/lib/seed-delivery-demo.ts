/**
 * Seed: Delivery module demo data
 * Idempotent — skips if demo couriers already exist.
 * All demo records use order_number LIKE 'DEMO%' for easy cleanup.
 */

import { db } from "@workspace/db";
import {
  couriersTable,
  deliveryZonesTable,
  ordersTable,
  orderItemsTable,
  deliveryAddressesTable,
  courierSettlementsTable,
  deliveryOrderStatusHistoryTable,
} from "@workspace/db";
import { eq, like } from "drizzle-orm";

export async function seedDeliveryDemo() {
  // ── Idempotency check ──────────────────────────────────────────────────────
  const existing = await db.select().from(couriersTable)
    .where(eq(couriersTable.name, "🧪 Demo Repartidor 1"))
    .limit(1);
  if (existing.length > 0) return;

  console.log("[seed-delivery-demo] Seeding delivery demo data…");

  // ── Demo couriers ──────────────────────────────────────────────────────────
  const [courier1] = await db.insert(couriersTable).values({
    name: "🧪 Demo Repartidor 1",
    phone: "600000001",
    status: "available",
    vehicleType: "moto",
    plate: "1234 MNO",
    zonaHabitual: "La Ràpita",
    turno: "Mediodía",
    earnedCashPending: "45.50",
    earnedCardPending: "12.00",
    totalDeliveries: 23,
  } as any).returning();

  const [courier2] = await db.insert(couriersTable).values({
    name: "🧪 Demo Repartidor 2",
    phone: "600000002",
    status: "busy",
    vehicleType: "car",
    plate: "5678 PQR",
    zonaHabitual: "Alcanar",
    turno: "Noche",
    earnedCashPending: "0",
    earnedCardPending: "0",
    totalDeliveries: 11,
  } as any).returning();

  // ── Demo delivery zones (if not already present) ───────────────────────────
  const existingZones = await db.select().from(deliveryZonesTable).limit(1);
  let zone1Id: string | null = null;
  let zone2Id: string | null = null;

  if (existingZones.length === 0) {
    const [z1] = await db.insert(deliveryZonesTable).values({
      name: "La Ràpita", type: "postal_code",
      value: { postalCodes: ["43560"] }, deliveryFee: "2.50",
      minOrder: "12", estimatedMinutes: 20,
    }).returning();
    const [z2] = await db.insert(deliveryZonesTable).values({
      name: "Alcanar", type: "postal_code",
      value: { postalCodes: ["43530"] }, deliveryFee: "3.50",
      minOrder: "15", estimatedMinutes: 30,
    }).returning();
    await db.insert(deliveryZonesTable).values({
      name: "Amposta", type: "city",
      value: { cities: ["Amposta"] }, deliveryFee: "5.00",
      minOrder: "20", estimatedMinutes: 45,
    });
    zone1Id = z1.id;
    zone2Id = z2.id;
  }

  const now = new Date();
  const hrsAgo = (h: number) => new Date(now.getTime() - h * 3600000);

  // ── Demo order 1: phone pickup, in preparation ────────────────────────────
  const [addr1] = await db.insert(deliveryAddressesTable).values({
    name: "Demo Cliente A", phone: "611111111",
    street: "Carrer Major", number: "10", floor: "2º",
    postalCode: "43560", city: "La Ràpita", notes: "Timbre roto, llamar",
  }).returning();

  const [ord1] = await db.insert(ordersTable).values({
    channel: "phone", deliveryType: "delivery", orderType: "delivery",
    status: "in_preparation", clientName: "Demo Cliente A",
    clientPhone: "611111111", deliveryAddressId: addr1.id,
    courierId: courier1.id, deliveryFee: "2.50",
    orderNumber: "DEMO-PHONE-001", notes: "Sin cebolla en la pizza",
    estimatedReadyAt: new Date(now.getTime() + 15 * 60000),
    createdAt: hrsAgo(0.5),
  } as any).returning();
  await db.insert(deliveryOrderStatusHistoryTable).values([
    { orderId: ord1.id, fromStatus: null, toStatus: "confirmed", changedByName: "staff", device: "tpv" },
    { orderId: ord1.id, fromStatus: "confirmed", toStatus: "in_preparation", changedByName: "cocina", device: "kds" },
  ] as any);

  // ── Demo order 2: web delivery, paid online, in_delivery ─────────────────
  const [addr2] = await db.insert(deliveryAddressesTable).values({
    name: "Demo Cliente B", phone: "622222222",
    street: "Avinguda Catalunya", number: "25", floor: "1A",
    postalCode: "43530", city: "Alcanar", notes: "",
  }).returning();

  const [ord2] = await db.insert(ordersTable).values({
    channel: "web", deliveryType: "delivery", orderType: "delivery",
    status: "in_delivery", clientName: "Demo Cliente B",
    clientPhone: "622222222", deliveryAddressId: addr2.id,
    courierId: courier2.id, deliveryFee: "3.50",
    orderNumber: "DEMO-WEB-002", notes: "",
    onlinePaymentStatus: "paid", onlinePaymentRef: "pi_demo_001",
    estimatedReadyAt: new Date(now.getTime() + 10 * 60000),
    createdAt: hrsAgo(1),
  } as any).returning();

  // ── Demo order 3: takeaway, ready_to_collect ──────────────────────────────
  const [ord3] = await db.insert(ordersTable).values({
    channel: "phone", deliveryType: "takeaway", orderType: "takeaway",
    status: "ready_to_collect", clientName: "Demo Cliente C",
    clientPhone: "633333333", deliveryFee: "0",
    orderNumber: "DEMO-TAKE-003", notes: "Alérgico a los frutos secos",
    estimatedReadyAt: new Date(now.getTime() + 5 * 60000),
    createdAt: hrsAgo(0.3),
  } as any).returning();

  // ── Demo order 4: scheduled for tomorrow, confirmed ───────────────────────
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(13, 30, 0, 0);
  const [addr4] = await db.insert(deliveryAddressesTable).values({
    name: "Demo Cliente D", phone: "644444444",
    street: "Plaça Espanya", number: "3", floor: "",
    postalCode: "43560", city: "La Ràpita", notes: "",
  }).returning();
  await db.insert(ordersTable).values({
    channel: "phone", deliveryType: "delivery", orderType: "delivery",
    status: "confirmed", clientName: "Demo Cliente D",
    clientPhone: "644444444", deliveryAddressId: addr4.id,
    deliveryFee: "2.50", orderNumber: "DEMO-PROG-004",
    scheduledAt: tomorrow, estimatedReadyAt: new Date(tomorrow.getTime() + 30 * 60000),
    createdAt: now,
  } as any);

  // ── Demo order 5: rejected ────────────────────────────────────────────────
  const [ord5] = await db.insert(ordersTable).values({
    channel: "web", deliveryType: "delivery", orderType: "delivery",
    status: "rejected", clientName: "Demo Cliente E",
    clientPhone: "655555555", deliveryFee: "3.50",
    orderNumber: "DEMO-REJ-005", rejectionReason: "Sin cobertura de reparto esta noche",
    onlinePaymentStatus: "refunded",
    createdAt: hrsAgo(2),
  } as any).returning();
  await db.insert(deliveryOrderStatusHistoryTable).values([
    { orderId: ord5.id, fromStatus: "pending_confirm", toStatus: "rejected", changedByName: "manager", note: "Sin cobertura de reparto" },
  ] as any);

  // ── Demo order 6: incident ────────────────────────────────────────────────
  const [addr6] = await db.insert(deliveryAddressesTable).values({
    name: "Demo Cliente F", phone: "666666666",
    street: "Carrer de la Mar", number: "7", floor: "",
    postalCode: "43530", city: "Alcanar", notes: "",
  }).returning();
  const [ord6] = await db.insert(ordersTable).values({
    channel: "phone", deliveryType: "delivery", orderType: "delivery",
    status: "incident", clientName: "Demo Cliente F",
    clientPhone: "666666666", deliveryAddressId: addr6.id,
    courierId: courier2.id, deliveryFee: "3.50",
    orderNumber: "DEMO-INC-006", notes: "Incidencia: cliente no localizado",
    createdAt: hrsAgo(1.5),
  } as any).returning();

  // ── Demo order 7: counter pickup, delivered ───────────────────────────────
  const [ord7] = await db.insert(ordersTable).values({
    channel: "counter", deliveryType: "takeaway", orderType: "takeaway",
    status: "delivered", clientName: "Demo Cliente G",
    clientPhone: "677777777", deliveryFee: "0",
    orderNumber: "DEMO-MST-007", onlinePaymentStatus: "paid",
    createdAt: hrsAgo(3),
  } as any).returning();

  // ── Demo order 8: web, pending_confirm ────────────────────────────────────
  const [addr8] = await db.insert(deliveryAddressesTable).values({
    name: "Demo Cliente H", phone: "688888888",
    street: "Carrer Nou", number: "15", floor: "3B",
    postalCode: "43560", city: "La Ràpita", notes: "",
  }).returning();
  await db.insert(ordersTable).values({
    channel: "web", deliveryType: "delivery", orderType: "delivery",
    status: "pending_confirm", clientName: "Demo Cliente H",
    clientPhone: "688888888", deliveryAddressId: addr8.id,
    deliveryFee: "2.50", orderNumber: "DEMO-WEB-008",
    onlinePaymentStatus: "pending",
    estimatedReadyAt: new Date(now.getTime() + 45 * 60000),
    createdAt: new Date(now.getTime() - 2 * 60000),
  } as any);

  // ── Demo settlement (closed) ──────────────────────────────────────────────
  await db.insert(courierSettlementsTable).values({
    courierId: courier1.id,
    periodStart: hrsAgo(8),
    periodEnd: hrsAgo(0),
    ordersCount: 12,
    totalCash: "87.50",
    totalCard: "0",
    totalOnline: "45.00",
    tips: "5.00",
    expenses: "2.50",
    differences: "-1.00",
    closedByName: "Manager Demo",
    notes: "Turno mediodía — todo correcto",
  } as any);

  console.log("[seed-delivery-demo] ✓ Delivery demo data seeded.");
}
