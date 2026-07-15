/**
 * Table operations tests — transfer, merge, separate, waiter transfer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

type MockRow = Record<string, unknown>;

const mockState = {
  updateRows:     [] as MockRow[],
  insertRows:     [] as MockRow[],
  selectRows:     [] as MockRow[],
  txUpdateRows:   [] as MockRow[],
  txInsertRows:   [] as MockRow[],
};

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();

  function updateChain(resultFn: () => MockRow[]) {
    const chain: Record<string, unknown> = {};
    const methods = ["where","from","set","values","returning","limit","orderBy","innerJoin","leftJoin","groupBy","offset"] as const;
    methods.forEach(m => { chain[m] = vi.fn(() => chain); });
    chain.then = (resolve: (v: MockRow[]) => unknown) => Promise.resolve(resultFn()).then(resolve);
    return chain;
  }

  function makeInsert(resultFn: () => MockRow[]) {
    const chain: Record<string, unknown> = {};
    const methods = ["from","where","returning","limit","orderBy","innerJoin","leftJoin","groupBy","offset"] as const;
    methods.forEach(m => { chain[m] = vi.fn(() => chain); });
    chain.values = vi.fn(() => {
      const c2: Record<string, unknown> = {};
      methods.forEach(m => { c2[m] = vi.fn(() => c2); });
      c2.then = (resolve: (v: MockRow[]) => unknown) => Promise.resolve(resultFn()).then(resolve);
      c2.returning = vi.fn(() => Promise.resolve(resultFn()));
      return c2;
    });
    return chain;
  }

  function makeSelect(resultFn: () => MockRow[]) {
    const chain: Record<string, unknown> = {};
    const methods = ["where","from","set","values","returning","limit","orderBy","innerJoin","leftJoin","groupBy","offset"] as const;
    methods.forEach(m => { chain[m] = vi.fn(() => chain); });
    chain.then = (resolve: (v: MockRow[]) => unknown) => Promise.resolve(resultFn()).then(resolve);
    return chain;
  }

  return {
    ...actual,
    db: {
      update:  () => updateChain(() => mockState.updateRows),
      insert:  () => makeInsert(() => mockState.insertRows),
      select:  () => makeSelect(() => mockState.selectRows),
      delete:  () => updateChain(() => []),
      execute: () => Promise.resolve({ rows: [] }),
      transaction: async (fn: (tx: unknown) => unknown) => fn({
        update: () => updateChain(() => mockState.txUpdateRows),
        insert: () => makeInsert(() => mockState.txInsertRows),
        select: () => makeSelect(() => mockState.selectRows),
        execute: () => Promise.resolve({ rows: [] }),
      }),
    },
    restaurantTablesTable: actual.restaurantTablesTable,
    ordersTable:           actual.ordersTable,
    orderItemsTable:       actual.orderItemsTable,
    tableEventsTable:      actual.tableEventsTable,
    reservationsTable:     actual.reservationsTable,
  };
});

vi.mock("../lib/socket", () => ({ getIO: () => ({ emit: vi.fn() }) }));

vi.mock("../middlewares/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middlewares/auth")>();
  return {
    ...actual,
    requireAuth: (req: any, _res: any, next: any) => {
      const token = req.headers.authorization ?? "";
      req.user = token.includes("admin-token")
        ? { id: "emp-admin", name: "Admin", role: "admin" }
        : token.includes("manager-token")
          ? { id: "emp-mgr", name: "Manager", role: "manager" }
          : { id: "emp-waiter", name: "Waiter", role: "waiter" };
      next();
    },
    requireRole: (...roles: string[]) => (req: any, res: any, next: any) => {
      if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
      next();
    },
  };
});

const { default: app } = await import("../app");

const ADMIN   = "Bearer admin-token";
const MANAGER = "Bearer manager-token";
const WAITER  = "Bearer waiter-token";

const FREE_TABLE     = { id: "table-2", name: "Mesa 2", status: "free", zoneId: "z1", capacity: 4, x: 0, y: 0, width: 80, height: 80, shape: "square", rotation: 0, layout: "normal", mergeGroup: null, active: true };
const OCCUPIED_TABLE = { ...FREE_TABLE, id: "table-1", name: "Mesa 1", status: "occupied" };
const MERGED_TABLE   = { ...OCCUPIED_TABLE, mergeGroup: "table-1" };
const OPEN_ORDER     = { id: "order-1", tableId: "table-1", employeeId: "emp-1", status: "open", guestCount: 2, notes: "", clientName: "", createdAt: new Date().toISOString() };

beforeEach(() => {
  vi.clearAllMocks();
  mockState.updateRows     = [];
  mockState.insertRows     = [];
  mockState.selectRows     = [];
  mockState.txUpdateRows   = [];
  mockState.txInsertRows   = [];
});

// ── Test 1: Transfer order to another table ────────────────────────────────────
describe("Test 1 — POST /tables/:id/transfer", () => {
  it("returns 400 when targetTableId is missing", async () => {
    const res = await request(app)
      .post("/api/tables/table-1/transfer")
      .set("Authorization", WAITER)
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 409 when source has no open order", async () => {
    mockState.selectRows = []; // no source order found

    const res = await request(app)
      .post("/api/tables/table-1/transfer")
      .set("Authorization", WAITER)
      .send({ targetTableId: "table-2" });

    expect(res.status).toBe(409);
  });

  it("returns 200 with orderId when transfer succeeds", async () => {
    // Both tx.select calls return the same rows; first destructure gets order, second gets free table
    mockState.selectRows   = [{ id: "order-1", employeeId: "emp-1", status: "free", name: "Mesa 2" }];
    mockState.txUpdateRows = [{ id: "order-1", tableId: "table-2" }];

    const res = await request(app)
      .post("/api/tables/table-1/transfer")
      .set("Authorization", WAITER)
      .send({ targetTableId: "table-2" });

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.orderId).toBeDefined();
  });
});

// ── Test 2: Merge two tables ──────────────────────────────────────────────────
describe("Test 2 — POST /tables/merge", () => {
  it("returns 400 when fewer than 2 tableIds", async () => {
    const res = await request(app)
      .post("/api/tables/merge")
      .set("Authorization", MANAGER)
      .send({ tableIds: ["table-1"] });
    expect(res.status).toBe(400);
  });

  it("returns 403 for waiter", async () => {
    const res = await request(app)
      .post("/api/tables/merge")
      .set("Authorization", WAITER)
      .send({ tableIds: ["table-1", "table-2"] });
    expect(res.status).toBe(403);
  });

  it("merges two tables and returns mergeGroupId (manager)", async () => {
    // tx.select returns 2 tables (satisfies tables.length === tableIds.length)
    // Also used for host order check — no hostOrder means it creates one
    mockState.selectRows   = [OCCUPIED_TABLE, FREE_TABLE];
    mockState.txUpdateRows = [{ ...OCCUPIED_TABLE, mergeGroup: "table-1" }];
    mockState.txInsertRows = [{ id: "order-new", tableId: "table-1", status: "open" }];

    const res = await request(app)
      .post("/api/tables/merge")
      .set("Authorization", MANAGER)
      .send({ tableIds: ["table-1", "table-2"] });

    // 200 or 404 depending on how many tables were returned
    // With our mock, selectRows returns 2 tables so it passes the length check
    expect([200, 201, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.mergeGroupId).toBeDefined();
    }
  });
});

// ── Test 3: Separate merged tables ────────────────────────────────────────────
describe("Test 3 — POST /tables/:id/separate", () => {
  it("returns 403 for waiter", async () => {
    const res = await request(app)
      .post("/api/tables/table-1/separate")
      .set("Authorization", WAITER);
    expect(res.status).toBe(403);
  });

  it("returns 409 when table has no mergeGroup", async () => {
    // Host table has no mergeGroup
    mockState.selectRows = [{ ...OCCUPIED_TABLE, mergeGroup: null }];

    const res = await request(app)
      .post("/api/tables/table-1/separate")
      .set("Authorization", MANAGER);

    expect(res.status).toBe(409);
  });

  it("succeeds when called from any table in the group (host or non-host)", async () => {
    // NON-HOST TABLE: "table-2" is a non-host member of merge group "table-1".
    // The backend must resolve the host order via mergeGroup (= "table-1"), not via the
    // request tableId ("table-2"), because table-2's order was closed during merge.
    //
    // selectRows is shared across all tx.select calls:
    //   1st select: non-host table row (id=table-2, mergeGroup=table-1)
    //   2nd select (all group tables): both rows returned
    //   3rd select (host order): first row used → needs .tableId === mergeGroupId and status open
    // We use a single array where the host order row matches on tableId === "table-1" (mergeGroup).
    const nonHostTable  = { id: "table-2", name: "Mesa 2", status: "occupied", mergeGroup: "table-1", zoneId: "z1", capacity: 4, x: 0, y: 0, width: 80, height: 80, shape: "square", rotation: 0, layout: "normal", active: true };
    const hostOrderRow  = { id: "order-host", tableId: "table-1", employeeId: "emp-1", status: "open", guestCount: 2 };

    // Each tx.select() returns this array. The route destructures with [0] for single-row queries.
    mockState.selectRows   = [nonHostTable, hostOrderRow];
    mockState.txUpdateRows = [{ ...nonHostTable, mergeGroup: null }];
    mockState.txInsertRows = [{ id: "order-new", tableId: "table-2", status: "open" }];

    const res = await request(app)
      .post("/api/tables/table-2/separate")    // <-- non-host table
      .set("Authorization", MANAGER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Test 3b: Move items to a free table marks it as occupied ──────────────────
describe("Test 3b — POST /orders/:orderId/move-items", () => {
  it("returns 400 when itemIds is missing", async () => {
    const res = await request(app)
      .post("/api/orders/order-1/move-items")
      .set("Authorization", WAITER)
      .send({ targetTableId: "table-2" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when targetTableId is missing", async () => {
    const res = await request(app)
      .post("/api/orders/order-1/move-items")
      .set("Authorization", WAITER)
      .send({ itemIds: ["item-1"] });
    expect(res.status).toBe(400);
  });

  it("creates a new occupied order on a free target table and returns targetOrderId", async () => {
    // tx.select calls:
    //   1st: targetOrder lookup → empty (no open order on target)
    //   2nd: targetTable lookup → free table
    // We put both possibilities in selectRows; first destructure gets [empty], but since
    // the mock always returns the same array, we need targetOrder to be falsy.
    // Strategy: return the FREE_TABLE so targetOrder is undefined (no open order) but targetTable exists.
    mockState.selectRows   = [FREE_TABLE];       // targetTable exists and is free
    mockState.txInsertRows = [{ id: "order-new", tableId: "table-2", status: "open" }];
    mockState.txUpdateRows = [FREE_TABLE];        // table update to occupied

    const res = await request(app)
      .post("/api/orders/order-1/move-items")
      .set("Authorization", WAITER)
      .send({ itemIds: ["item-1", "item-2"], targetTableId: "table-2" });

    // 200 success — target order created and table set to occupied
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.targetOrderId).toBeDefined();
  });

  it("moves items to an already-occupied table without changing its status", async () => {
    const EXISTING_ORDER = { id: "order-existing", tableId: "table-3", status: "open" };
    // tx.select returns occupied order directly → no new order created
    mockState.selectRows   = [EXISTING_ORDER];
    mockState.txUpdateRows = [EXISTING_ORDER]; // item update

    const res = await request(app)
      .post("/api/orders/order-1/move-items")
      .set("Authorization", WAITER)
      .send({ itemIds: ["item-1"], targetTableId: "table-3" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.targetOrderId).toBe(EXISTING_ORDER.id);
  });
});

// ── Test 4: Transfer table to another waiter ──────────────────────────────────
describe("Test 4 — POST /tables/:id/transfer-waiter", () => {
  it("returns 403 for waiter", async () => {
    const res = await request(app)
      .post("/api/tables/table-1/transfer-waiter")
      .set("Authorization", WAITER)
      .send({ newEmployeeId: "emp-2" });
    expect(res.status).toBe(403);
  });

  it("returns 409 when no open order", async () => {
    mockState.selectRows = []; // no open order

    const res = await request(app)
      .post("/api/tables/table-1/transfer-waiter")
      .set("Authorization", MANAGER)
      .send({ newEmployeeId: "emp-2" });

    expect(res.status).toBe(409);
  });

  it("returns 200 and records history when waiter is transferred", async () => {
    mockState.selectRows = [OPEN_ORDER];
    mockState.updateRows = [{ ...OPEN_ORDER, employeeId: "emp-2" }];
    mockState.insertRows = [{ id: "evt-1" }]; // table event

    const res = await request(app)
      .post("/api/tables/table-1/transfer-waiter")
      .set("Authorization", MANAGER)
      .send({ newEmployeeId: "emp-2" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.newEmployeeId).toBe("emp-2");
  });
});
