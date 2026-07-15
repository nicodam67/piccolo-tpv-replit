/**
 * Table-states tests — 6 scenarios covering the 9-status lifecycle.
 * Pattern: module-level mutable stubs, no per-test vi.spyOn.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ── Shared stub state (mutated per test) ─────────────────────────────────────
type MockRow = Record<string, unknown>;

const mockState = {
  updateRows:     [] as MockRow[],
  insertRows:     [] as MockRow[],
  selectRows:     [] as MockRow[],
  executeSqlRows: [] as MockRow[],
  // For the transaction mock
  txUpdateRows:   [] as MockRow[],
  txInsertRows:   [] as MockRow[],
};

// ── DB mock ───────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();

  function updateChain(resultFn: () => MockRow[]) {
    const chain: Record<string, unknown> = {};
    const methods = ["where","from","set","values","returning","limit","orderBy",
      "innerJoin","leftJoin","groupBy","offset"] as const;
    methods.forEach(m => { chain[m] = vi.fn(() => chain); });
    chain.then = (resolve: (v: MockRow[]) => unknown) =>
      Promise.resolve(resultFn()).then(resolve);
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
    const methods = ["where","from","set","values","returning","limit","orderBy",
      "innerJoin","leftJoin","groupBy","offset"] as const;
    methods.forEach(m => { chain[m] = vi.fn(() => chain); });
    chain.then = (resolve: (v: MockRow[]) => unknown) => Promise.resolve(resultFn()).then(resolve);
    return chain;
  }

  return {
    ...actual,
    db: {
      update:  ()  => updateChain(() => mockState.updateRows),
      insert:  ()  => makeInsert(() => mockState.insertRows),
      select:  ()  => makeSelect(() => mockState.selectRows),
      delete:  ()  => updateChain(() => []),
      execute: ()  => Promise.resolve({ rows: mockState.executeSqlRows }),
      transaction: async (fn: (tx: unknown) => unknown) => fn({
        update: ()  => updateChain(() => mockState.txUpdateRows),
        insert: ()  => makeInsert(() => mockState.txInsertRows),
        select: ()  => makeSelect(() => mockState.selectRows),
        execute: () => Promise.resolve({ rows: [] }),
      }),
    },
    restaurantTablesTable: actual.restaurantTablesTable,
    roomZonesTable:        actual.roomZonesTable,
    ordersTable:           actual.ordersTable,
    tableEventsTable:      actual.tableEventsTable,
    alertConfigTable:      actual.alertConfigTable,
  };
});

vi.mock("../lib/socket", () => ({ getIO: () => ({ emit: vi.fn() }) }));

// ── Auth middleware override ───────────────────────────────────────────────────
vi.mock("../middlewares/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middlewares/auth")>();
  return {
    ...actual,
    requireAuth: (req: any, _res: any, next: any) => {
      const token = req.headers.authorization ?? "";
      if (token.includes("admin-token")) {
        req.user = { id: "emp-admin", name: "Admin", role: "admin" };
      } else {
        req.user = { id: "emp-waiter", name: "Waiter", role: "waiter" };
      }
      next();
    },
    requireRole: (...roles: string[]) => (req: any, res: any, next: any) => {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      next();
    },
  };
});

const { default: app } = await import("../app");

const ADMIN  = "Bearer admin-token";
const WAITER = "Bearer waiter-token";

// ── Fixtures ───────────────────────────────────────────────────────────────────
const FREE_TABLE = { id: "table-1", zoneId: "zone-1", name: "Mesa 1", capacity: 4, status: "free", x: 100, y: 100, width: 80, height: 80, shape: "square", rotation: 0, layout: "normal", mergeGroup: null, active: true };
const OCCUPIED_TABLE    = { ...FREE_TABLE, status: "occupied" };
const PENDING_CLEANING  = { ...FREE_TABLE, status: "pendiente_limpieza" };
const OPEN_ORDER = { id: "order-1", tableId: "table-1", employeeId: "emp-1", status: "open", guestCount: 2, notes: "", clientName: "", openedByTerminal: "", createdAt: new Date().toISOString() };
const ALERT_CFG = { id: "cfg-1", reservaProximaMin: 30, sinComandaMin: 15, prefacturaPendienteMin: 10, mesaSuciaMin: 5, updatedAt: new Date().toISOString() };

beforeEach(() => {
  vi.clearAllMocks();
  mockState.updateRows     = [];
  mockState.insertRows     = [];
  mockState.selectRows     = [];
  mockState.executeSqlRows = [];
  mockState.txUpdateRows   = [];
  mockState.txInsertRows   = [];
});

// ── Test 1: Open free table → 200 ─────────────────────────────────────────────
describe("Test 1 — POST /tables/:id/open on a free table", () => {
  it("returns 200 with table and order when table is free", async () => {
    mockState.txUpdateRows = [OCCUPIED_TABLE]; // transaction update finds the free table and marks occupied
    mockState.txInsertRows = [OPEN_ORDER];     // order insertion succeeds

    const res = await request(app)
      .post("/api/tables/table-1/open")
      .set("Authorization", WAITER)
      .send({ guestCount: 2, clientName: "Ana", terminalName: "T1" });

    // 200 or 201 depending on route; the key check is non-409
    expect([200, 201]).toContain(res.status);
    expect(res.body.table).toBeDefined();
    expect(res.body.order).toBeDefined();
  });
});

// ── Test 2: Open occupied table → 409 ─────────────────────────────────────────
describe("Test 2 — POST /tables/:id/open on occupied table", () => {
  it("returns 409 when no eligible table is found by the transaction", async () => {
    mockState.txUpdateRows = []; // transaction update finds no free/reserved table

    const res = await request(app)
      .post("/api/tables/table-1/open")
      .set("Authorization", WAITER)
      .send({ guestCount: 2 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/disponible/i);
  });
});

// ── Test 3: Close occupied table → pendiente_limpieza ─────────────────────────
describe("Test 3 — POST /tables/:id/close sets pendiente_limpieza", () => {
  it("returns the table with status pendiente_limpieza", async () => {
    mockState.updateRows = [{ ...OCCUPIED_TABLE, status: "pendiente_limpieza" }];

    const res = await request(app)
      .post("/api/tables/table-1/close")
      .set("Authorization", WAITER);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pendiente_limpieza");
  });
});

// ── Test 4: Clean pendiente_limpieza → free ────────────────────────────────────
describe("Test 4 — POST /tables/:id/clean releases table to free", () => {
  it("returns the table with status free", async () => {
    mockState.updateRows = [{ ...PENDING_CLEANING, status: "free" }];

    const res = await request(app)
      .post("/api/tables/table-1/clean")
      .set("Authorization", WAITER);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("free");
  });
});

// ── Test 5: Alert config PATCH roundtrip ──────────────────────────────────────
describe("Test 5 — PATCH /admin/alert-config updates thresholds", () => {
  it("returns updated config (admin)", async () => {
    const updated = { ...ALERT_CFG, sinComandaMin: 20 };
    mockState.selectRows = [ALERT_CFG];
    mockState.updateRows = [updated];

    const res = await request(app)
      .patch("/api/admin/alert-config")
      .set("Authorization", ADMIN)
      .send({ sinComandaMin: 20 });

    expect(res.status).toBe(200);
    expect(res.body.sinComandaMin).toBe(20);
  });

  it("returns 403 for waiter", async () => {
    const res = await request(app)
      .patch("/api/admin/alert-config")
      .set("Authorization", WAITER)
      .send({ sinComandaMin: 5 });
    expect(res.status).toBe(403);
  });
});

// ── Test 6: Occupation summary counts ─────────────────────────────────────────
describe("Test 6 — GET /tables/occupation-summary", () => {
  it("returns correct aggregated counts", async () => {
    mockState.executeSqlRows = [
      { status: "free",            count: "5", guests: "0",  avg_open_min: "0" },
      { status: "occupied",        count: "3", guests: "8",  avg_open_min: "45" },
      { status: "comanda_abierta", count: "2", guests: "6",  avg_open_min: "30" },
      { status: "reserved",        count: "1", guests: "0",  avg_open_min: "0" },
      { status: "pendiente_limpieza", count: "1", guests: "0", avg_open_min: "0" },
    ];

    const res = await request(app)
      .get("/api/tables/occupation-summary")
      .set("Authorization", WAITER);

    expect(res.status).toBe(200);
    expect(res.body.freeCount).toBe(5);
    expect(res.body.occupiedCount).toBe(5);    // 3 + 2 comanda_abierta
    expect(res.body.reservedCount).toBe(1);
    expect(res.body.currentGuests).toBe(14);   // 8 + 6
    expect(res.body.pendingCleaningCount).toBe(1);
  });
});
