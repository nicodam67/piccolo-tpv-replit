import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import app from "../app";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const employeeId = "65000000-0000-4000-8000-000000000001";
const fingerprint = "entrega65-offline-cash-device";
const idempotencyKey = "entrega65-offline-cash-command";
let token = "";

async function cleanup() {
  const devices = await pool.query<{ id: string }>(
    "SELECT id FROM offline_devices WHERE fingerprint = $1",
    [fingerprint],
  );
  const ids = devices.rows.map((row) => row.id);
  if (ids.length) {
    await pool.query("DELETE FROM device_audit_log WHERE device_id = ANY($1::uuid[])", [ids]);
    await pool.query("DELETE FROM offline_queue WHERE device_id = ANY($1::uuid[])", [ids]);
    await pool.query("DELETE FROM offline_devices WHERE id = ANY($1::uuid[])", [ids]);
  }
  await pool.query("DELETE FROM employees WHERE id = $1", [employeeId]);
}

describeWithDatabase("offline cash payment fail-closed contract", () => {
  beforeAll(async () => {
    await cleanup();
    await pool.query(
      `INSERT INTO employees (id, name, role, active)
       VALUES ($1, 'Entrega 65 Offline', 'admin', false)`,
      [employeeId],
    );
    token = jwt.sign(
      { id: employeeId, name: "Entrega 65 Offline", role: "admin", jti: "e65-offline" },
      process.env.SESSION_SECRET ?? "test-secret",
    );
    const registered = await request(app)
      .post("/api/offline/devices")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Entrega 65 Device", fingerprint, deviceType: "tpv" });
    expect(registered.status).toBe(201);
  });

  afterAll(cleanup);

  it("records unsupported offline cash as failed without financial effects", async () => {
    const before = await pool.query<{ count: string }>("SELECT count(*) FROM payments");
    const sync = () => request(app)
      .post("/api/offline/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({
        deviceId: fingerprint,
        operations: [{
          idempotencyKey,
          operationType: "cash_payment",
          payload: { orderId: "not-authoritative", amount: "25.00" },
        }],
      });

    const first = await sync();
    const retry = await sync();
    expect(first.status).toBe(200);
    expect(first.body.results).toEqual([{
      idempotencyKey,
      status: "failed",
      error: "offline_cash_payment_unsupported",
    }]);
    expect(retry.body.results[0]?.status).toBe("failed");

    const after = await pool.query<{ count: string }>("SELECT count(*) FROM payments");
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    const queued = await pool.query<{ status: string; last_error: string }>(
      `SELECT status, last_error FROM offline_queue WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    expect(queued.rows).toEqual([{
      status: "failed",
      last_error: "offline_cash_payment_unsupported",
    }]);
  });
});
