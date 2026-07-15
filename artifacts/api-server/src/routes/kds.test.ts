/**
 * KDS endpoint tests
 *
 * Verifies that GET /kds/:zone never returns tasks with status
 * "collected" or "served" — regardless of what is stored in the DB.
 * This prevents already-collected orders from reappearing on the kitchen
 * display after a kds:refresh event triggers a re-fetch.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeChain(value: unknown) {
  const chain: Record<string, unknown> & {
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => Promise<unknown>;
  } = {
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  for (const m of [
    "select", "from", "where", "orderBy",
    "insert", "update", "delete", "set", "values", "returning",
    "innerJoin", "leftJoin", "limit",
  ]) {
    chain[m] = () => chain;
  }
  return chain;
}

// ─── Hoisted mock references ──────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));

const mockEmit = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});

vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn(() => ({ id: "waiter-1", name: "Test Waiter", role: "waiter" })),
  },
}));

vi.mock("drizzle-orm", async (importOriginal) => importOriginal());

vi.mock("../lib/socket", () => ({
  getIO: () => ({ emit: mockEmit }),
  initSocket: vi.fn(),
}));

const { default: app } = await import("../app");

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTH = "Bearer test-token";

const makeTask = (id: string, status: string) => ({
  id,
  orderId: "order-1",
  orderItemId: `item-${id}`,
  prepZone: "cocina",
  productName: "Paella",
  quantity: 1,
  status,
  allergyNote: "",
  hasAllergy: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  readyAt: null,
  collectedAt: null,
  servedAt: null,
  tableName: "Mesa 1",
  employeeName: "Test Waiter",
  employeeId: "waiter-1",
});

// ─── Zone endpoint tests ───────────────────────────────────────────────────────

describe("GET /api/kds/:zone — excludes collected and served tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SESSION_SECRET"] = "test-secret";
  });

  it("returns only new/preparing/ready tasks for a zone — never collected or served", async () => {
    // Simulate DB returning a mix of statuses (as if the filter were missing)
    const allTasks = [
      makeTask("t1", "new"),
      makeTask("t2", "preparing"),
      makeTask("t3", "ready"),
      makeTask("t4", "collected"),
      makeTask("t5", "served"),
    ];
    mockDb.select.mockReturnValueOnce(makeChain(allTasks));

    const res = await request(app)
      .get("/api/kds/cocina")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    const returnedStatuses: string[] = res.body.map((t: { status: string }) => t.status);
    expect(returnedStatuses).not.toContain("collected");
    expect(returnedStatuses).not.toContain("served");
  });

  it("returns an empty list when all tasks for a zone are collected or served", async () => {
    const allTasks = [
      makeTask("t1", "collected"),
      makeTask("t2", "served"),
    ];
    mockDb.select.mockReturnValueOnce(makeChain(allTasks));

    const res = await request(app)
      .get("/api/kds/cocina")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

// ─── Pase endpoint tests ───────────────────────────────────────────────────────

describe("GET /api/kds/pase — excludes collected and served tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SESSION_SECRET"] = "test-secret";
  });

  it("returns only ready tasks for pase — never collected or served", async () => {
    const allTasks = [
      makeTask("p1", "ready"),
      makeTask("p2", "collected"),
      makeTask("p3", "served"),
    ];
    mockDb.select.mockReturnValueOnce(makeChain(allTasks));

    const res = await request(app)
      .get("/api/kds/pase")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    const returnedStatuses: string[] = res.body.map((t: { status: string }) => t.status);
    expect(returnedStatuses).not.toContain("collected");
    expect(returnedStatuses).not.toContain("served");
  });

  it("returns an empty list for pase when all tasks are already collected", async () => {
    const allTasks = [
      makeTask("p1", "collected"),
      makeTask("p2", "collected"),
    ];
    mockDb.select.mockReturnValueOnce(makeChain(allTasks));

    const res = await request(app)
      .get("/api/kds/pase")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});
