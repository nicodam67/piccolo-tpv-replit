import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import app from "../app";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const terminalPrefix = "E63-RACE-";
let employeeId = "";
let cashMethodId = "";

function token(role = "admin") {
  return jwt.sign(
    { id: employeeId, name: `E63 ${role}`, role, jti: randomUUID() },
    process.env.SESSION_SECRET ?? "test-secret",
  );
}

function auth(role = "admin") {
  return { Authorization: `Bearer ${token(role)}` };
}

async function cleanup() {
  const sessions = await pool.query<{ id: string }>(
    "SELECT id FROM cash_sessions WHERE terminal_name LIKE $1",
    [`${terminalPrefix}%`],
  );
  const sessionIds = sessions.rows.map((row) => row.id);
  const orders = await pool.query<{ id: string }>(
    "SELECT id FROM orders WHERE opened_by_terminal LIKE $1",
    [`${terminalPrefix}%`],
  );
  const orderIds = orders.rows.map((row) => row.id);
  const payments = orderIds.length
    ? await pool.query<{ id: string }>(
      "SELECT id FROM payments WHERE order_id = ANY($1::uuid[])",
      [orderIds],
    )
    : { rows: [] };
  const paymentIds = payments.rows.map((row) => row.id);

  if (paymentIds.length) {
    await pool.query("DELETE FROM payment_voids WHERE original_payment_id = ANY($1::uuid[])", [paymentIds]);
    await pool.query("DELETE FROM entrega63_targets WHERE kind = 'void' AND resource = ANY($1::text[])", [paymentIds]);
    await pool.query("DELETE FROM payments WHERE id = ANY($1::uuid[])", [paymentIds]);
  }
  if (sessionIds.length) {
    await pool.query("DELETE FROM cash_movements WHERE cash_session_id = ANY($1::uuid[])", [sessionIds]);
    await pool.query("DELETE FROM document_audit_log WHERE document_id = ANY($1::text[])", [sessionIds]);
    await pool.query("DELETE FROM cash_sessions WHERE id = ANY($1::uuid[])", [sessionIds]);
  }
  if (orderIds.length) {
    await pool.query("DELETE FROM document_audit_log WHERE document_id = ANY($1::text[])", [orderIds]);
    await pool.query("DELETE FROM orders WHERE id = ANY($1::uuid[])", [orderIds]);
  }
  if (paymentIds.length) {
    await pool.query("DELETE FROM document_audit_log WHERE document_id = ANY($1::text[])", [paymentIds]);
  }
  await pool.query("DELETE FROM idempotency_keys WHERE cache_key LIKE $1", ["%:e63-%"]);
  await pool.query("DELETE FROM entrega63_probe");
}

