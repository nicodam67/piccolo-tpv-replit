import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import OpenAPIResponseValidator from "openapi-response-validator";
import {
  db,
  crmAuditLogTable,
  crmClientsTable,
  crmPromotionsTable,
  employeesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, "../../../..");
const spec = parse(fs.readFileSync(path.join(root, "lib/api-spec/openapi.yaml"), "utf8")) as any;
const employeeId = "49000000-0000-4000-8000-000000000001";
let clientId = "";
let promotionId = "";
let adminToken = "";
let waiterToken = "";

function collectCrmOperations() {
  const operations: Array<[string, string, string[], string[]]> = [];
  for (const [pathname, methods] of Object.entries(spec.paths as Record<string, Record<string, any>>)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation?.tags?.includes("phase49-crm")) continue;
      operations.push([
        method,
        pathname,
        operation["x-roles"] ?? [],
        Object.keys(operation.responses).sort(),
      ]);
    }
  }
  return operations.sort((a, b) => `${a[0]} ${a[1]}`.localeCompare(`${b[0]} ${b[1]}`));
}

const operations = collectCrmOperations();

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

describe("crm OpenAPI metadata", () => {
  it(`documents all ${operations.length} operations with auth, RBAC and real status codes`, () => {
    expect(operations.length).toBe(49);
    for (const [method, pathname, roles, statuses] of operations) {
      const operation = spec.paths[pathname]?.[method];
      expect(operation, `${method.toUpperCase()} ${pathname}`).toBeTruthy();
      expect(operation.tags).toContain("phase49-crm");
      expect(operation.security).toEqual([{ bearerAuth: [] }, { cookieAuth: [] }]);
      expect(operation["x-roles"]).toEqual(roles);
      expect(Object.keys(operation.responses).sort()).toEqual([...statuses].sort());
    }
  });
});

describeWithDatabase("crm OpenAPI integration contract", () => {
  beforeAll(async () => {
    await db.insert(employeesTable).values({
      id: employeeId, name: "CRM Contract Admin", role: "admin", active: true,
    }).onConflictDoNothing();
    const secret = process.env.SESSION_SECRET!;
    adminToken = jwt.sign({ id: employeeId, name: "Admin", role: "admin", jti: "crm-admin" }, secret);
    waiterToken = jwt.sign({ id: employeeId, name: "Waiter", role: "waiter", jti: "crm-waiter" }, secret);
  });

  afterAll(async () => {
    if (promotionId) await db.delete(crmPromotionsTable).where(eq(crmPromotionsTable.id, promotionId));
    if (clientId) await db.delete(crmClientsTable).where(eq(crmClientsTable.id, clientId));
    await db.delete(crmAuditLogTable).where(eq(crmAuditLogTable.empleadoId, employeeId));
    await db.delete(employeesTable).where(eq(employeesTable.id, employeeId));
  });

  it("validates client, loyalty, promotion and report responses", async () => {
    const created = await request(app).post("/api/crm/clients").set(auth(waiterToken)).send({
      nombre: "CRM Contract", telefono: "600000049", rgpdConsentimiento: true,
    });
    expect(created.status).toBe(201);
    expect(validate("/crm/clients", "post", 201, created.body)).toBeUndefined();
    clientId = created.body.id;

    const list = await request(app).get("/api/crm/clients?q=CRM").set(auth(waiterToken));
    expect(validate("/crm/clients", "get", 200, list.body)).toBeUndefined();

    const detail = await request(app).get(`/api/crm/clients/${clientId}`).set(auth(waiterToken));
    expect(validate("/crm/clients/{id}", "get", 200, detail.body)).toBeUndefined();

    const history = await request(app).get(`/api/crm/clients/${clientId}/history`).set(auth(waiterToken));
    expect(validate("/crm/clients/{id}/history", "get", 200, history.body)).toBeUndefined();

    const loyalty = await request(app).get("/api/crm/loyalty/config").set(auth());
    expect(validate("/crm/loyalty/config", "get", 200, loyalty.body)).toBeUndefined();

    const promo = await request(app).post("/api/crm/promotions").set(auth()).send({
      nombre: "CRM Contract Promo", tipo: "descuento_porcentual", valor: "10",
    });
    expect(promo.status).toBe(201);
    expect(validate("/crm/promotions", "post", 201, promo.body)).toBeUndefined();
    promotionId = promo.body.id;

    const validatePromo = await request(app).post("/api/crm/promotions/validate").set(auth(waiterToken))
      .send({ promoId: promotionId, orderAmount: 50 });
    expect(validate("/crm/promotions/validate", "post", 200, validatePromo.body)).toBeUndefined();

    const reports = await request(app).get("/api/admin/crm/reports").set(auth());
    expect(validate("/admin/crm/reports", "get", 200, reports.body)).toBeUndefined();
  });

  it("validates authentication, RBAC and representative errors", async () => {
    const unauthenticated = await request(app).get("/api/crm/clients");
    expect(validate("/crm/clients", "get", 401, unauthenticated.body)).toBeUndefined();

    const forbidden = await request(app).get("/api/admin/crm/reports").set(auth(waiterToken));
    expect(forbidden.status).toBe(403);
    expect(validate("/admin/crm/reports", "get", 403, forbidden.body)).toBeUndefined();

    const invalid = await request(app).post("/api/crm/clients").set(auth(waiterToken)).send({});
    expect(validate("/crm/clients", "post", 400, invalid.body)).toBeUndefined();

    const missing = await request(app)
      .get("/api/crm/clients/49000000-0000-4000-8000-000000000099").set(auth(waiterToken));
    expect(validate("/crm/clients/{id}", "get", 404, missing.body)).toBeUndefined();
  });
});
