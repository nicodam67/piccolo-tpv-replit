import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import {
  categoriesTable,
  db,
  onlineOrderAuditTable,
  orderItemsTable,
  ordersTable,
  productsTable,
} from "@workspace/db";
import app from "../app";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const categoryId = "38000000-0000-4000-8000-000000000001";
const productId = "38000000-0000-4000-8000-000000000002";
const idempotencyKey = "entrega38-online-atomic-key";

describeWithDatabase("online order atomicity and idempotency", () => {
  beforeAll(async () => {
    await db.insert(categoriesTable).values({
      id: categoryId,
      name: "Entrega 38 atomic",
      active: true,
      sortOrder: 38,
    }).onConflictDoNothing();
    await db.insert(productsTable).values({
      id: productId,
      categoryId,
      name: "Producto atómico",
      price: "12.00",
      taxRate: 10,
      active: true,
      outOfStock: false,
      sortOrder: 38,
    }).onConflictDoNothing();
  });

  afterAll(async () => {
    const orders = await db.select({ id: ordersTable.id }).from(ordersTable)
      .where(eq(ordersTable.idempotencyKey, idempotencyKey));
    const ids = orders.map((order) => order.id);
    if (ids.length) {
      await db.delete(onlineOrderAuditTable).where(inArray(onlineOrderAuditTable.orderId, ids));
      await db.delete(orderItemsTable).where(inArray(orderItemsTable.orderId, ids));
      await db.delete(ordersTable).where(inArray(ordersTable.id, ids));
    }
    await db.delete(productsTable).where(eq(productsTable.id, productId));
    await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
  });

  it("commits one complete order for concurrent requests with the same key", async () => {
    const body = {
      deliveryType: "takeaway",
      channel: "qr",
      clientName: "Cliente atómico",
      clientPhone: "600000038",
      paymentMethod: "on_arrival",
      idempotencyKey,
      items: [{ productId, quantity: 2 }],
    };
    const [first, second] = await Promise.all([
      request(app).post("/api/public/orders/online-v2").send(body),
      request(app).post("/api/public/orders/online-v2").send(body),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.body.orderId).toBe(second.body.orderId);

    const [order] = await db.select().from(ordersTable)
      .where(eq(ordersTable.idempotencyKey, idempotencyKey));
    expect(order).toBeTruthy();
    const items = await db.select().from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, order.id));
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(2);
    const audits = await db.select().from(onlineOrderAuditTable).where(and(
      eq(onlineOrderAuditTable.orderId, order.id),
      eq(onlineOrderAuditTable.event, "order_created"),
    ));
    expect(audits).toHaveLength(1);
  });
});
