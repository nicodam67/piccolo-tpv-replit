import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import app from "../app";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const prefix = "E67-FLEET-";
const categoryId = randomUUID();
const productId = randomUUID();
const orders = Array.from({ length: 7 }, (_, index) => ({
  employeeId: `67000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  orderId: randomUUID(),
  itemId: randomUUID(),
  deviceRef: `D${index + 1}`,
}));
let previousPrintModes: Array<{ id: string; print_mode: string }> = [];

async function cleanup() {
  const fixtureOrderRows = await pool.query<{ id: string }>(
    "SELECT id FROM orders WHERE employee_id = ANY($1::uuid[])",
    [orders.map((row) => row.employeeId)],
  );
  const fixtureOrderIds = [...new Set([
    ...orders.map((row) => row.orderId),
    ...fixtureOrderRows.rows.map((row) => row.id),
  ])];
  await pool.query(
    "DELETE FROM idempotency_keys WHERE cache_key LIKE $1",
    ["%:e67-fleet-%"],
  );
  await pool.query(
    "DELETE FROM kitchen_tasks WHERE order_id = ANY($1::uuid[])",
    [fixtureOrderIds],
  );
  await pool.query(
    "DELETE FROM order_items WHERE id = ANY($1::uuid[])",
    [orders.map((row) => row.itemId)],
  );
  await pool.query(
    "DELETE FROM order_items WHERE order_id = ANY($1::uuid[])",
    [fixtureOrderIds],
  );
  await pool.query(
    "DELETE FROM audit_log WHERE order_id = ANY($1::uuid[])",
    [fixtureOrderIds],
  );
  await pool.query(
    "DELETE FROM orders WHERE id = ANY($1::uuid[])",
    [fixtureOrderIds],
  );
  await pool.query("DELETE FROM products WHERE id = $1", [productId]);
  await pool.query("DELETE FROM categories WHERE id = $1", [categoryId]);
  await pool.query(
    "DELETE FROM employees WHERE id = ANY($1::uuid[])",
    [orders.map((row) => row.employeeId)],
  );
}

describeWithDatabase("seven-device software readiness", () => {
  beforeAll(async () => {
    await cleanup();
    const configs = await pool.query<{ id: string; print_mode: string }>(
      "SELECT id, print_mode FROM business_config ORDER BY id",
    );
    previousPrintModes = configs.rows;
    if (!configs.rowCount) {
      await pool.query(
        `INSERT INTO business_config
          (nombre_comercial, razon_social, nif, direccion_fiscal, setup_completed, print_mode)
         VALUES ('E67 Fleet', 'E67 Fleet SL', 'B00000067', 'Staging', true, 'kds_only')`,
      );
    } else {
      await pool.query("UPDATE business_config SET print_mode = 'kds_only'");
    }
    await pool.query("INSERT INTO categories (id, name) VALUES ($1, $2)", [categoryId, `${prefix}Category`]);
    await pool.query(
      `INSERT INTO products (id, category_id, name, price, prep_zone, active)
       VALUES ($1, $2, $3, '10.00', 'cocina', true)`,
      [productId, categoryId, `${prefix}Product`],
    );
    for (const [index, fixture] of orders.entries()) {
      await pool.query(
        `INSERT INTO employees (id, name, role, active)
         VALUES ($1, $2, 'waiter', false)`,
        [fixture.employeeId, `${prefix}${fixture.deviceRef}`],
      );
      await pool.query(
        `INSERT INTO orders (id, employee_id, status, opened_by_terminal)
         VALUES ($1, $2, 'open', $3)`,
        [fixture.orderId, fixture.employeeId, fixture.deviceRef],
      );
      await pool.query(
        `INSERT INTO order_items
          (id, order_id, product_id, quantity, unit_price, status)
         VALUES ($1, $2, $3, 1, '10.00', 'draft')`,
        [fixture.itemId, fixture.orderId, productId],
      );
      void index;
    }
  });

  afterAll(async () => {
    await cleanup();
    if (previousPrintModes.length) {
      for (const config of previousPrintModes) {
        await pool.query(
          "UPDATE business_config SET print_mode = $1 WHERE id = $2",
          [config.print_mode, config.id],
        );
      }
    } else {
      await pool.query("DELETE FROM business_config WHERE nombre_comercial = 'E67 Fleet'");
    }
  });

  it("sends seven isolated orders concurrently without lost or duplicate KDS tasks", async () => {
    const secret = process.env.SESSION_SECRET ?? "test-secret";
    const responses = await Promise.all(orders.map((fixture) => {
      const token = jwt.sign({
        id: fixture.employeeId,
        name: fixture.deviceRef,
        role: "waiter",
        jti: `e67-${fixture.deviceRef}`,
      }, secret);
      return request(app)
        .post(`/api/orders/${fixture.orderId}/send`)
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", `e67-fleet-${fixture.deviceRef}`)
        .send({});
    }));
    expect(responses.map((response) => response.status)).toEqual(Array(7).fill(200));

    const tasks = await pool.query<{ order_id: string; count: string }>(
      `SELECT order_id, count(*) FROM kitchen_tasks
       WHERE order_id = ANY($1::uuid[])
       GROUP BY order_id ORDER BY order_id`,
      [orders.map((row) => row.orderId)],
    );
    expect(tasks.rows).toHaveLength(7);
    expect(tasks.rows.every((row) => Number(row.count) === 1)).toBe(true);
    const sent = await pool.query<{ count: string }>(
      "SELECT count(*) FROM orders WHERE id = ANY($1::uuid[]) AND status = 'sent'",
      [orders.map((row) => row.orderId)],
    );
    expect(Number(sent.rows[0].count)).toBe(7);
  });
});
