import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import app from "../app";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const employeeId = "66000000-0000-4000-8000-000000000001";
const code = "plancha_e66";
let printerId = "";
let departmentId = "";
let adminToken = "";
let waiterToken = "";

const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });

async function cleanup() {
  await pool.query("DELETE FROM production_departments WHERE code = $1", [code]);
  if (printerId) {
    await pool.query("DELETE FROM print_audit WHERE actor_id = $1", [employeeId]);
    await pool.query("DELETE FROM printers WHERE id = $1", [printerId]);
  }
  await pool.query("DELETE FROM employees WHERE id = $1", [employeeId]);
}

describeWithDatabase("dynamic production departments", () => {
  beforeAll(async () => {
    await cleanup();
    await pool.query(
      `INSERT INTO employees (id, name, role, active)
       VALUES ($1, 'E66 Production Admin', 'admin', false)`,
      [employeeId],
    );
    const secret = process.env.SESSION_SECRET ?? "test-secret";
    adminToken = jwt.sign(
      { id: employeeId, name: "E66 Admin", role: "admin", jti: "e66-admin" },
      secret,
    );
    waiterToken = jwt.sign(
      { id: employeeId, name: "E66 Waiter", role: "waiter", jti: "e66-waiter" },
      secret,
    );
    const printer = await request(app).post("/api/admin/printers").set(auth()).send({
      name: "E66 Printer",
      type: "cocina",
      connectorMode: "simulator",
      active: true,
    });
    expect(printer.status).toBe(201);
    printerId = printer.body.id;
  });

  afterAll(cleanup);

  it("seeds the five owner departments and compatibility zone", async () => {
    const list = await request(app).get("/api/production-departments").set(auth(waiterToken));
    expect(list.status).toBe(200);
    expect(list.body.map((row: { code: string }) => row.code))
      .toEqual(expect.arrayContaining(["cocina", "pizza", "ensalada", "barra", "pase", "sin_partida"]));
  });

  it("creates and configures a new department without code changes", async () => {
    const denied = await request(app)
      .post("/api/admin/production-departments")
      .set(auth(waiterToken))
      .send({ code, name: "Plancha" });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post("/api/admin/production-departments")
      .set(auth())
      .send({
        code,
        name: "Plancha",
        outputMode: "both",
        workflowProfile: "standard",
        printerIds: [printerId],
        sortOrder: 45,
      });
    expect(created.status).toBe(201);
    departmentId = created.body.id;
    expect(created.body).toMatchObject({
      code,
      outputMode: "both",
      printerIds: [printerId],
    });

    const kds = await request(app).get(`/api/kds/${code}`).set(auth(waiterToken));
    expect(kds.status).toBe(200);
    expect(kds.body).toEqual([]);

    const patched = await request(app)
      .patch(`/api/admin/production-departments/${departmentId}`)
      .set(auth())
      .send({ outputMode: "printer", name: "Plancha caliente" });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({
      name: "Plancha caliente",
      outputMode: "printer",
    });
  });

  it("soft-deactivates an unused department", async () => {
    const deleted = await request(app)
      .delete(`/api/admin/production-departments/${departmentId}`)
      .set(auth());
    expect(deleted.status).toBe(200);
    expect(deleted.body.active).toBe(false);
  });
});
