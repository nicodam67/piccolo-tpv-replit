import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import OpenAPIResponseValidator from "openapi-response-validator";
import { db, couriersTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, "../../../..");
const spec = parse(fs.readFileSync(path.join(root, "lib/api-spec/openapi.yaml"), "utf8")) as any;
const employeeId = "54000000-0000-4000-8000-000000000001";
let adminToken = "";
let waiterToken = "";
let testCourierId = "";

function collectDeliveryOperations() {
  const operations: Array<[string, string, string[], string[]]> = [];
  for (const [pathname, methods] of Object.entries(spec.paths as Record<string, Record<string, any>>)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation?.tags?.includes("phase54-delivery")) continue;
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

const operations = collectDeliveryOperations();

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

describe("delivery OpenAPI metadata", () => {
  it(`documents all ${operations.length} operations with auth, RBAC and real status codes`, () => {
    expect(operations.length).toBe(25);
    for (const [method, pathname, roles, statuses] of operations) {
      const operation = spec.paths[pathname]?.[method];
      expect(operation, `${method.toUpperCase()} ${pathname}`).toBeTruthy();
      expect(operation.tags).toContain("phase54-delivery");
      expect(operation.tags).toContain("delivery");
      expect(operation.security).toEqual([{ bearerAuth: [] }, { cookieAuth: [] }]);
      expect(operation["x-roles"]).toEqual(roles);
      expect(Object.keys(operation.responses).sort()).toEqual([...statuses].sort());
    }
  });

  it("excludes courier token and legacy public routes from phase54-delivery", () => {
    const paths = operations.map(([, p]) => p);
    expect(paths.some((p) => p.includes("/courier/"))).toBe(false);
    expect(paths.some((p) => p.startsWith("/public/"))).toBe(false);
    expect(paths).not.toContain("/admin/online-reports");
  });
});

describeWithDatabase("delivery OpenAPI integration contract", () => {
  beforeAll(async () => {
    await db.insert(employeesTable).values({
      id: employeeId, name: "Delivery Contract Admin", role: "admin", active: true,
    }).onConflictDoNothing();
    const secret = process.env.SESSION_SECRET!;
    adminToken = jwt.sign({ id: employeeId, name: "Admin", role: "admin", jti: "delivery-admin" }, secret);
    waiterToken = jwt.sign({ id: employeeId, name: "Waiter", role: "waiter", jti: "delivery-waiter" }, secret);
  });

  afterAll(async () => {
    if (testCourierId) {
      await db.delete(couriersTable).where(eq(couriersTable.id, testCourierId)).catch(() => {});
    }
    await db.delete(employeesTable).where(eq(employeesTable.id, employeeId));
  });

  it("validates courier and delivery zone responses", async () => {
    const couriers = await request(app).get("/api/admin/couriers").set(auth());
    expect(couriers.status).toBe(200);
    expect(validate("/admin/couriers", "get", 200, couriers.body)).toBeUndefined();

    const created = await request(app).post("/api/admin/couriers").set(auth()).send({
      name: "Contract Courier", phone: "600000054",
    });
    expect(created.status).toBe(201);
    expect(validate("/admin/couriers", "post", 201, created.body)).toBeUndefined();
    testCourierId = created.body.id;

    const zones = await request(app).get("/api/admin/delivery-zones").set(auth());
    expect(zones.status).toBe(200);
    expect(validate("/admin/delivery-zones", "get", 200, zones.body)).toBeUndefined();

    const orders = await request(app).get("/api/delivery-orders").set(auth(waiterToken));
    expect(orders.status).toBe(200);
    expect(validate("/delivery-orders", "get", 200, orders.body)).toBeUndefined();

    const inbox = await request(app).get("/api/online-orders").set(auth(waiterToken));
    expect(inbox.status).toBe(200);
    expect(validate("/online-orders", "get", 200, inbox.body)).toBeUndefined();

    const config = await request(app).get("/api/admin/online-config").set(auth());
    expect(config.status).toBe(200);
    expect(validate("/admin/online-config", "get", 200, config.body)).toBeUndefined();

    const settlements = await request(app).get("/api/admin/courier-settlements").set(auth());
    expect(settlements.status).toBe(200);
    expect(validate("/admin/courier-settlements", "get", 200, settlements.body)).toBeUndefined();
  });
});
