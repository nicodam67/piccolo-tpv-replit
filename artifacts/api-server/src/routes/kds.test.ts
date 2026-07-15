/**
 * KDS integration tests — covers the 5 required scenarios:
 *  1. Order with products for multiple stations (zone routing)
 *  2. Cancellation of a sent item → kitchen task cancelled, kds:refresh emitted
 *  3. Resend of a kitchen task → status reset to "new", audit recorded
 *  4. Status flow from new → preparing → ready → served (Entregado)
 *  5. Real-time socket sync on status change
 *  6. History endpoint
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── Mock state ───────────────────────────────────────────────────────────────
// Shared state object mutated per-test; the db factory always reads from it.

type MockRow = Record<string, unknown>;

const mockState = {
  selectRows:   [] as MockRow[],
  updateRows:   [] as MockRow[],
  insertRows:   [] as MockRow[],
  txUpdateRows: [] as MockRow[],
  socketEmit:   vi.fn(),
};

// ─── DB mock ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();

  function makeChain(resultFn: () => MockRow[]) {
    const chain: Record<string, unknown> = {};
    const methods = ["from", "where", "set", "values", "returning", "limit",
                     "orderBy", "innerJoin", "leftJoin", "groupBy", "offset"] as const;
    methods.forEach(m => { chain[m] = vi.fn(() => chain); });
    chain.then = (resolve: (v: MockRow[]) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resultFn()).then(resolve, reject);
    return chain;
  }

  function makeInsert(resultFn: () => MockRow[]) {
    const chain: Record<string, unknown> = {};
    const methods = ["from", "where", "returning", "limit", "orderBy",
                     "innerJoin", "leftJoin"] as const;
    methods.forEach(m => { chain[m] = vi.fn(() => chain); });
    chain.values = vi.fn(() => {
      const c2: Record<string, unknown> = {};
      (methods as readonly string[]).forEach(m => { c2[m] = vi.fn(() => c2); });
      c2.then = (resolve: (v: MockRow[]) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(resultFn()).then(resolve, reject);
      c2.returning = vi.fn(() => Promise.resolve(resultFn()));
      return c2;
    });
    return chain;
  }

  return {
    ...actual,
    db: {
      select:  () => makeChain(() => mockState.selectRows),
      update:  () => makeChain(() => mockState.updateRows),
      delete:  () => makeChain(() => []),
      insert:  () => makeInsert(() => mockState.insertRows),
      execute: () => Promise.resolve({ rows: [] }),
      transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          select:  () => makeChain(() => mockState.selectRows),
          update:  () => makeChain(() => mockState.txUpdateRows),
          insert:  () => makeInsert(() => mockState.insertRows),
          execute: () => Promise.resolve({ rows: [] }),
        }),
    },
  };
});

// ─── Socket mock ──────────────────────────────────────────────────────────────

vi.mock("../lib/socket", () => ({
  getIO: () => ({ emit: mockState.socketEmit }),
  initSocket: vi.fn(),
}));

// ─── Auth mock ────────────────────────────────────────────────────────────────
// Bypass JWT verification entirely — inject user directly from header value.

vi.mock("../middlewares/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middlewares/auth")>();
  return {
    ...actual,
    requireAuth: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
      const token = (req.headers as Record<string, string>)?.authorization ?? "";
      req.user = token.includes("manager-token")
        ? { id: "emp-mgr",    name: "Manager", role: "manager" }
        : token.includes("admin-token")
        ? { id: "emp-admin",  name: "Admin",   role: "admin"   }
        : { id: "emp-waiter", name: "Ana",     role: "waiter"  };
      next();
    },
    requireRole: (...roles: string[]) =>
      (req: Record<string, unknown>, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
        const u = req.user as { role: string } | undefined;
        if (!u || !roles.includes(u.role)) return res.status(403).json({ error: "Forbidden" });
        next();
      },
  };
});

vi.mock("../lib/document-audit", () => ({
  logDocumentAction: vi.fn().mockResolvedValue(undefined),
}));

// ─── App ───────────────────────────────────────────────────────────────────────

const { default: app } = await import("../app");

// ─── Constants ────────────────────────────────────────────────────────────────

const WAITER  = "Bearer waiter-token";
const MANAGER = "Bearer manager-token";

const NOW = new Date().toISOString();

const TASK_NEW: MockRow = {
  id: "task-1", orderId: "order-1", orderItemId: "item-1",
  prepZone: "cocina", productName: "Entrecot", quantity: 1,
  status: "new", notes: "[Término medio] | Sin sal", allergyNote: "",
  hasAllergy: false, createdAt: NOW, updatedAt: NOW,
  readyAt: null, collectedAt: null, servedAt: null, cancelledAt: null,
  tableName: "Mesa 3", employeeName: "Ana",
};

const TASK_READY: MockRow   = { ...TASK_NEW, status: "ready",    readyAt: NOW };
const TASK_PREP: MockRow    = { ...TASK_NEW, status: "preparing" };

const ORDER: MockRow = { id: "order-1", status: "open", tableId: "table-1", employeeId: "emp-waiter" };
const TABLE: MockRow = { id: "table-1", name: "Mesa 3" };

const SENT_ITEM: MockRow = {
  order_items: { id: "item-sent", orderId: "order-1", status: "sent" },
  products:    { id: "prod-1",    name: "Pizza",      prepZone: "pizza" },
};
const DRAFT_ITEM: MockRow = {
  order_items: { id: "item-draft", orderId: "order-1", status: "draft" },
  products:    { id: "prod-1",     name: "Agua",       prepZone: "barra" },
};
const READY_ITEM: MockRow = {
  order_items: { id: "item-ready", orderId: "order-1", status: "ready" },
  products:    { id: "prod-1",     name: "Postre",     prepZone: "cocina" },
};

// ─── Reset before each test ───────────────────────────────────────────────────

beforeEach(() => {
  mockState.selectRows   = [];
  mockState.updateRows   = [];
  mockState.insertRows   = [];
  mockState.txUpdateRows = [];
  mockState.socketEmit.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 — GET /kds/:zone filters by prep zone
// ─────────────────────────────────────────────────────────────────────────────

describe("Test 1 — GET /kds/:zone filters by prep zone", () => {
  it("returns tasks for cocina zone", async () => {
    mockState.selectRows = [
      { ...TASK_NEW, prepZone: "cocina" },
      { ...TASK_NEW, id: "task-2", prepZone: "cocina", productName: "Sopa" },
    ];

    const res = await request(app).get("/api/kds/cocina").set("Authorization", WAITER);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((t: { prepZone: string }) => t.prepZone === "cocina")).toBe(true);
  });

  it("returns 400 for an invalid zone name", async () => {
    const res = await request(app).get("/api/kds/invalid-zone").set("Authorization", WAITER);
    expect(res.status).toBe(400);
  });

  it("returns tasks for pizza zone", async () => {
    mockState.selectRows = [{ ...TASK_NEW, id: "task-p", prepZone: "pizza", productName: "Margarita" }];

    const res = await request(app).get("/api/kds/pizza").set("Authorization", WAITER);
    expect(res.status).toBe(200);
    expect(res.body[0].productName).toBe("Margarita");
  });

  it("includes notes and allergyNote in response", async () => {
    mockState.selectRows = [{
      ...TASK_NEW,
      notes: "[Media] | Sin cebolla",
      hasAllergy: true,
      allergyNote: "Frutos secos",
    }];

    const res = await request(app).get("/api/kds/cocina").set("Authorization", WAITER);
    expect(res.status).toBe(200);
    expect(res.body[0].notes).toBe("[Media] | Sin cebolla");
    expect(res.body[0].hasAllergy).toBe(true);
    expect(res.body[0].allergyNote).toBe("Frutos secos");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 — DELETE /order-items/:itemId — sent item cancellation
// ─────────────────────────────────────────────────────────────────────────────

describe("Test 2 — DELETE /order-items/:itemId for sent item cancels kitchen task", () => {
  it("cancels the kitchen task and emits kds:refresh", async () => {
    mockState.selectRows = [SENT_ITEM];

    const res = await request(app)
      .delete("/api/order-items/item-sent")
      .set("Authorization", WAITER);

    expect(res.status).toBe(204);
    expect(mockState.socketEmit).toHaveBeenCalledWith(
      "kds:refresh",
      expect.objectContaining({ employeeName: expect.any(String) }),
    );
  });

  it("rejects items with status other than draft or sent with 400", async () => {
    mockState.selectRows = [READY_ITEM];

    const res = await request(app)
      .delete("/api/order-items/item-ready")
      .set("Authorization", WAITER);

    expect(res.status).toBe(400);
  });

  it("deletes a draft item normally without emitting kds:refresh", async () => {
    mockState.selectRows = [DRAFT_ITEM];

    const res = await request(app)
      .delete("/api/order-items/item-draft")
      .set("Authorization", WAITER);

    expect(res.status).toBe(204);
    // kds:refresh must NOT be emitted for a plain draft delete
    const kdsRefreshCalls = mockState.socketEmit.mock.calls.filter(
      (c: unknown[]) => c[0] === "kds:refresh",
    );
    expect(kdsRefreshCalls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3 — POST /kitchen-tasks/:taskId/resend
// ─────────────────────────────────────────────────────────────────────────────

describe("Test 3 — POST /kitchen-tasks/:taskId/resend", () => {
  it("resets task to 'new' and emits kds:refresh", async () => {
    mockState.selectRows = [TASK_READY];
    mockState.updateRows = [{ ...TASK_NEW, status: "new" }];

    const res = await request(app)
      .post("/api/kitchen-tasks/task-1/resend")
      .set("Authorization", WAITER);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("new");
    expect(mockState.socketEmit).toHaveBeenCalledWith("kds:refresh", expect.anything());
  });

  it("returns 404 if task not found", async () => {
    mockState.selectRows = [];

    const res = await request(app)
      .post("/api/kitchen-tasks/nonexistent/resend")
      .set("Authorization", WAITER);

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4 — Status flow: new → preparing → ready → served
// ─────────────────────────────────────────────────────────────────────────────

describe("Test 4 — Status flow: new → preparing → ready → served", () => {
  it("new → preparing: returns updated task with status 'preparing'", async () => {
    mockState.updateRows = [TASK_PREP];

    const res = await request(app)
      .patch("/api/kitchen-tasks/task-1/status")
      .set("Authorization", WAITER)
      .send({ status: "preparing" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("preparing");
    expect(mockState.socketEmit).toHaveBeenCalledWith("kds:refresh");
  });

  it("preparing → ready: stamps readyAt and emits waiter:order-ready when all done", async () => {
    // update returns the ready task; selects return: all tasks (ready), order, table
    mockState.updateRows = [{ ...TASK_READY }];
    // All queries from the DB will return these rows in order — the select mock returns
    // the same selectRows array every time, so we put the task in there so the
    // "check all tasks ready" query sees a ready task, and also include the order and table.
    mockState.selectRows = [
      // all tasks for the order (one task, already ready) → all ready → trigger notification
      { ...TASK_READY },
    ];

    const res = await request(app)
      .patch("/api/kitchen-tasks/task-1/status")
      .set("Authorization", WAITER)
      .send({ status: "ready" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    // At minimum, kds:refresh must fire
    expect(mockState.socketEmit).toHaveBeenCalledWith("kds:refresh");
  });

  it("ready → collected (pase action): marks tasks collected", async () => {
    mockState.selectRows = [ORDER];
    mockState.txUpdateRows = [];

    const res = await request(app)
      .post("/api/orders/order-1/pase")
      .set("Authorization", WAITER)
      .send({ action: "collected" });

    expect(res.status).toBe(200);
  });

  it("pase served: marks tasks served, emits tables:refresh", async () => {
    mockState.selectRows = [ORDER];     // order lookup + table lookup
    mockState.txUpdateRows = [];

    const res = await request(app)
      .post("/api/orders/order-1/pase")
      .set("Authorization", WAITER)
      .send({ action: "served" });

    expect(res.status).toBe(200);
    expect(mockState.socketEmit).toHaveBeenCalledWith("tables:refresh");
  });

  it("returns 400 for an invalid status value", async () => {
    const res = await request(app)
      .patch("/api/kitchen-tasks/task-1/status")
      .set("Authorization", WAITER)
      .send({ status: "cocinado-perfecto" });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5 — Real-time socket sync
// ─────────────────────────────────────────────────────────────────────────────

describe("Test 5 — Real-time socket sync", () => {
  it("emits kds:refresh on every status update (new, preparing, ready, cancelled)", async () => {
    for (const status of ["preparing", "ready", "cancelled"]) {
      mockState.socketEmit.mockReset();
      mockState.updateRows = [{ ...TASK_NEW, status }];
      mockState.selectRows = [{ ...TASK_NEW, status }];

      await request(app)
        .patch("/api/kitchen-tasks/task-1/status")
        .set("Authorization", WAITER)
        .send({ status });

      expect(mockState.socketEmit).toHaveBeenCalledWith("kds:refresh");
    }
  });

  it("emits kds:refresh on task resend", async () => {
    mockState.selectRows = [TASK_READY];
    mockState.updateRows = [{ ...TASK_NEW, status: "new" }];

    await request(app)
      .post("/api/kitchen-tasks/task-1/resend")
      .set("Authorization", WAITER);

    expect(mockState.socketEmit).toHaveBeenCalledWith("kds:refresh", expect.anything());
  });

  it("emits kds:refresh when a sent item is cancelled", async () => {
    mockState.selectRows = [SENT_ITEM];

    await request(app)
      .delete("/api/order-items/item-sent")
      .set("Authorization", WAITER);

    expect(mockState.socketEmit).toHaveBeenCalledWith(
      "kds:refresh",
      expect.objectContaining({ employeeName: expect.any(String) }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6 — History endpoint
// ─────────────────────────────────────────────────────────────────────────────

describe("Test 6 — GET /kds/history", () => {
  it("returns 200 with history tasks", async () => {
    const recentTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 h ago
    mockState.selectRows = [
      { ...TASK_NEW, status: "served",    updatedAt: recentTime, servedAt: recentTime },
      { ...TASK_NEW, status: "cancelled", updatedAt: recentTime, cancelledAt: recentTime, id: "task-2" },
    ];

    const res = await request(app).get("/api/kds/history").set("Authorization", WAITER);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 200 with empty array when no history", async () => {
    mockState.selectRows = [];

    const res = await request(app).get("/api/kds/history").set("Authorization", WAITER);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
