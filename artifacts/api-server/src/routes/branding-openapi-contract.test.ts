import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import OpenAPIResponseValidator from "openapi-response-validator";
import {
  db,
  businessConfigTable,
  documentAuditLogTable,
  employeesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, "../../../..");
const spec = parse(fs.readFileSync(path.join(root, "lib/api-spec/openapi.yaml"), "utf8")) as any;
const employeeId = "47000000-0000-4000-8000-000000000001";
let configId = "";
let adminToken = "";
let waiterToken = "";

const operations = [
  ["get", "/public/branding", [], ["200", "503"]],
  ["get", "/admin/branding", ["admin"], ["200", "401", "403", "503"]],
  ["patch", "/admin/branding", ["admin"], ["200", "401", "403", "503"]],
  ["get", "/admin/qr-branding", ["admin"], ["200", "401", "403", "503"]],
  ["put", "/admin/qr-branding", ["admin"], ["200", "401", "403", "503"]],
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

describe("branding OpenAPI metadata", () => {
  it("documents all 5 operations with auth, RBAC and real status codes", () => {
    for (const [method, pathname, roles, statuses] of operations) {
      const operation = spec.paths[pathname]?.[method];
      expect(operation, `${method.toUpperCase()} ${pathname}`).toBeTruthy();
      expect(operation.tags).toContain("phase47-branding");
      if (roles.length === 0) {
        expect(operation.security).toBeUndefined();
        expect(operation["x-roles"]).toBeUndefined();
      } else {
        expect(operation.security).toEqual([{ bearerAuth: [] }, { cookieAuth: [] }]);
        expect(operation["x-roles"]).toEqual(roles);
      }
      expect(Object.keys(operation.responses).sort()).toEqual([...statuses].sort());
    }
  });
});

describeWithDatabase("branding OpenAPI integration contract", () => {
  beforeAll(async () => {
    await db.insert(employeesTable).values({
      id: employeeId, name: "Branding Contract Admin", role: "admin", active: true,
    }).onConflictDoNothing();
    const secret = process.env.SESSION_SECRET!;
    adminToken = jwt.sign({ id: employeeId, name: "Admin", role: "admin", jti: "branding-admin" }, secret);
    waiterToken = jwt.sign({ id: employeeId, name: "Waiter", role: "waiter", jti: "branding-waiter" }, secret);
  });

  afterAll(async () => {
    if (configId) await db.delete(businessConfigTable).where(eq(businessConfigTable.id, configId));
    await db.delete(documentAuditLogTable).where(eq(documentAuditLogTable.employeeId, employeeId));
    await db.delete(employeesTable).where(eq(employeesTable.id, employeeId));
  });

  it("validates public branding and admin branding responses", async () => {
    const publicBranding = await request(app).get("/api/public/branding");
    expect(publicBranding.status).toBe(200);
    expect(validate("/public/branding", "get", 200, publicBranding.body)).toBeUndefined();

    const adminGet = await request(app).get("/api/admin/branding").set(auth());
    expect(adminGet.status).toBe(200);
    expect(validate("/admin/branding", "get", 200, adminGet.body)).toBeUndefined();

    const adminPatch = await request(app).patch("/api/admin/branding").set(auth()).send({
      nombreComercial: "Branding Contract",
      tagline: "Cocina mediterránea",
      cardLayout: "grid",
      accentColor: "#ef4444",
      openingHours: { mon: { open: "13:00", close: "16:00" } },
    });
    expect(adminPatch.status).toBe(200);
    expect(validate("/admin/branding", "patch", 200, adminPatch.body)).toBeUndefined();
    expect(adminPatch.body.nombreComercial).toBe("Branding Contract");
  });

  it("validates QR branding read and write responses", async () => {
    const qrGet = await request(app).get("/api/admin/qr-branding").set(auth());
    expect(qrGet.status).toBe(200);
    expect(validate("/admin/qr-branding", "get", 200, qrGet.body)).toBeUndefined();

    const qrPut = await request(app).put("/api/admin/qr-branding").set(auth()).send({
      restaurantName: "Branding Contract",
      tagline: "Carta QR",
      city: "Barcelona",
      province: "Barcelona",
      postalCode: "08001",
      country: "España",
      establishedYear: "2010",
      themeColors: { primary: "#5c1f1f", background: "#faf8f4" },
      schedule: [{
        day: "monday",
        shift1: { open: true, openTime: "13:00", closeTime: "16:00" },
        shift2: { open: true, openTime: "20:00", closeTime: "23:30" },
      }],
    });
    expect(qrPut.status).toBe(200);
    expect(validate("/admin/qr-branding", "put", 200, qrPut.body)).toBeUndefined();
    expect(qrPut.body).toEqual({ ok: true });

    const qrGetAfter = await request(app).get("/api/admin/qr-branding").set(auth());
    expect(qrGetAfter.body.restaurantName).toBe("Branding Contract");
    expect(qrGetAfter.body.city).toBe("Barcelona");

    const [config] = await db.select({ id: businessConfigTable.id }).from(businessConfigTable).limit(1);
    configId = config?.id ?? "";
  });

  it("validates authentication and RBAC errors", async () => {
    const unauthenticated = await request(app).get("/api/admin/branding");
    expect(unauthenticated.status).toBe(401);
    expect(validate("/admin/branding", "get", 401, unauthenticated.body)).toBeUndefined();

    const forbidden = await request(app).get("/api/admin/branding").set(auth(waiterToken));
    expect(forbidden.status).toBe(403);
    expect(validate("/admin/branding", "get", 403, forbidden.body)).toBeUndefined();
  });
});
