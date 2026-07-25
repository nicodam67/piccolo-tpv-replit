import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import OpenAPIResponseValidator from "openapi-response-validator";
import {
  db,
  employeesTable,
  roomZonesTable,
  restaurantTablesTable,
  reservationsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, "../../../..");
const spec = parse(fs.readFileSync(path.join(root, "lib/api-spec/openapi.yaml"), "utf8")) as any;
const employeeId = "45000000-0000-4000-8000-000000000001";
const zoneId = "45000000-0000-4000-8000-000000000002";
const tableId = "45000000-0000-4000-8000-000000000003";
let reservationId = "";
let adminToken = "";
let waiterToken = "";

const operations = [
  ["get", "/reservations", ["authenticated"], ["200", "401", "503"]],
  ["post", "/reservations", ["authenticated"], ["201", "400", "401", "409", "503"]],
  ["get", "/reservations/suggest-table", ["authenticated"], ["200", "400", "401", "503"]],
  ["get", "/reservations/{id}", ["authenticated"], ["200", "401", "404", "503"]],
  ["patch", "/reservations/{id}", ["authenticated"], ["200", "401", "404", "409", "503"]],
  ["delete", "/reservations/{id}", ["manager", "admin"], ["204", "401", "403", "404", "503"]],
  ["post", "/reservations/{id}/arrive", ["authenticated"], ["200", "401", "404", "409", "503"]],
  ["get", "/reservations/{id}/history", ["authenticated"], ["200", "401", "503"]],
] as const;

function auth(token = adminToken) {
  return { Authorization: `Bearer ${token}` };
}

function validate(pathname: string, method: string, status: number, body: unknown) {
  const operation = spec.paths[pathname][method];
  const responses = Object.fromEntries(Object.entries(operation.responses).map(([code, response]: [string, any]) => {
    if (!response?.$ref) return [code, response];
    return [code, spec.components.responses[response.$ref.split("/").at(-1)]];
  }));
  return new OpenAPIResponseValidator({ responses, components: spec.components })
    .validateResponse(status, body);
}

describe("reservations OpenAPI metadata", () => {
  it("documents the complete core domain with auth, RBAC and real statuses", () => {
    for (const [method, pathname, roles, statuses] of operations) {
      const operation = spec.paths[pathname]?.[method];
      expect(operation, `${method.toUpperCase()} ${pathname}`).toBeTruthy();
      expect(operation.tags).toContain("phase45-reservations");
      expect(operation.security).toEqual([{ bearerAuth: [] }, { cookieAuth: [] }]);
      expect(operation["x-roles"]).toEqual(roles);
      expect(Object.keys(operation.responses).sort()).toEqual([...statuses].sort());
    }
  });
});

describeWithDatabase("reservations OpenAPI integration contract", () => {
  beforeAll(async () => {
    await db.insert(employeesTable).values({
      id: employeeId, name: "Reservations Contract Admin", role: "admin", active: true,
    }).onConflictDoNothing();
    await db.insert(roomZonesTable).values({
      id: zoneId, name: "Reservations Contract Zone", active: true, sortOrder: 45,
    }).onConflictDoNothing();
    await db.insert(restaurantTablesTable).values({
      id: tableId, zoneId, name: "Reservations Contract Table", capacity: 4, status: "free", active: true,
    }).onConflictDoNothing();
    const secret = process.env.SESSION_SECRET!;
    adminToken = jwt.sign({ id: employeeId, name: "Admin", role: "admin", jti: "reservations-admin" }, secret);
    waiterToken = jwt.sign({ id: employeeId, name: "Waiter", role: "waiter", jti: "reservations-waiter" }, secret);
  });

  afterAll(async () => {
    if (reservationId) await db.delete(reservationsTable).where(eq(reservationsTable.id, reservationId));
    await db.delete(restaurantTablesTable).where(eq(restaurantTablesTable.id, tableId));
    await db.delete(roomZonesTable).where(eq(roomZonesTable.id, zoneId));
    await db.delete(employeesTable).where(eq(employeesTable.id, employeeId));
  });

  it("validates create, list, detail, update, suggestion and history responses", async () => {
    const created = await request(app).post("/api/reservations").set(auth(waiterToken)).send({
      fecha: "2026-08-01", hora: "20:00", nombre: "Reserva Contract",
      telefono: "600000045", personas: 3, mesaId: tableId, alergias: "gluten",
    });
    expect(created.status).toBe(201);
    expect(validate("/reservations", "post", 201, created.body)).toBeUndefined();
    reservationId = created.body.id;

    const list = await request(app).get("/api/reservations?date=2026-08-01").set(auth(waiterToken));
    expect(validate("/reservations", "get", 200, list.body)).toBeUndefined();
    const detail = await request(app).get(`/api/reservations/${reservationId}`).set(auth(waiterToken));
    expect(validate("/reservations/{id}", "get", 200, detail.body)).toBeUndefined();
    const updated = await request(app).patch(`/api/reservations/${reservationId}`).set(auth(waiterToken))
      .send({ notes: "Ventana", status: "confirmada" });
    expect(validate("/reservations/{id}", "patch", 200, updated.body)).toBeUndefined();
    const suggested = await request(app)
      .get("/api/reservations/suggest-table?fecha=2026-08-02&hora=20:00&personas=2")
      .set(auth(waiterToken));
    expect(validate("/reservations/suggest-table", "get", 200, suggested.body)).toBeUndefined();
    const history = await request(app).get(`/api/reservations/${reservationId}/history`).set(auth(waiterToken));
    expect(validate("/reservations/{id}/history", "get", 200, history.body)).toBeUndefined();
  });

  it("validates arrival, conflict, RBAC and deletion responses", async () => {
    const arrived = await request(app).post(`/api/reservations/${reservationId}/arrive`)
      .set(auth(waiterToken)).send({ openTable: false });
    expect(validate("/reservations/{id}/arrive", "post", 200, arrived.body)).toBeUndefined();
    const conflict = await request(app).post(`/api/reservations/${reservationId}/arrive`)
      .set(auth(waiterToken)).send({});
    expect(conflict.status).toBe(409);
    expect(validate("/reservations/{id}/arrive", "post", 409, conflict.body)).toBeUndefined();
    const forbidden = await request(app).delete(`/api/reservations/${reservationId}`).set(auth(waiterToken));
    expect(forbidden.status).toBe(403);
    expect(validate("/reservations/{id}", "delete", 403, forbidden.body)).toBeUndefined();
    const deleted = await request(app).delete(`/api/reservations/${reservationId}`).set(auth());
    expect(deleted.status).toBe(204);
    reservationId = "";
  });

  it("validates representative authentication, validation and not-found errors", async () => {
    const unauthenticated = await request(app).get("/api/reservations");
    expect(validate("/reservations", "get", 401, unauthenticated.body)).toBeUndefined();
    const invalid = await request(app).post("/api/reservations").set(auth(waiterToken)).send({});
    expect(validate("/reservations", "post", 400, invalid.body)).toBeUndefined();
    const missing = await request(app)
      .get("/api/reservations/45000000-0000-4000-8000-000000000099").set(auth(waiterToken));
    expect(validate("/reservations/{id}", "get", 404, missing.body)).toBeUndefined();
  });
});