describeWithDatabase("Cash & Payments PostgreSQL concurrency", () => {
  beforeAll(async () => {
    const employee = await pool.query<{ id: string }>(
      "SELECT id FROM employees WHERE active = true ORDER BY created_at LIMIT 1",
    );
    if (!employee.rows[0]) throw new Error("E63 requires one active employee fixture");
    employeeId = employee.rows[0].id;
    const method = await pool.query<{ id: string }>(
      "SELECT id FROM payment_methods WHERE code = 'cash' LIMIT 1",
    );
    if (!method.rows[0]) throw new Error("E63 requires the seeded cash payment method");
    cashMethodId = method.rows[0].id;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS entrega63_probe (
        kind text NOT NULL,
        backend_pid integer NOT NULL,
        resource text NOT NULL,
        observed_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS entrega63_targets (
        kind text NOT NULL,
        resource text NOT NULL,
        PRIMARY KEY (kind, resource)
      );
      CREATE OR REPLACE FUNCTION entrega63_delay_cash_open() RETURNS trigger AS $$
      BEGIN
        IF NEW.terminal_name LIKE 'E63-RACE-%' THEN
          INSERT INTO entrega63_probe(kind, backend_pid, resource)
          VALUES ('open', pg_backend_pid(), NEW.terminal_name);
          PERFORM pg_sleep(0.5);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS entrega63_delay_cash_open_trigger ON cash_sessions;
      CREATE TRIGGER entrega63_delay_cash_open_trigger
        BEFORE INSERT ON cash_sessions
        FOR EACH ROW EXECUTE FUNCTION entrega63_delay_cash_open();

      CREATE OR REPLACE FUNCTION entrega63_delay_payment_void() RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'voided' AND EXISTS (
          SELECT 1 FROM entrega63_targets
          WHERE kind = 'void' AND resource = OLD.id::text
        ) THEN
          INSERT INTO entrega63_probe(kind, backend_pid, resource)
          VALUES ('void', pg_backend_pid(), OLD.id::text);
          PERFORM pg_sleep(0.5);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS entrega63_delay_payment_void_trigger ON payments;
      CREATE TRIGGER entrega63_delay_payment_void_trigger
        BEFORE UPDATE ON payments
        FOR EACH ROW EXECUTE FUNCTION entrega63_delay_payment_void();
    `);
  });

  beforeEach(cleanup);

  afterAll(async () => {
    await cleanup();
    await pool.query(`
      DROP TRIGGER IF EXISTS entrega63_delay_cash_open_trigger ON cash_sessions;
      DROP TRIGGER IF EXISTS entrega63_delay_payment_void_trigger ON payments;
      DROP FUNCTION IF EXISTS entrega63_delay_cash_open();
      DROP FUNCTION IF EXISTS entrega63_delay_payment_void();
      DROP TABLE IF EXISTS entrega63_targets;
      DROP TABLE IF EXISTS entrega63_probe;
    `);
  });

  it("serializes two real concurrent openings for the same terminal", async () => {
    const terminalName = `${terminalPrefix}OPEN`;
    const responsesPromise = Promise.all([
      request(app).post("/api/cash-sessions/open").set(auth()).send({ terminalName, openingFloat: "100.00" }),
      request(app).post("/api/cash-sessions/open").set(auth()).send({ terminalName, openingFloat: "100.00" }),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expectTwoConcurrentDatabaseBackends();
    const responses = await responsesPromise;

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const sessions = await pool.query(
      "SELECT id FROM cash_sessions WHERE terminal_name = $1 AND status = 'open'",
      [terminalName],
    );
    expect(sessions.rowCount).toBe(1);
    const probes = await pool.query(
      "SELECT DISTINCT backend_pid FROM entrega63_probe WHERE kind = 'open' AND resource = $1",
      [terminalName],
    );
    expect(probes.rowCount).toBe(1);
    const audits = await pool.query(
      "SELECT id FROM document_audit_log WHERE action = 'open_cash_session' AND document_id = $1",
      [sessions.rows[0].id],
    );
    expect(audits.rowCount).toBe(1);
  });

  it("allows one void effect and conflicts the concurrent distinct command", async () => {
    const fixture = await createVoidFixture();
    await pool.query(
      "INSERT INTO entrega63_targets(kind, resource) VALUES ('void', $1)",
      [fixture.paymentId],
    );

    const responsesPromise = Promise.all([
      request(app)
        .post(`/api/cash-sessions/${fixture.sessionId}/void-payment`)
        .set(auth())
        .set("Idempotency-Key", "e63-void-command-a")
        .send({ paymentId: fixture.paymentId, reason: "Anulación concurrente E63" }),
      request(app)
        .post(`/api/cash-sessions/${fixture.sessionId}/void-payment`)
        .set(auth())
        .set("Idempotency-Key", "e63-void-command-b")
        .send({ paymentId: fixture.paymentId, reason: "Anulación concurrente E63" }),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expectTwoConcurrentDatabaseBackends();
    const responses = await responsesPromise;

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    await expectSingleVoidEffects(fixture);
    const probes = await pool.query(
      "SELECT DISTINCT backend_pid FROM entrega63_probe WHERE kind = 'void' AND resource = $1",
      [fixture.paymentId],
    );
    expect(probes.rowCount).toBe(1);
  });

  it("replays one concurrent void command with the same idempotency key", async () => {
    const fixture = await createVoidFixture();
    await pool.query(
      "INSERT INTO entrega63_targets(kind, resource) VALUES ('void', $1)",
      [fixture.paymentId],
    );
    const command = () => request(app)
      .post(`/api/cash-sessions/${fixture.sessionId}/void-payment`)
      .set(auth())
      .set("Idempotency-Key", "e63-void-same-command")
      .send({ paymentId: fixture.paymentId, reason: "Anulación idempotente E63" });

    const responses = await Promise.all([command(), command()]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    expect(responses.some((response) => response.headers["idempotency-replayed"] === "true")).toBe(true);
    await expectSingleVoidEffects(fixture);
  });

  it("enforces the split endpoint role matrix without breaking authenticated reads", async () => {
    const orderId = randomUUID();
    const groupId = randomUUID();
    const roles = ["admin", "manager", "encargado", "waiter", "cashier", "kitchen"];

    expect((await request(app).get(`/api/orders/${orderId}/splits`)).status).toBe(401);
    expect((await request(app)
      .get(`/api/orders/${orderId}/splits`)
      .set("Authorization", "Bearer invalid-token")).status).toBe(401);

    for (const role of roles) {
      const read = await request(app).get(`/api/orders/${orderId}/splits`).set(auth(role));
      expect(read.status, `GET split as ${role}`).toBe(200);
    }

    for (const role of ["admin", "manager", "encargado", "cashier"]) {
      const create = await request(app)
        .post(`/api/orders/${orderId}/splits`)
        .set(auth(role))
        .send({ groups: [{ label: "A", items: [] }] });
      expect(create.status, `POST split as ${role}`).toBe(404);
    }
    for (const role of ["waiter", "kitchen"]) {
      const create = await request(app)
        .post(`/api/orders/${orderId}/splits`)
        .set(auth(role))
        .send({ groups: [{ label: "A", items: [] }] });
      expect(create.status, `POST split as ${role}`).toBe(403);
    }

    for (const role of ["admin", "manager", "encargado", "waiter", "cashier"]) {
      const pay = await request(app)
        .put(`/api/orders/${orderId}/splits/${groupId}/pay`)
        .set(auth(role))
        .send({});
      expect(pay.status, `PUT split payment as ${role}`).toBe(404);
    }
    const kitchenPay = await request(app)
      .put(`/api/orders/${orderId}/splits/${groupId}/pay`)
      .set(auth("kitchen"))
      .send({});
    expect(kitchenPay.status).toBe(403);
  });
});

async function createVoidFixture() {
  const sessionId = randomUUID();
  const orderId = randomUUID();
  const paymentId = randomUUID();
  await pool.query(
    `INSERT INTO cash_sessions
      (id, employee_id, opening_float, terminal_name, status)
     VALUES ($1, $2, '100.00', $3, 'open')`,
    [sessionId, employeeId, `${terminalPrefix}VOID-${paymentId}`],
  );
  await pool.query(
    `INSERT INTO orders (id, employee_id, opened_by_terminal, status)
     VALUES ($1, $2, $3, 'open')`,
    [orderId, employeeId, `${terminalPrefix}ORDER-${paymentId}`],
  );
  await pool.query(
    `INSERT INTO payments
      (id, order_id, cash_session_id, payment_method_id, amount, status, employee_id)
     VALUES ($1, $2, $3, $4, '25.00', 'completed', $5)`,
    [paymentId, orderId, sessionId, cashMethodId, employeeId],
  );
  return { sessionId, orderId, paymentId };
}

async function expectSingleVoidEffects(fixture: {
  sessionId: string;
  paymentId: string;
}) {
  const payment = await pool.query<{ status: string }>(
    "SELECT status FROM payments WHERE id = $1",
    [fixture.paymentId],
  );
  expect(payment.rows[0]?.status).toBe("voided");
  const voids = await pool.query(
    "SELECT id FROM payment_voids WHERE original_payment_id = $1",
    [fixture.paymentId],
  );
  expect(voids.rowCount).toBe(1);
  const movements = await pool.query(
    `SELECT id FROM cash_movements
     WHERE cash_session_id = $1 AND reason = $2`,
    [fixture.sessionId, "Anulación de pago: Anulación concurrente E63"],
  );
  const idempotentMovements = await pool.query(
    `SELECT id FROM cash_movements
     WHERE cash_session_id = $1 AND reason = $2`,
    [fixture.sessionId, "Anulación de pago: Anulación idempotente E63"],
  );
  expect((movements.rowCount ?? 0) + (idempotentMovements.rowCount ?? 0)).toBe(1);
  const audits = await pool.query(
    "SELECT id FROM document_audit_log WHERE action = 'void_payment' AND document_id = $1",
    [fixture.paymentId],
  );
  expect(audits.rowCount).toBe(1);
}

async function expectTwoConcurrentDatabaseBackends() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const active = await pool.query<{ pid: number }>(`
      SELECT DISTINCT pid
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND state = 'active'
    `);
    if (active.rows.length >= 2) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Expected two concurrent PostgreSQL backend connections");
}
