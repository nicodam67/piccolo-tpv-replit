import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import OpenAPIResponseValidator from "openapi-response-validator";
import { db, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, "../../../..");
const spec = parse(fs.readFileSync(path.join(root, "lib/api-spec/openapi.yaml"), "utf8")) as any;
const employeeId = "56000000-0000-4000-8000-000000000001";
let adminToken = "";
let waiterToken = "";

type SecurityKind = "jwt" | "deviceHeader" | "public" | "deviceBody";

function securityKind(operation: Record<string, unknown>): SecurityKind {
  const security = operation.security as Array<Record<string, unknown[]>> | undefined;
  if (operation["x-device-credential"] === "body") return "deviceBody";
  if (security?.some((entry) => "deviceTokenAuth" in entry)) return "deviceHeader";
  if (security?.length === 0) return "public";
  return "jwt";
}

function collectTimeclockOperations() {
  const operations: Array<[string, string, string[], string[], SecurityKind]> = [];
  for (const [pathname, methods] of Object.entries(spec.paths as Record<string, Record<string, any>>)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation?.tags?.includes("phase56-timeclock")) continue;
      operations.push([
        method,
        pathname,
        operation["x-roles"] ?? [],
        Object.keys(operation.responses).sort(),
        securityKind(operation),
      ]);
    }
  }
  return operations.sort((a, b) => `${a[0]} ${a[1]}`.localeCompare(`${b[0]} ${b[1]}`));
}

const operations = collectTimeclockOperations();

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

describe("timeclock OpenAPI metadata", () => {
  it(`documents all ${operations.length} operations with auth, RBAC and real status codes`, () => {
    expect(operations.length).toBe(38);
    for (const [method, pathname, roles, statuses, kind] of operations) {
      const operation = spec.paths[pathname]?.[method];
      expect(operation, `${method.toUpperCase()} ${pathname}`).toBeTruthy();
      expect(operation.tags).toContain("phase56-timeclock");
      expect(operation.tags).toContain("timeclock");
      expect(operation["x-roles"]).toEqual(roles);
      expect(Object.keys(operation.responses).sort()).toEqual([...statuses].sort());

      if (kind === "jwt") {
        expect(operation.security).toEqual([{ bearerAuth: [] }, { cookieAuth: [] }]);
      } else if (kind === "deviceHeader") {
        expect(operation.security).toEqual([{ deviceTokenAuth: [] }]);
      } else {
        expect(operation.security).toEqual([]);
      }
    }
  });

  it("excludes legacy 410 tablet URL sentinels and non-existent generic import", () => {
    const paths = operations.map(([, p]) => p);
    expect(paths).not.toContain("/tablet/device/{token}");
    expect(paths).not.toContain("/tablet/device/{token}/ping");
    expect(paths).not.toContain("/fichaje/import");
  });

  it("documents device-token and fail-closed public clock flows", () => {
    const publicClock = spec.paths["/fichaje/public/clock"].post;
    expect(publicClock["x-device-credential"]).toBe("body");
    const mobileStatus = spec.paths["/fichaje/public/clock-status"].get;
    expect(mobileStatus.responses["200"].content["application/json"].schema.$ref)
      .toBe("#/components/schemas/TimeclockMobileClockStatus");
  });

  it("documents record-break ownership denials without resource disclosure", () => {
    const breaks = spec.paths["/fichaje/records/{id}/breaks"].get;
    expect(Object.keys(breaks.responses).sort()).toEqual(["200", "401", "403", "404", "503"]);
    expect(breaks.summary).toContain("owned time record");
  });
});

describeWithDatabase("timeclock OpenAPI integration contract", () => {
  beforeAll(async () => {
    await db.insert(employeesTable).values({
      id: employeeId, name: "Timeclock Contract Admin", role: "admin", active: true,
    }).onConflictDoNothing();
    const secret = process.env.SESSION_SECRET!;
    adminToken = jwt.sign({ id: employeeId, name: "Admin", role: "admin", jti: "timeclock-admin" }, secret);
    waiterToken = jwt.sign({ id: employeeId, name: "Waiter", role: "waiter", jti: "timeclock-waiter" }, secret);
  });

  afterAll(async () => {
    await db.delete(employeesTable).where(eq(employeesTable.id, employeeId));
  });

  it("validates fichaje settings, audit and mobile clock status", async () => {
    const settings = await request(app).get("/api/fichaje/settings").set(auth());
    expect(settings.status).toBe(200);
    expect(validate("/fichaje/settings", "get", 200, settings.body)).toBeUndefined();

    const audit = await request(app).get("/api/fichaje/audit?limit=5").set(auth());
    expect(audit.status).toBe(200);
    expect(validate("/fichaje/audit", "get", 200, audit.body)).toBeUndefined();

    const mobile = await request(app).get("/api/fichaje/public/clock-status");
    expect(mobile.status).toBe(200);
    expect(mobile.body.mobileClockEnabled).toBe(false);
    expect(validate("/fichaje/public/clock-status", "get", 200, mobile.body)).toBeUndefined();

    const me = await request(app).get("/api/fichaje/me").set(auth());
    expect(me.status).toBe(200);
    expect(validate("/fichaje/me", "get", 200, me.body)).toBeUndefined();
  });

  it("validates authentication and RBAC errors", async () => {
    const unauthenticated = await request(app).get("/api/fichaje/settings");
    expect(unauthenticated.status).toBe(401);
    expect(validate("/fichaje/settings", "get", 401, unauthenticated.body)).toBeUndefined();

    const forbidden = await request(app).get("/api/fichaje/settings").set(auth(waiterToken));
    expect(forbidden.status).toBe(403);
    expect(validate("/fichaje/settings", "get", 403, forbidden.body)).toBeUndefined();

    const deviceDenied = await request(app).get("/api/fichaje/public/employees");
    expect(deviceDenied.status).toBe(401);
    expect(validate("/fichaje/public/employees", "get", 401, deviceDenied.body)).toBeUndefined();
  });
});
