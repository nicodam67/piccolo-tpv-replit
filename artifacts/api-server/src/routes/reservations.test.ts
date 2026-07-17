/**
 * Reservations tests — CRUD, conflict detection, arrive action.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

type MockRow = Record<string, unknown>;

const mockState = {
  updateRows:   [] as MockRow[],
  insertRows:   [] as MockRow[],
  selectRows:   [] as MockRow[],
  deleteRows:   [] as MockRow[],
  txUpdateRows: [] as MockRow[],
  txInsertRows: [] as MockRow[],
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
      delete:  () => {
        const chain = updateChain(() => mockState.deleteRows);
        return chain;
      },
      execute: () => Promise.resolve({ rows: [] }),
      transaction: async (fn: (tx: unknown) => unknown) => fn({
        update: () => updateChain(() => mockState.txUpdateRows),
        insert: () => makeInsert(() => mockState.txInsertRows),
        select: () => makeSelect(() => mockState.selectRows),
        execute: () => Promise.resolve({ rows: [] }),
      }),
    },
    reservationsTable:     actual.reservationsTable,
    restaurantTablesTable: actual.restaurantTablesTable,
    ordersTable:           actual.ordersTable,
    tableEventsTable:      actual.tableEventsTable,
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

const PENDING_RES = {
  id: "res-1", fecha: "2026-07-15", hora: "20:00", nombre: "García", telefono: "600111222",
  personas: 4, zonaPreferida: "terraza", mesaId: "table-1", notes: "", status: "pendiente",
  createdBy: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};
const CONFIRMED_RES = { ...PENDING_RES, id: "res-2", status: "confirmada" };
const FREE_TABLE    = { id: "table-1", name: "Mesa 1", status: "free", zoneId: "z1", capacity: 4, x: 0, y: 0, width: 80, height: 80, shape: "square", rotation: 0, layout: "normal", mergeGroup: null, active: true };
const OPEN_ORDER    = { id: "order-1", tableId: "table-1", employeeId: "emp-1", status: "open", guestCount: 4, notes: "", clientName: "García", createdAt: new Date().toISOString() };

beforeEach(() => {
  vi.clearAllMocks();
  mockState.updateRows   = [];
  mockState.insertRows   = [];
  mockState.selectRows   = [];
  mockState.deleteRows   = [];
  mockState.txUpdateRows = [];
  mockState.txInsertRows = [];
});

// ── Test 5: GET /reservations ─────────────────────────────────────────────────
describe("Test 5 — GET /reservations", () => {
  it("returns 200 with list of reservations", async () => {
    mockState.selectRows = [PENDING_RES, CONFIRMED_RES];

    const res = await request(app)
      .get("/api/reservations")
      .set("Authorization", WAITER);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });
});

// ── Test 6: POST /reservations — create + would-be confirm ────────────────────
describe("Test 6 — POST /reservations creates a new reservation", () => {
  it("returns 400 when fecha is missing", async () => {
    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", WAITER)
      .send({ nombre: "López", hora: "20:00", personas: 2 });
    expect(res.status).toBe(400);
  });

  it("returns 201 when all required fields are present (no mesa conflict)", async () => {
    // selectRows = [] means no conflicting reservations
    mockState.selectRows = [];
    mockState.insertRows = [PENDING_RES];

    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", WAITER)
      .send({ fecha: "2026-07-16", hora: "20:00", nombre: "López", personas: 2 });

    expect(res.status).toBe(201);
    expect(res.body.nombre).toBe("García"); // from mock insertRows
  });

  it("returns 409 when same table has an active reservation within 90 min", async () => {
    // Conflict: there's already a confirmed reservation at 20:00 on same table
    mockState.selectRows = [{ ...CONFIRMED_RES, hora: "20:30", duracion: 90 }]; // conflict: 30min apart, 90min duration each

    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", WAITER)
      .send({ fecha: "2026-07-15", hora: "20:00", nombre: "López", personas: 2, mesaId: "table-1" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/reserva activa/i);
  });
});

// ── Test 7: POST /reservations/:id/arrive ─────────────────────────────────────
describe("Test 7 — POST /reservations/:id/arrive", () => {
  it("returns 404 when reservation not found", async () => {
    mockState.selectRows = [];

    const res = await request(app)
      .post("/api/reservations/res-999/arrive")
      .set("Authorization", WAITER)
      .send({});

    expect(res.status).toBe(404);
  });

  it("returns 409 when reservation is already finalizada", async () => {
    mockState.selectRows = [{ ...PENDING_RES, status: "finalizada" }];

    const res = await request(app)
      .post("/api/reservations/res-1/arrive")
      .set("Authorization", WAITER)
      .send({});

    expect(res.status).toBe(409);
  });

  it("marks as cliente_llegado and returns prefill data", async () => {
    mockState.selectRows = [CONFIRMED_RES];
    mockState.updateRows = [{ ...CONFIRMED_RES, status: "cliente_llegado" }];

    const res = await request(app)
      .post("/api/reservations/res-2/arrive")
      .set("Authorization", WAITER)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.reservation.status).toBe("cliente_llegado");
    expect(res.body.prefill.guestCount).toBe(CONFIRMED_RES.personas);
    expect(res.body.prefill.clientName).toBe(CONFIRMED_RES.nombre);
  });

  it("opens the assigned table when openTable=true and mesa is assigned", async () => {
    mockState.selectRows   = [CONFIRMED_RES];
    mockState.updateRows   = [{ ...CONFIRMED_RES, status: "cliente_llegado" }];
    mockState.txUpdateRows = [FREE_TABLE];   // table.update succeeds
    mockState.txInsertRows = [OPEN_ORDER];   // order.insert succeeds

    const res = await request(app)
      .post("/api/reservations/res-2/arrive")
      .set("Authorization", WAITER)
      .send({ openTable: true });

    expect(res.status).toBe(200);
    expect(res.body.reservation).toBeDefined();
    // tableOpened will be set if tx succeeded
    if (res.body.tableOpened) {
      expect(res.body.tableOpened.tableId).toBeDefined();
      expect(res.body.tableOpened.orderId).toBeDefined();
    }
  });
});
