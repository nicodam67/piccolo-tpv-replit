import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import OpenAPIResponseValidator from "openapi-response-validator";
import app from "../app";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, "../../../..");
const spec = parse(fs.readFileSync(path.join(root, "lib/api-spec/openapi.yaml"), "utf8")) as any;
let adminToken = "";
let waiterToken = "";

function collectCatalogAdminOperations() {
  const operations: Array<[string, string, string, string[], string[]]> = [];
  for (const [pathname, methods] of Object.entries(spec.paths as Record<string, Record<string, any>>)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation?.tags?.includes("phase59-catalog-admin")) continue;
      operations.push([
        method,
        pathname,
        operation.operationId,
        operation["x-roles"] ?? [],
        Object.keys(operation.responses).sort(),
      ]);
    }
  }
  return operations.sort((a, b) => `${a[0]} ${a[1]}`.localeCompare(`${b[0]} ${b[1]}`));
}

const operations = collectCatalogAdminOperations();
const operationIds = operations.map(([, , id]) => id);

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

describe("catalog-admin OpenAPI metadata", () => {
  it("documents all 45 operations with unique operationIds", () => {
    expect(operations.length).toBe(45);
    expect(new Set(operationIds).size).toBe(45);
  });

  it("tags, auth, RBAC and response codes match runtime contract", () => {
    for (const [method, pathname, id, roles, statuses] of operations) {
      const operation = spec.paths[pathname]?.[method];
      expect(operation, `${method.toUpperCase()} ${pathname}`).toBeTruthy();
      expect(operation.operationId).toBe(id);
      expect(operation.tags).toContain("phase59-catalog-admin");
      expect(operation.tags).toContain("catalog-admin");
      expect(operation.security).toEqual([{ bearerAuth: [] }, { cookieAuth: [] }]);
      expect(operation["x-roles"]).toEqual(roles);
      expect(Object.keys(operation.responses).sort()).toEqual([...statuses].sort());
    }
  });

  it("excludes recipe, stock, QR public and legacy sentinel routes", () => {
    const paths = operations.map(([, p]) => p);
    expect(paths).not.toContain("/admin/products/{productId}/recipe");
    expect(paths).not.toContain("/admin/ingredients");
    expect(paths).not.toContain("/qr-menu/public");
    expect(paths.some((p) => p.includes("410"))).toBe(false);
  });

  it("documents admin CRUD and staff read groups", () => {
    const groups = {
      categoriesAdmin: operations.filter(([, p]) => p.includes("/admin/categories")).length,
      categoriesStaff: operations.filter(([, p]) => p === "/categories").length,
      subcategories: operations.filter(([, p]) => p.includes("/admin/subcategories")).length,
      productsAdmin: operations.filter(([, p]) => p.includes("/admin/products") && !p.includes("allergen")).length,
      formats: operations.filter(([, p]) => p.includes("/formats")).length,
      modifiers: operations.filter(([, p]) => p.includes("modifier")).length,
      allergens: operations.filter(([, p]) => p.includes("allergen")).length,
      availability: operations.filter(([, p]) => p.includes("availability")).length,
      staffSearch: operations.filter(([, p]) => p === "/products").length,
    };
    expect(groups.categoriesAdmin).toBe(6);
    expect(groups.categoriesStaff).toBe(1);
    expect(groups.subcategories).toBe(4);
    expect(groups.productsAdmin).toBe(10);
    expect(groups.formats).toBe(4);
    expect(groups.modifiers).toBe(9);
    expect(groups.allergens).toBe(6);
    expect(groups.availability).toBe(4);
    expect(groups.staffSearch).toBe(1);
  });
});

describeWithDatabase("catalog-admin OpenAPI integration contract", () => {
  beforeAll(() => {
    const secret = process.env.SESSION_SECRET ?? "test-secret";
    adminToken = jwt.sign(
      { id: "59000000-0000-4000-8000-000000000001", name: "Catalog Admin", role: "admin", jti: "catalog-admin" },
      secret,
    );
    waiterToken = jwt.sign(
      { id: "59000000-0000-4000-8000-000000000002", name: "Waiter", role: "waiter", jti: "catalog-waiter" },
      secret,
    );
  });

  afterAll(() => {});

  it("validates list, allergen catalog and staff category reads", async () => {
    const categories = await request(app).get("/api/admin/categories").set(auth());
    expect(categories.status).toBe(200);
    expect(validate("/admin/categories", "get", 200, categories.body)).toBeUndefined();

    const allergens = await request(app).get("/api/admin/allergens").set(auth());
    expect(allergens.status).toBe(200);
    expect(validate("/admin/allergens", "get", 200, allergens.body)).toBeUndefined();

    const staffCategories = await request(app).get("/api/categories").set(auth());
    expect(staffCategories.status).toBe(200);
    expect(validate("/categories", "get", 200, staffCategories.body)).toBeUndefined();
  });

  it("validates authentication and RBAC errors", async () => {
    const unauthenticated = await request(app).get("/api/admin/categories");
    expect(unauthenticated.status).toBe(401);
    expect(validate("/admin/categories", "get", 401, unauthenticated.body)).toBeUndefined();

    const forbidden = await request(app).get("/api/admin/categories").set(auth(waiterToken));
    expect(forbidden.status).toBe(403);
    expect(validate("/admin/categories", "get", 403, forbidden.body)).toBeUndefined();
  });
});
