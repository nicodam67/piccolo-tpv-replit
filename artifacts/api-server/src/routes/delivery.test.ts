/**
 * Delivery module tests
 *
 * Tests:
 *  1. Manual order creation (deliveryType=delivery with deliveryAddress)
 *  2. Takeaway order creation (no address needed)
 *  3. Status change writes to delivery_order_status_history
 *  4. Courier settlement resets pending amounts
 *  5. Out-of-zone addresses are created anyway (TPV override, no 422)
 *  6. Courier token endpoint accepts incident + note and persists to history
 *
 * Requires a migrated PostgreSQL test database and RUN_DB_INTEGRATION_TESTS=1.
 * The default unit-test run skips this file without opening a database connection.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { db } from "@workspace/db";
import {
  couriersTable,
  ordersTable,
  deliveryZonesTable,
  deliveryOrderStatusHistoryTable,
  courierSettlementsTable,
  categoriesTable,
  employeesTable,
  employeePinsTable,
  productsTable,
} from "@workspace/db";
import { eq, like } from "drizzle-orm";
import bcrypt from "bcryptjs";
import app from "../app";

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getToken(): Promise<string> {
  const res = await request(app)
    .post("/api/auth/pin")
    .send({ employeeId: TEST_ADMIN_ID, pin: "4826" });
  return res.body?.token ?? "";
}

function authHeaders(tok: string) {
  return { Authorization: `Bearer ${tok}` };
}

const TEST_PFX = "TEST-DEL-";
const TEST_ADMIN_ID = "26000000-0000-4000-8000-000000000001";
const TEST_CATEGORY_ID = "26000000-0000-4000-8000-000000000002";
const TEST_PRODUCT_ID = "26000000-0000-4000-8000-000000000003";
const RUN_DB_INTEGRATION_TESTS = process.env["RUN_DB_INTEGRATION_TESTS"] === "1";
const describeWithDatabase = RUN_DB_INTEGRATION_TESTS ? describe : describe.skip;

// ── State ─────────────────────────────────────────────────────────────────────
let token = "";
let testCourierId = "";
let testProductId = "";

beforeAll(async () => {
  if (!RUN_DB_INTEGRATION_TESTS) return;
  await db.insert(employeesTable).values({
    id: TEST_ADMIN_ID,
    name: "TEST Delivery Admin",
    role: "admin",
    active: true,
  }).onConflictDoNothing();
  await db.insert(employeePinsTable).values({
    employeeId: TEST_ADMIN_ID,
    pinHash: await bcrypt.hash("4826", 10),
  }).onConflictDoUpdate({
    target: employeePinsTable.employeeId,
    set: { pinHash: await bcrypt.hash("4826", 10) },
  });
  await db.insert(categoriesTable).values({
    id: TEST_CATEGORY_ID,
    name: "TEST Delivery Category",
  }).onConflictDoNothing();
  await db.insert(productsTable).values({
    id: TEST_PRODUCT_ID,
    categoryId: TEST_CATEGORY_ID,
    name: "TEST Delivery Product",
    price: "10.00",
    prepZone: "cocina",
    active: true,
    deliveryVisible: true,
  }).onConflictDoNothing();

  token = await getToken();
  if (!token) throw new Error("Integration login failed");

  testProductId = TEST_PRODUCT_ID;

  // Create test courier with pending amounts
  const [c] = await db.insert(couriersTable).values({
    name: "TEST Courier",
    phone: "699000001",
    vehicleType: "moto",
    earnedCashPending: "20.00",
    earnedCardPending: "5.00",
    token: "test-courier-token-uuid-0001",
  } as any).returning();
  testCourierId = c.id;
}, 30_000);

afterAll(async () => {
  if (!RUN_DB_INTEGRATION_TESTS) return;
  // Clean up orders created by these tests
  const testOrders = await db.select({ id: ordersTable.id })
    .from(ordersTable).where(like((ordersTable as any).orderNumber, `${TEST_PFX}%`));
  for (const o of testOrders) {
    await db.delete(deliveryOrderStatusHistoryTable)
      .where(eq(deliveryOrderStatusHistoryTable.orderId, o.id)).catch(() => {});
    await db.delete(ordersTable).where(eq(ordersTable.id, o.id)).catch(() => {});
  }
  // Remove courier after settlements
  await db.delete(courierSettlementsTable)
    .where(eq(courierSettlementsTable.courierId, testCourierId)).catch(() => {});
  await db.delete(couriersTable)
    .where(eq(couriersTable.id, testCourierId)).catch(() => {});
  await db.delete(productsTable).where(eq(productsTable.id, TEST_PRODUCT_ID)).catch(() => {});
  await db.delete(categoriesTable).where(eq(categoriesTable.id, TEST_CATEGORY_ID)).catch(() => {});
  await db.delete(employeesTable).where(eq(employeesTable.id, TEST_ADMIN_ID)).catch(() => {});
}, 30_000);

// ── 1. Manual delivery order creation ────────────────────────────────────────
describeWithDatabase("POST /api/delivery-orders — delivery", () => {
  it("creates a delivery order in confirmed status and returns 201", async () => {
    if (!testProductId) { console.warn("Skip: no products"); return; }

    const res = await request(app)
      .post("/api/delivery-orders")
      .set(authHeaders(token))
      .send({
        channel: "phone",
        deliveryType: "delivery",
        clientName: "Test Cliente A",
        clientPhone: "699999000",
        deliveryAddress: {
          street: "Calle Test", number: "1", floor: "2A",
          postalCode: "00001", city: "TestCity", notes: "",
        },
        items: [{ productId: testProductId, quantity: 1 }],
        paymentMethod: "cash",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.status).toBe("confirmed");
    expect(typeof res.body.total).toBe("string");
    // Mark this order so we can clean it up
    await db.update(ordersTable)
      .set({ orderNumber: `${TEST_PFX}001` } as any)
      .where(eq(ordersTable.id, res.body.id));
  });
});

// ── 2. Takeaway order creation ────────────────────────────────────────────────
describeWithDatabase("POST /api/delivery-orders — takeaway", () => {
  it("creates a takeaway order without address and deliveryFee=0", async () => {
    if (!testProductId) return;

    const res = await request(app)
      .post("/api/delivery-orders")
      .set(authHeaders(token))
      .send({
        channel: "phone",
        deliveryType: "takeaway",
        clientName: "Test Cliente B",
        clientPhone: "699999001",
        items: [{ productId: testProductId, quantity: 2 }],
        paymentMethod: "cash",
      });

    expect(res.status).toBe(201);
    expect(parseFloat(res.body.deliveryFee)).toBe(0);
    await db.update(ordersTable)
      .set({ orderNumber: `${TEST_PFX}002` } as any)
      .where(eq(ordersTable.id, res.body.id));
  });
});

// ── 3. Status change writes to history ───────────────────────────────────────
describeWithDatabase("PATCH /api/delivery-orders/:id — status history", () => {
  let orderId = "";

  beforeAll(async () => {
    if (!testProductId) return;
    const res = await request(app)
      .post("/api/delivery-orders")
      .set(authHeaders(token))
      .send({
        channel: "phone", deliveryType: "delivery",
        clientName: "History Test", clientPhone: "699000002",
        items: [{ productId: testProductId, quantity: 1 }],
        paymentMethod: "cash",
        deliveryAddress: {
          street: "C/ Historia", number: "1", postalCode: "00001", city: "TestCity",
        },
      });
    orderId = res.body?.id ?? "";
    if (orderId) {
      await db.update(ordersTable)
        .set({ orderNumber: `${TEST_PFX}003` } as any)
        .where(eq(ordersTable.id, orderId));
    }
  }, 15_000);

  it("status PATCH to in_preparation writes a history row", async () => {
    if (!orderId) return;

    await request(app)
      .patch(`/api/delivery-orders/${orderId}`)
      .set(authHeaders(token))
      .send({ status: "in_preparation" })
      .expect(200);

    const rows = await db.select()
      .from(deliveryOrderStatusHistoryTable)
      .where(eq(deliveryOrderStatusHistoryTable.orderId, orderId));

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.some(r => r.toStatus === "in_preparation")).toBe(true);
  });

  it("status PATCH to in_delivery writes second history row with correct fromStatus", async () => {
    if (!orderId) return;

    await request(app)
      .patch(`/api/delivery-orders/${orderId}`)
      .set(authHeaders(token))
      .send({ status: "in_delivery", courierId: testCourierId })
      .expect(200);

    const rows = await db.select()
      .from(deliveryOrderStatusHistoryTable)
      .where(eq(deliveryOrderStatusHistoryTable.orderId, orderId));

    const inDelivRow = rows.find(r => r.toStatus === "in_delivery");
    expect(inDelivRow).toBeTruthy();
    expect(inDelivRow?.fromStatus).toBe("in_preparation");
  });
});

// ── 4. Courier settlement resets pending amounts ──────────────────────────────
describeWithDatabase("POST /api/admin/couriers/:id/settle", () => {
  it("creates a settlement row and resets earnedCashPending + earnedCardPending to 0", async () => {
    const res = await request(app)
      .post(`/api/admin/couriers/${testCourierId}/settle`)
      .set(authHeaders(token))
      .send({ tips: 2, expenses: 0, differences: 0, notes: "Test settlement" })
      .expect(200);

    expect(res.body.settlement).toBeTruthy();
    // totalCash should match what the courier had pending
    expect(parseFloat(res.body.settlement.totalCash)).toBeGreaterThanOrEqual(0);

    // Courier's pending amounts should be reset to 0
    const [updated] = await db.select()
      .from(couriersTable)
      .where(eq(couriersTable.id, testCourierId));
    expect(parseFloat((updated as any).earnedCashPending ?? "0")).toBe(0);
    expect(parseFloat((updated as any).earnedCardPending ?? "0")).toBe(0);
  });
});

// ── 5. Out-of-zone delivery is always created (TPV override) ──────────────────
describeWithDatabase("POST /api/delivery-orders — out-of-zone", () => {
  it("creates a delivery order even for addresses outside all defined zones", async () => {
    if (!testProductId) return;

    const res = await request(app)
      .post("/api/delivery-orders")
      .set(authHeaders(token))
      .send({
        channel: "phone", deliveryType: "delivery",
        clientName: "Out-of-zone Test", clientPhone: "699000099",
        items: [{ productId: testProductId, quantity: 1 }],
        paymentMethod: "cash",
        deliveryAddress: {
          street: "C/ Lejana", number: "1",
          postalCode: "99999", city: "Nowhere",
        },
      });

    // TPV staff always create out-of-zone — no 422, always 201
    expect(res.status).toBe(201);
    expect(res.body.matchedZone).toBeNull();
    await db.update(ordersTable)
      .set({ orderNumber: `${TEST_PFX}OOZ` } as any)
      .where(eq(ordersTable.id, res.body.id));
  });
});

// ── 6. Courier token endpoint: incident + note ────────────────────────────────
describeWithDatabase("PATCH /courier/:courierId/orders/:orderId/status — incident via courier token", () => {
  let incidentOrderId = "";

  beforeAll(async () => {
    if (!testProductId) return;
    // Create an order assigned to our test courier
    const res = await request(app)
      .post("/api/delivery-orders")
      .set(authHeaders(token))
      .send({
        channel: "phone", deliveryType: "delivery",
        clientName: "Incident Test Client", clientPhone: "699000077",
        items: [{ productId: testProductId, quantity: 1 }],
        paymentMethod: "cash",
        courierId: testCourierId,
        deliveryAddress: {
          street: "C/ Incidencia", number: "5", postalCode: "00001", city: "TestCity",
        },
      });
    incidentOrderId = res.body?.id ?? "";
    if (incidentOrderId) {
      await db.update(ordersTable)
        .set({ orderNumber: `${TEST_PFX}INC` } as any)
        .where(eq(ordersTable.id, incidentOrderId));
    }
  }, 15_000);

  it("sets order to incident status via courier token and writes history with note", async () => {
    if (!incidentOrderId) return;

    // First set to in_delivery so transition makes sense
    await db.update(ordersTable)
      .set({ status: "in_delivery", courierId: testCourierId } as any)
      .where(eq(ordersTable.id, incidentOrderId));

    const noteText = "Cliente no localizado: no atendió el portero";
    const res = await request(app)
      .patch(`/api/courier/${testCourierId}/orders/${incidentOrderId}/status`)
      .set("Authorization", "Bearer test-courier-token-uuid-0001")
      .send({ status: "incident", note: noteText })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe("incident");

    // Verify status history was written
    const rows = await db.select()
      .from(deliveryOrderStatusHistoryTable)
      .where(eq(deliveryOrderStatusHistoryTable.orderId, incidentOrderId));

    const incRow = rows.find(r => r.toStatus === "incident");
    expect(incRow).toBeTruthy();
    expect(incRow?.device).toBe("driver-app");
    expect(incRow?.note).toBe(noteText);

    // Verify order status was updated
    const [ord] = await db.select({ status: ordersTable.status })
      .from(ordersTable).where(eq(ordersTable.id, incidentOrderId));
    expect(ord.status).toBe("incident");
  });

  it("delivered status via courier token also writes history", async () => {
    if (!incidentOrderId) return;

    // Reset to in_delivery
    await db.update(ordersTable)
      .set({ status: "in_delivery", courierId: testCourierId } as any)
      .where(eq(ordersTable.id, incidentOrderId));

    const res = await request(app)
      .patch(`/api/courier/${testCourierId}/orders/${incidentOrderId}/status`)
      .set("Authorization", "Bearer test-courier-token-uuid-0001")
      .send({ status: "delivered", note: "Recibido por: Juan García" })
      .expect(200);

    expect(res.body.ok).toBe(true);

    const rows = await db.select()
      .from(deliveryOrderStatusHistoryTable)
      .where(eq(deliveryOrderStatusHistoryTable.orderId, incidentOrderId));

    const delivRow = rows.find(r => r.toStatus === "delivered");
    expect(delivRow).toBeTruthy();
    expect(delivRow?.note).toContain("Juan García");
  });

  it("rejects unknown status values from the driver app", async () => {
    if (!incidentOrderId) return;
    const res = await request(app)
      .patch(`/api/courier/${testCourierId}/orders/${incidentOrderId}/status`)
      .set("Authorization", "Bearer test-courier-token-uuid-0001")
      .send({ status: "rejected" })  // not allowed from driver app
      .expect(400);

    expect(res.body.error).toBeTruthy();
  });
});

// ── 7. Double-delivered idempotency — courier stats not inflated on replay ────
describeWithDatabase("Double-delivered idempotency via courier token endpoint", () => {
  let dblOrderId = "";

  beforeAll(async () => {
    if (!testProductId) return;

    const res = await request(app)
      .post("/api/delivery-orders")
      .set(authHeaders(token))
      .send({
        channel: "phone", deliveryType: "delivery",
        clientName: "Double Delivered Test", clientPhone: "699000099",
        items: [{ productId: testProductId, quantity: 1 }],
        paymentMethod: "cash",
        courierId: testCourierId,
        deliveryAddress: {
          street: "C/ Doble", number: "1", postalCode: "00001", city: "TestCity",
        },
      });
    dblOrderId = res.body?.id ?? "";
    if (dblOrderId) {
      await db.update(ordersTable)
        .set({ status: "in_delivery", orderNumber: `${TEST_PFX}DBL`, courierId: testCourierId } as any)
        .where(eq(ordersTable.id, dblOrderId));
    }
  }, 15_000);

  it("first delivered call succeeds", async () => {
    if (!dblOrderId) return;
    const res = await request(app)
      .patch(`/api/courier/${testCourierId}/orders/${dblOrderId}/status`)
      .set("Authorization", "Bearer test-courier-token-uuid-0001")
      .send({ status: "delivered" })
      .expect(200);
    expect(res.body.ok).toBe(true);
  });

  it("second delivered call returns OK without re-applying side effects", async () => {
    if (!dblOrderId) return;

    // Read courier stats after first delivery
    const [before] = await db.select().from(couriersTable).where(eq(couriersTable.id, testCourierId));
    const statsBefore = (before as any).totalDeliveries ?? 0;

    // Replay the same transition
    const res = await request(app)
      .patch(`/api/courier/${testCourierId}/orders/${dblOrderId}/status`)
      .set("Authorization", "Bearer test-courier-token-uuid-0001")
      .send({ status: "delivered" });

    // Either idempotent 200 or 409 conflict — both are acceptable; what must NOT happen is a 200 that inflates stats
    const [after] = await db.select().from(couriersTable).where(eq(couriersTable.id, testCourierId));
    const statsAfter = (after as any).totalDeliveries ?? 0;

    if (res.status === 200) {
      expect(res.body.idempotent).toBe(true);
    }
    // total_deliveries must not have been incremented a second time
    expect(statsAfter).toBe(statsBefore);
  });
});

// ── 8. Regression: courier stats update when staff marks delivered (no courierId in body) ──
describeWithDatabase("PATCH /api/delivery-orders/:id — staff marks delivered without courierId in body", () => {
  let regressionOrderId = "";
  let regressionCourierId = "";

  beforeAll(async () => {
    if (!testProductId) return;

    // Create a dedicated courier for this regression test
    const [c] = await db.insert(couriersTable).values({
      name: "TEST Regression Courier",
      phone: "699000088",
      vehicleType: "moto",
      status: "busy",  // starts as busy (delivering)
      totalDeliveries: 5,
    } as any).returning();
    regressionCourierId = c.id;

    // Create an order pre-assigned to this courier (simulate assign + dispatch flow)
    const res = await request(app)
      .post("/api/delivery-orders")
      .set(authHeaders(token))
      .send({
        channel: "phone", deliveryType: "delivery",
        clientName: "Regression Test Client", clientPhone: "699000088",
        items: [{ productId: testProductId, quantity: 1 }],
        paymentMethod: "cash",
        courierId: regressionCourierId,
        deliveryAddress: {
          street: "C/ Regresión", number: "1", postalCode: "00001", city: "TestCity",
        },
      });
    regressionOrderId = res.body?.id ?? "";
    if (regressionOrderId) {
      // Mark as in_delivery to simulate dispatch
      await db.update(ordersTable)
        .set({ status: "in_delivery", orderNumber: `${TEST_PFX}REG` } as any)
        .where(eq(ordersTable.id, regressionOrderId));
    }
  }, 15_000);

  afterAll(async () => {
    await db.delete(couriersTable)
      .where(eq(couriersTable.id, regressionCourierId)).catch(() => {});
  });

  it("marks delivered WITHOUT courierId in body and courier transitions to available with incremented stats", async () => {
    if (!regressionOrderId || !regressionCourierId) return;

    // Staff marks delivered — no courierId in the PATCH body
    await request(app)
      .patch(`/api/delivery-orders/${regressionOrderId}`)
      .set(authHeaders(token))
      .send({ status: "delivered" })  // no courierId — must resolve from order record
      .expect(200);

    // Courier should now be available (not stuck as busy)
    const [courier] = await db.select()
      .from(couriersTable)
      .where(eq(couriersTable.id, regressionCourierId));

    expect(courier.status).toBe("available");
    // total_deliveries must have been incremented
    expect((courier as any).totalDeliveries).toBe(6);

    // Order status must be delivered
    const [ord] = await db.select({ status: ordersTable.status })
      .from(ordersTable).where(eq(ordersTable.id, regressionOrderId));
    expect(ord.status).toBe("delivered");
  });
});
