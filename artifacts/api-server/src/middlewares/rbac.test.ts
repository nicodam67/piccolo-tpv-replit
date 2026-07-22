import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

function makeChain(value: unknown) {
  const chain: Record<string, unknown> & {
    then: (resolve: (result: unknown) => unknown) => Promise<unknown>;
  } = {
    then: (resolve) => Promise.resolve(value).then(resolve),
  };
  for (const method of ["select", "from", "where", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  return chain;
}

const mockDb = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});

const { requirePermission } = await import("./auth");
const { hasPermission } = await import("../lib/permissions");

beforeEach(() => {
  mockDb.select.mockReturnValue(makeChain([]));
});

describe("RBAC role matrix", () => {
  const matrix: Record<string, { allowed: string[]; denied: string[] }> = {
    admin: {
      allowed: ["cash.close", "payments.void", "invoices.correct", "settings.manage", "users.manage"],
      denied: [],
    },
    manager: {
      allowed: ["cash.close", "payments.refund", "invoices.create", "stock.manage", "suppliers.manage"],
      denied: ["fiscal.configure", "users.manage"],
    },
    encargado: {
      allowed: ["cash.open", "cash.close", "invoices.create", "timeclock.manage"],
      denied: ["payments.refund", "payments.void", "settings.manage", "suppliers.manage"],
    },
    waiter: {
      allowed: ["tables.view", "orders.create", "payments.create"],
      denied: ["cash.close", "invoices.create", "stock.manage", "employees.manage", "settings.manage"],
    },
    cashier: {
      allowed: ["cash.open", "cash.view", "payments.create"],
      denied: ["cash.close", "payments.refund", "invoices.create", "settings.manage"],
    },
    kitchen: {
      allowed: ["kds.view", "kds.manage"],
      denied: ["orders.create", "payments.create", "cash.view", "settings.manage"],
    },
  };

  for (const [role, expectations] of Object.entries(matrix)) {
    it(`${role} has only its declared sensitive permissions`, () => {
      for (const permission of expectations.allowed) {
        expect(hasPermission(role, permission), `${role} should allow ${permission}`).toBe(true);
      }
      for (const permission of expectations.denied) {
        expect(hasPermission(role, permission), `${role} should deny ${permission}`).toBe(false);
      }
    });
  }
});

describe("requirePermission", () => {
  function testApp(role: string, permission: string) {
    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: "employee-1", name: "Test", role };
      next();
    });
    app.get("/protected", requirePermission(permission), (_req, res) => res.json({ ok: true }));
    return app;
  }

  it("rejects a waiter from configuration management", async () => {
    const res = await request(testApp("waiter", "settings.manage")).get("/protected");
    expect(res.status).toBe(403);
  });

  it("honors an explicit database denial over a role default", async () => {
    mockDb.select.mockReturnValue(makeChain([{ allowed: false }]));
    const res = await request(testApp("manager", "cash.close")).get("/protected");
    expect(res.status).toBe(403);
  });

  it("honors an explicit database grant", async () => {
    mockDb.select.mockReturnValue(makeChain([{ allowed: true }]));
    const res = await request(testApp("waiter", "reports.view")).get("/protected");
    expect(res.status).toBe(200);
  });

  it("fails closed when permission storage is unavailable", async () => {
    mockDb.select.mockImplementation(() => {
      throw new Error("database unavailable");
    });
    const res = await request(testApp("manager", "cash.close")).get("/protected");
    expect(res.status).toBe(503);
  });
});
