import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import app from "../app";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const secret = process.env.SESSION_SECRET ?? "test-secret";
const fixtures = {
  admin: { id: "68000000-0000-4000-8000-000000000001", name: "E68 Admin", role: "admin" },
  manager: { id: "68000000-0000-4000-8000-000000000002", name: "E68 Manager", role: "manager" },
  waiter: { id: "68000000-0000-4000-8000-000000000003", name: "E68 Waiter", role: "waiter" },
};

function token(user: typeof fixtures.admin) {
  return jwt.sign({ ...user, jti: `e68-${user.role}` }, secret);
}

async function cleanup() {
  await pool.query("DELETE FROM idempotency_keys WHERE cache_key LIKE '%e68-assistant%'");
  await pool.query("DELETE FROM installation_tests WHERE test_type LIKE 'entrega67:%' AND performed_by LIKE 'E68 %'");
  await pool.query("DELETE FROM installation_tests WHERE test_type = 'e68-forged-actor'");
  await pool.query("DELETE FROM tech_events WHERE code IN ('E68_CERTIFICATION_STATUS', 'E68_CERTIFICATION_EXPORT')");
  await pool.query("DELETE FROM installation_devices WHERE name = 'E68 Main Computer'");
  await pool.query(
    "DELETE FROM employees WHERE id = ANY($1::uuid[])",
    [Object.values(fixtures).map((entry) => entry.id)],
  );
}

describeWithDatabase("installation assistant and certification", () => {
  beforeAll(async () => {
    await cleanup();
    for (const user of Object.values(fixtures)) {
      await pool.query(
        "INSERT INTO employees (id, name, role, active) VALUES ($1, $2, $3, false)",
        [user.id, user.name, user.role],
      );
    }
    await pool.query(
      `INSERT INTO installation_devices
        (name, device_category, ip_local, connection_type, status)
       VALUES ('E68 Main Computer', 'main_computer', '192.168.68.10', 'cable', 'ready')`,
    );
  });

  afterAll(cleanup);

  it("protects the assistant and returns the seven guided steps plus 39 cases", async () => {
    expect((await request(app).get("/api/admin/installation/assistant")).status).toBe(401);
    expect((await request(app)
      .get("/api/admin/installation/assistant")
      .set("Authorization", `Bearer ${token(fixtures.waiter)}`)).status).toBe(403);
    const response = await request(app)
      .get("/api/admin/installation/assistant")
      .set("Authorization", `Bearer ${token(fixtures.manager)}`);
    expect(response.status).toBe(200);
    expect(response.body.steps).toHaveLength(7);
    expect(response.body.certification.cases).toHaveLength(39);
    expect(response.body.diagnostics.database.status).toBe("ready");
    expect(JSON.stringify(response.body)).not.toContain("192.168.68.10");
  });

  it("records an idempotent operator attestation with server-owned identity", async () => {
    const response = await request(app)
      .post("/api/admin/installation/certification/PRINT-LONG")
      .set("Authorization", `Bearer ${token(fixtures.manager)}`)
      .set("Idempotency-Key", "e68-assistant-print-long")
      .send({
        status: "passed",
        notes: "Ticket completo 192.168.68.20",
        performedBy: "Forged Actor",
        evidence: [{ token: "must-not-leak", photoRef: "offline-photo-1" }],
      });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      caseId: "PRINT-LONG",
      status: "passed",
      performedBy: fixtures.manager.name,
    });
    expect(response.body.notes).not.toContain("192.168.68.20");

    const replay = await request(app)
      .post("/api/admin/installation/certification/PRINT-LONG")
      .set("Authorization", `Bearer ${token(fixtures.manager)}`)
      .set("Idempotency-Key", "e68-assistant-print-long")
      .send({ status: "passed", notes: "different" });
    expect(replay.status).toBe(201);
    expect(replay.headers["idempotency-replayed"]).toBe("true");

    const stored = await pool.query<{ performed_by: string; metadata: unknown }>(
      "SELECT performed_by, metadata FROM installation_tests WHERE test_type = 'entrega67:PRINT-LONG'",
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].performed_by).toBe(fixtures.manager.name);
    expect(JSON.stringify(stored.rows[0].metadata)).not.toContain("must-not-leak");
  });

  it("validates case ids, status vocabulary and failed observations", async () => {
    const auth = `Bearer ${token(fixtures.manager)}`;
    expect((await request(app)
      .post("/api/admin/installation/certification/UNKNOWN")
      .set("Authorization", auth)
      .set("Idempotency-Key", "e68-assistant-unknown")
      .send({ status: "passed" })).status).toBe(404);
    expect((await request(app)
      .post("/api/admin/installation/certification/KDS-FSM")
      .set("Authorization", auth)
      .set("Idempotency-Key", "e68-assistant-invalid")
      .send({ status: "invalid" })).status).toBe(400);
    expect((await request(app)
      .post("/api/admin/installation/certification/KDS-FSM")
      .set("Authorization", auth)
      .set("Idempotency-Key", "e68-assistant-failed")
      .send({ status: "failed", notes: "" })).status).toBe(400);
  });

  it("keeps exports admin-only and emits redacted JSON/printable HTML", async () => {
    expect((await request(app)
      .get("/api/admin/installation/certification/export?format=json")
      .set("Authorization", `Bearer ${token(fixtures.manager)}`)).status).toBe(403);

    const json = await request(app)
      .get("/api/admin/installation/certification/export?format=json")
      .set("Authorization", `Bearer ${token(fixtures.admin)}`);
    expect(json.status).toBe(200);
    expect(json.headers["content-disposition"]).toContain(".json");
    expect(json.body.certification.cases).toHaveLength(39);
    expect(JSON.stringify(json.body)).not.toContain("192.168.68.10");

    const html = await request(app)
      .get("/api/admin/installation/certification/export?format=html&print=1")
      .set("Authorization", `Bearer ${token(fixtures.admin)}`);
    expect(html.status).toBe(200);
    expect(html.headers["content-type"]).toContain("text/html");
    expect(html.text).toContain("Informe de instalación y certificación física");
    expect(html.text).toContain("window.print()");
    expect(html.text).not.toContain("192.168.68.10");
    expect(html.text).not.toContain("Coordinated Universal Time");
  });

  it("ignores forged performedBy on the existing generic test API", async () => {
    const response = await request(app)
      .post("/api/admin/installation/tests")
      .set("Authorization", `Bearer ${token(fixtures.manager)}`)
      .send({ testType: "e68-forged-actor", performedBy: "Forged Actor" });
    expect(response.status).toBe(201);
    expect(response.body.performedBy).toBe(fixtures.manager.name);
  });
});
