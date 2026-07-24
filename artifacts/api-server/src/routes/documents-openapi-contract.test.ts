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
  ordersTable,
  documentTemplatesTable,
  printerConfigsTable,
  invoicesTable,
  clientsTable,
  documentReprintsTable,
  documentAuditLogTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import app from "../app";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, "../../../..");
const spec = parse(fs.readFileSync(path.join(root, "lib/api-spec/openapi.yaml"), "utf8")) as any;
const employeeId = "43000000-0000-4000-8000-000000000001";
const orderId = "43000000-0000-4000-8000-000000000002";
const createdIds = {
  templates: [] as string[],
  printers: [] as string[],
  invoices: [] as string[],
  clients: [] as string[],
  reprints: [] as string[],
};
let adminToken = "";
let managerToken = "";

const documentOperations = [
  ["get", "/documents/templates", ["admin"], ["200", "401", "403", "503"]],
  ["post", "/documents/templates", ["admin"], ["201", "400", "401", "403", "503"]],
  ["put", "/documents/templates/{id}", ["admin"], ["200", "401", "403", "404", "503"]],
  ["delete", "/documents/templates/{id}", ["admin"], ["200", "401", "403", "404", "409", "503"]],
  ["post", "/documents/templates/{id}/activate", ["admin"], ["200", "401", "403", "404", "503"]],
  ["post", "/documents/templates/{id}/duplicate", ["admin"], ["201", "401", "403", "404", "503"]],
  ["get", "/documents/printers", ["admin"], ["200", "401", "403", "503"]],
  ["post", "/documents/printers", ["admin"], ["201", "400", "401", "403", "503"]],
  ["put", "/documents/printers/{id}", ["admin"], ["200", "401", "403", "404", "503"]],
  ["delete", "/documents/printers/{id}", ["admin"], ["200", "401", "403", "503"]],
  ["post", "/documents/invoices", ["admin", "manager", "encargado"], ["201", "400", "401", "403", "404", "503"]],
  ["get", "/documents/invoices/{id}", ["admin", "manager"], ["200", "401", "403", "404", "503"]],
  ["post", "/documents/invoices/{id}/rectify", ["admin"], ["201", "400", "401", "403", "404", "409", "503"]],
  ["get", "/documents/clients", ["admin", "manager"], ["200", "401", "403", "503"]],
  ["post", "/documents/clients", ["admin", "manager"], ["201", "400", "401", "403", "503"]],
  ["put", "/documents/clients/{id}", ["admin", "manager"], ["200", "401", "403", "404", "503"]],
  ["post", "/documents/reprints", ["authenticated"], ["201", "400", "401", "503"]],
  ["get", "/documents/audit", ["admin"], ["200", "401", "403", "503"]],
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

describe("documents OpenAPI metadata", () => {
  it("documents all 18 operations with exact roles and supported status codes", () => {
    for (const [method, pathname, roles, statuses] of documentOperations) {
      const operation = spec.paths[pathname]?.[method];
      expect(operation, `${method.toUpperCase()} ${pathname}`).toBeTruthy();
      expect(operation.tags).toContain("phase43-documents");
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(operation["x-roles"]).toEqual(roles);
      expect(Object.keys(operation.responses).sort()).toEqual([...statuses].sort());
    }
  });
});

describeWithDatabase("documents OpenAPI integration contract", () => {
  beforeAll(async () => {
    await db.insert(employeesTable).values({
      id: employeeId, name: "Documents Contract Admin", role: "admin", active: true,
    }).onConflictDoNothing();
    await db.insert(ordersTable).values({
      id: orderId, employeeId, status: "open", guestCount: 1,
    }).onConflictDoNothing();
    const secret = process.env.SESSION_SECRET!;
    adminToken = jwt.sign({ id: employeeId, name: "Admin", role: "admin", jti: "documents-admin" }, secret);
    managerToken = jwt.sign({ id: employeeId, name: "Manager", role: "manager", jti: "documents-manager" }, secret);
  });

  afterAll(async () => {
    await db.delete(documentAuditLogTable).where(eq(documentAuditLogTable.employeeId, employeeId));
    if (createdIds.reprints.length) await db.delete(documentReprintsTable).where(inArray(documentReprintsTable.id, createdIds.reprints));
    if (createdIds.invoices.length) await db.delete(invoicesTable).where(inArray(invoicesTable.id, createdIds.invoices));
    if (createdIds.clients.length) await db.delete(clientsTable).where(inArray(clientsTable.id, createdIds.clients));
    if (createdIds.printers.length) await db.delete(printerConfigsTable).where(inArray(printerConfigsTable.id, createdIds.printers));
    if (createdIds.templates.length) await db.delete(documentTemplatesTable).where(inArray(documentTemplatesTable.id, createdIds.templates));
    await db.delete(ordersTable).where(eq(ordersTable.id, orderId));
    await db.delete(employeesTable).where(eq(employeesTable.id, employeeId));
  });

  it("validates all template endpoint responses", async () => {
    const list = await request(app).get("/api/documents/templates").set(auth());
    expect(list.status).toBe(200);
    expect(validate("/documents/templates", "get", 200, list.body)).toBeUndefined();

    const created = await request(app).post("/api/documents/templates").set(auth()).send({
      name: "Contract Template", documentType: "ticket", config: { fontSize: 12 },
    });
    expect(created.status).toBe(201);
    expect(validate("/documents/templates", "post", 201, created.body)).toBeUndefined();
    createdIds.templates.push(created.body.id);

    const updated = await request(app).put(`/api/documents/templates/${created.body.id}`).set(auth())
      .send({ name: "Contract Template Updated" });
    expect(validate("/documents/templates/{id}", "put", 200, updated.body)).toBeUndefined();
    const activated = await request(app).post(`/api/documents/templates/${created.body.id}/activate`).set(auth());
    expect(validate("/documents/templates/{id}/activate", "post", 200, activated.body)).toBeUndefined();
    const duplicate = await request(app).post(`/api/documents/templates/${created.body.id}/duplicate`).set(auth());
    expect(validate("/documents/templates/{id}/duplicate", "post", 201, duplicate.body)).toBeUndefined();
    createdIds.templates.push(duplicate.body.id);
    const deleted = await request(app).delete(`/api/documents/templates/${duplicate.body.id}`).set(auth());
    expect(validate("/documents/templates/{id}", "delete", 200, deleted.body)).toBeUndefined();
  });

  it("validates printer endpoint responses including idempotent delete", async () => {
    const list = await request(app).get("/api/documents/printers").set(auth());
    expect(validate("/documents/printers", "get", 200, list.body)).toBeUndefined();
    const created = await request(app).post("/api/documents/printers").set(auth()).send({
      name: "Contract Printer", printerType: "thermal", paperWidth: 80,
    });
    expect(created.status).toBe(201);
    expect(validate("/documents/printers", "post", 201, created.body)).toBeUndefined();
    createdIds.printers.push(created.body.id);
    const updated = await request(app).put(`/api/documents/printers/${created.body.id}`).set(auth())
      .send({ location: "Caja" });
    expect(validate("/documents/printers/{id}", "put", 200, updated.body)).toBeUndefined();
    const deleted = await request(app).delete(`/api/documents/printers/${created.body.id}`).set(auth());
    expect(validate("/documents/printers/{id}", "delete", 200, deleted.body)).toBeUndefined();
  });

  it("validates invoice issue, read and rectification responses", async () => {
    const created = await request(app).post("/api/documents/invoices").set(auth()).send({
      orderId, clientName: "Cliente Contract", clientNif: "B12345678",
    });
    expect(created.status).toBe(201);
    expect(validate("/documents/invoices", "post", 201, created.body)).toBeUndefined();
    createdIds.invoices.push(created.body.id);
    const read = await request(app).get(`/api/documents/invoices/${created.body.id}`).set(auth(managerToken));
    expect(validate("/documents/invoices/{id}", "get", 200, read.body)).toBeUndefined();
    const rectified = await request(app).post(`/api/documents/invoices/${created.body.id}/rectify`).set(auth())
      .send({ reason: "Corrección contractual" });
    expect(rectified.status).toBe(201);
    expect(validate("/documents/invoices/{id}/rectify", "post", 201, rectified.body)).toBeUndefined();
    createdIds.invoices.push(rectified.body.rectificativa.id);
  });

  it("validates client, reprint and audit endpoint responses", async () => {
    const clients = await request(app).get("/api/documents/clients").set(auth(managerToken));
    expect(validate("/documents/clients", "get", 200, clients.body)).toBeUndefined();
    const created = await request(app).post("/api/documents/clients").set(auth(managerToken))
      .send({ name: "Contract Client", nif: "B87654321" });
    expect(validate("/documents/clients", "post", 201, created.body)).toBeUndefined();
    createdIds.clients.push(created.body.id);
    const updated = await request(app).put(`/api/documents/clients/${created.body.id}`).set(auth(managerToken))
      .send({ city: "Madrid" });
    expect(validate("/documents/clients/{id}", "put", 200, updated.body)).toBeUndefined();

    const reprint = await request(app).post("/api/documents/reprints").set(auth(managerToken))
      .send({ documentId: created.body.id, documentType: "invoice", reason: "Copia" });
    expect(validate("/documents/reprints", "post", 201, reprint.body)).toBeUndefined();
    createdIds.reprints.push(reprint.body.id);
    const audit = await request(app).get("/api/documents/audit?page=1&limit=50").set(auth());
    expect(validate("/documents/audit", "get", 200, audit.body)).toBeUndefined();
  });

  it("matches representative authentication, RBAC and validation errors", async () => {
    const unauthenticated = await request(app).get("/api/documents/templates");
    expect(unauthenticated.status).toBe(401);
    expect(validate("/documents/templates", "get", 401, unauthenticated.body)).toBeUndefined();
    const forbidden = await request(app).get("/api/documents/templates").set(auth(managerToken));
    expect(forbidden.status).toBe(403);
    expect(validate("/documents/templates", "get", 403, forbidden.body)).toBeUndefined();
    const invalid = await request(app).post("/api/documents/templates").set(auth()).send({});
    expect(invalid.status).toBe(400);
    expect(validate("/documents/templates", "post", 400, invalid.body)).toBeUndefined();
  });
});
