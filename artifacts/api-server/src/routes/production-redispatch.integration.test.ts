import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import app from "../app";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const employeeId = "66000000-0000-4000-8000-000000000002";
const ids = {
  category: randomUUID(),
  product: randomUUID(),
  order: randomUUID(),
  item: randomUUID(),
  task: randomUUID(),
  printerA: randomUUID(),
  printerB: randomUUID(),
  originalJob: randomUUID(),
};
let token = "";

async function cleanup() {
  await pool.query("DELETE FROM idempotency_keys WHERE cache_key LIKE $1", [
    `${employeeId}:e66-%`,
  ]);
  await pool.query(
    "DELETE FROM print_audit WHERE print_queue_id IN (SELECT id FROM print_queue WHERE actor_id = $1)",
    [employeeId],
  );
  await pool.query("DELETE FROM print_audit WHERE actor_id = $1", [employeeId]);
  await pool.query("DELETE FROM print_queue WHERE actor_id = $1", [employeeId]);
  await pool.query("DELETE FROM kitchen_tasks WHERE id = $1", [ids.task]);
  await pool.query("DELETE FROM order_items WHERE id = $1", [ids.item]);
  await pool.query("DELETE FROM orders WHERE id = $1", [ids.order]);
  await pool.query("DELETE FROM products WHERE id = $1", [ids.product]);
  await pool.query("DELETE FROM categories WHERE id = $1", [ids.category]);
  await pool.query("DELETE FROM printers WHERE id = ANY($1::uuid[])", [[ids.printerA, ids.printerB]]);
  await pool.query("DELETE FROM employees WHERE id = $1", [employeeId]);
}

describeWithDatabase("production redispatch", () => {
  beforeAll(async () => {
    await cleanup();
    await pool.query(
      `INSERT INTO employees (id, name, role, active)
       VALUES ($1, 'E66 Redispatch Admin', 'admin', false)`,
      [employeeId],
    );
    await pool.query("INSERT INTO categories (id, name) VALUES ($1, 'E66 Category')", [ids.category]);
    await pool.query(
      `INSERT INTO products (id, category_id, name, price, prep_zone)
       VALUES ($1, $2, 'E66 Product', '10.00', 'cocina')`,
      [ids.product, ids.category],
    );
    await pool.query(
      `INSERT INTO orders (id, employee_id, status) VALUES ($1, $2, 'sent')`,
      [ids.order, employeeId],
    );
    await pool.query(
      `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, status)
       VALUES ($1, $2, $3, 2, '10.00', 'sent')`,
      [ids.item, ids.order, ids.product],
    );
    await pool.query(
      `INSERT INTO kitchen_tasks
        (id, order_id, order_item_id, prep_zone, product_name, quantity, status, notes)
       VALUES ($1, $2, $3, 'cocina', 'E66 Product', 2, 'ready', 'Sin cebolla')`,
      [ids.task, ids.order, ids.item],
    );
    await pool.query(
      `INSERT INTO printers
        (id, name, type, connector_mode, active)
       VALUES ($1, 'E66 Printer A', 'cocina', 'simulator', true),
              ($2, 'E66 Printer B', 'cocina', 'simulator', true)`,
      [ids.printerA, ids.printerB],
    );
    await pool.query(
      `INSERT INTO print_queue
        (id, printer_id, document_type, content, status, actor_id, actor_name)
       VALUES ($1, $2, 'kitchen_ticket', 'Ticket original', 'printed', $3, 'E66 Admin')`,
      [ids.originalJob, ids.printerA, employeeId],
    );
    token = jwt.sign(
      { id: employeeId, name: "E66 Admin", role: "admin", jti: "e66-redispatch" },
      process.env.SESSION_SECRET ?? "test-secret",
    );
  });

  afterAll(cleanup);

  it("reprints to another printer with visible mark and destination audit", async () => {
    const response = await request(app)
      .post("/api/production/redispatch")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "e66-reprint-other-printer")
      .send({
        sourceType: "print_job",
        sourceId: ids.originalJob,
        targets: ["printer"],
        printerId: ids.printerB,
        reason: "Papel agotado en primaria",
      });
    expect(response.status).toBe(201);
    expect(response.body.job).toMatchObject({
      printerId: ids.printerB,
      documentType: "reprint",
      priority: 10,
    });
    expect(response.body.job.content).toContain("REIMPRESIÓN");
    expect(response.body.audit.detail).toMatchObject({
      targets: ["printer"],
      destination: {
        printerId: ids.printerB,
        printerName: "E66 Printer B",
      },
    });
  });

  it("resends one task simultaneously to KDS and printer", async () => {
    const response = await request(app)
      .post("/api/production/redispatch")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "e66-resend-both")
      .send({
        sourceType: "kitchen_task",
        sourceId: ids.task,
        targets: ["kds", "printer"],
        printerId: ids.printerB,
        reason: "Cocina solicita copia",
      });
    expect(response.status).toBe(201);
    expect(response.body.task).toMatchObject({
      id: ids.task,
      status: "new",
      resendCount: 1,
      resentReason: "Cocina solicita copia",
    });
    expect(response.body.job.content).toContain("*** REENVIADO ***");
    expect(response.body.audit).toMatchObject({
      actorId: employeeId,
      action: "redispatched",
    });
  });

  it("does not partially reset KDS when the printer destination is invalid", async () => {
    await pool.query(
      "UPDATE kitchen_tasks SET status = 'ready' WHERE id = $1",
      [ids.task],
    );
    const response = await request(app)
      .post("/api/production/redispatch")
      .set("Authorization", `Bearer ${token}`)
      .send({
        sourceType: "kitchen_task",
        sourceId: ids.task,
        targets: ["kds", "printer"],
        printerId: randomUUID(),
      });
    expect(response.status).toBe(400);
    const task = await pool.query<{ status: string; resend_count: number }>(
      "SELECT status, resend_count FROM kitchen_tasks WHERE id = $1",
      [ids.task],
    );
    expect(task.rows[0]).toEqual({ status: "ready", resend_count: 1 });
  });

  it("keeps arbitrary print-job reprints restricted to managers", async () => {
    const waiterToken = jwt.sign(
      { id: employeeId, name: "E66 Waiter", role: "waiter", jti: "e66-waiter" },
      process.env.SESSION_SECRET ?? "test-secret",
    );
    const response = await request(app)
      .post("/api/production/redispatch")
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({
        sourceType: "print_job",
        sourceId: ids.originalJob,
        targets: ["printer"],
      });
    expect(response.status).toBe(403);
  });

  it("replays a legacy reprint without creating duplicate jobs", async () => {
    const reprint = () => request(app)
      .post(`/api/admin/print-queue/${ids.originalJob}/reprint`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "e66-legacy-reprint")
      .send({ reason: "Respuesta perdida" });
    const [first, replay] = await Promise.all([reprint(), reprint()]);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(first.body.id).toBe(replay.body.id);
    expect([first, replay].some((response) =>
      response.headers["idempotency-replayed"] === "true")).toBe(true);
    const jobs = await pool.query<{ count: string }>(
      `SELECT count(*) FROM print_queue
       WHERE meta->>'originalJobId' = $1 AND meta->>'reason' = 'Respuesta perdida'`,
      [ids.originalJob],
    );
    expect(Number(jobs.rows[0].count)).toBe(1);
  });
});
