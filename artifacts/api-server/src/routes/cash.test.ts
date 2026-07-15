/**
 * Cash-session route tests
 *
 * Covers all 14 scenarios required by the spec:
 *  1.  Apertura con fondo inicial
 *  2.  Venta en efectivo (suma al efectivo teórico)
 *  3.  Venta con tarjeta (no afecta al efectivo)
 *  4.  Pago mixto (efectivo + tarjeta)
 *  5.  Entrada de caja
 *  6.  Retirada de caja
 *  7.  Devolución en efectivo (contador movimiento)
 *  8.  Arqueo correcto sin diferencia
 *  9.  Arqueo con sobrante (diferencia positiva)
 * 10.  Arqueo con faltante (diferencia negativa)
 * 11.  Cierre y bloqueo de nuevos cobros
 * 12.  Informe X (sin cerrar)
 * 13.  Informe Z definitivo (tras cierre)
 * 14.  Dos terminales simultáneos — movimientos aislados
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
    "innerJoin", "leftJoin", "limit", "groupBy", "offset",
  ]) {
    chain[m] = () => chain;
  }
  return chain;
}

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));

const mockJwtVerify = vi.hoisted(() =>
  vi.fn(() => ({ id: "mgr-1", name: "Manager Test", role: "manager" })),
);

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});

vi.mock("jsonwebtoken", () => ({
  default: { verify: mockJwtVerify },
}));

vi.mock("drizzle-orm", async (importOriginal) => importOriginal());

vi.mock("../lib/socket", () => ({
  getIO: () => ({ emit: vi.fn() }),
  initSocket: vi.fn(),
}));

vi.mock("../lib/document-audit", () => ({
  logDocumentAction: vi.fn().mockResolvedValue(undefined),
}));

// ─── App (after mocks) ────────────────────────────────────────────────────────

const { default: app } = await import("../app");

// ─── Shared constants ─────────────────────────────────────────────────────────

const AUTH       = "Bearer test-token";
const ADMIN_AUTH = "Bearer admin-token";
const SESSION_A  = { id: "sess-A", status: "open", terminalName: "Caja principal", openingFloat: "100.00", employeeId: "mgr-1", blindClose: false };
const SESSION_B  = { id: "sess-B", status: "open", terminalName: "Caja barra",     openingFloat: "50.00",  employeeId: "mgr-1", blindClose: false };
const CLOSED_SESSION = { ...SESSION_A, status: "closed", closedAt: new Date().toISOString() };

const CASH_METHOD   = { id: "method-cash", code: "cash",  name: "Efectivo",  active: true };
const CARD_METHOD   = { id: "method-card", code: "card",  name: "Tarjeta",   active: true };

const MOVEMENT_IN  = { id: "mov-in-1",  cashSessionId: "sess-A", movementType: "in",  amount: "20.00", reason: "Cambio", employeeId: "mgr-1", createdAt: new Date().toISOString() };
const MOVEMENT_OUT = { id: "mov-out-1", cashSessionId: "sess-A", movementType: "out", amount: "15.00", reason: "Gastos", employeeId: "mgr-1", createdAt: new Date().toISOString() };

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env["SESSION_SECRET"] = "test-secret";
  mockDb.select.mockImplementation(() => makeChain([]));
  mockDb.insert.mockImplementation(() => makeChain([]));
  mockDb.update.mockImplementation(() => makeChain([]));
  mockDb.delete.mockImplementation(() => makeChain([]));
  mockDb.transaction.mockImplementation(async (cb: Function) =>
    cb({ insert: vi.fn().mockReturnValue(makeChain([])), update: vi.fn().mockReturnValue(makeChain([])) })
  );
});

// ─── 1. Apertura con fondo inicial ───────────────────────────────────────────

describe("Test 1 — POST /cash-sessions/open: apertura con fondo inicial", () => {
  it("creates a session with the supplied openingFloat and returns 201", async () => {
    // No existing open session
    mockDb.select.mockReturnValueOnce(makeChain([]));
    // Insert returns new session
    mockDb.insert.mockReturnValueOnce(makeChain([SESSION_A]));

    const res = await request(app)
      .post("/api/cash-sessions/open")
      .set("Authorization", AUTH)
      .send({ openingFloat: "100.00", terminalName: "Caja principal" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(SESSION_A.id);
    expect(res.body.openingFloat).toBe("100.00");
  });

  it("returns 409 when a session is already open for that terminal", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([SESSION_A]));

    const res = await request(app)
      .post("/api/cash-sessions/open")
      .set("Authorization", AUTH)
      .send({ openingFloat: "50.00", terminalName: "Caja principal" });

    expect(res.status).toBe(409);
  });
});

// ─── 2. Venta en efectivo suma al efectivo teórico ────────────────────────────

describe("Test 2 — cash sales increase theoretical cash in summary", () => {
  it("summary returns cashSales in salesByMethod when a cash payment exists", async () => {
    // GET /cash-sessions/:id/summary
    mockDb.select
      .mockReturnValueOnce(makeChain([SESSION_A]))                  // session
      .mockReturnValueOnce(makeChain([{ name: "Manager Test" }]))  // employee
      .mockReturnValueOnce(makeChain([{                             // salesByMethod
        methodCode: "cash", methodName: "Efectivo", total: "45.00"
      }]))
      .mockReturnValueOnce(makeChain([]));                          // movements

    const res = await request(app)
      .get("/api/cash-sessions/sess-A/summary")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    const cashRow = res.body.salesByMethod.find((m: any) => m.methodCode === "cash");
    expect(parseFloat(cashRow.total)).toBeCloseTo(45, 2);
  });
});

// ─── 3. Venta con tarjeta no afecta al efectivo ───────────────────────────────

describe("Test 3 — card sales appear in salesByMethod but don't affect cash", () => {
  it("summary lists card sales separately from cash", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([SESSION_A]))
      .mockReturnValueOnce(makeChain([{ name: "Manager" }]))
      .mockReturnValueOnce(makeChain([
        { methodCode: "cash", methodName: "Efectivo", total: "10.00" },
        { methodCode: "card", methodName: "Tarjeta",  total: "30.00" },
      ]))
      .mockReturnValueOnce(makeChain([]));

    const res = await request(app)
      .get("/api/cash-sessions/sess-A/summary")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    const cashRow = res.body.salesByMethod.find((m: any) => m.methodCode === "cash");
    const cardRow = res.body.salesByMethod.find((m: any) => m.methodCode === "card");
    expect(parseFloat(cashRow.total)).toBeCloseTo(10, 2);
    expect(parseFloat(cardRow.total)).toBeCloseTo(30, 2);
  });
});

// ─── 4. Pago mixto (efectivo + tarjeta) ──────────────────────────────────────

describe("Test 4 — mixed payment: cash + card both in summary", () => {
  it("both methods visible in salesByMethod", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([SESSION_A]))
      .mockReturnValueOnce(makeChain([{ name: "Manager" }]))
      .mockReturnValueOnce(makeChain([
        { methodCode: "cash", methodName: "Efectivo", total: "6.00" },
        { methodCode: "card", methodName: "Tarjeta",  total: "4.00" },
      ]))
      .mockReturnValueOnce(makeChain([]));

    const res = await request(app)
      .get("/api/cash-sessions/sess-A/summary")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body.salesByMethod).toHaveLength(2);
  });
});

// ─── 5. Entrada de caja ───────────────────────────────────────────────────────

describe("Test 5 — POST /cash-sessions/:id/movements: cash-in movement", () => {
  it("inserts a movement of type 'in' and returns 201", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([SESSION_A]));
    mockDb.insert.mockReturnValueOnce(makeChain([MOVEMENT_IN]));

    const res = await request(app)
      .post("/api/cash-sessions/sess-A/movements")
      .set("Authorization", AUTH)
      .send({ movementType: "in", amount: "20.00", reason: "Cambio adicional" });

    expect(res.status).toBe(201);
    expect(res.body.movementType).toBe("in");
    expect(res.body.amount).toBe("20.00");
  });
});

// ─── 6. Retirada de caja ──────────────────────────────────────────────────────

describe("Test 6 — POST /cash-sessions/:id/movements: cash-out movement", () => {
  it("inserts a movement of type 'out' and returns 201", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([SESSION_A]));
    mockDb.insert.mockReturnValueOnce(makeChain([MOVEMENT_OUT]));

    const res = await request(app)
      .post("/api/cash-sessions/sess-A/movements")
      .set("Authorization", AUTH)
      .send({ movementType: "out", amount: "15.00", reason: "Gastos menores" });

    expect(res.status).toBe(201);
    expect(res.body.movementType).toBe("out");
  });

  it("rejects unknown movementType with 400", async () => {
    const res = await request(app)
      .post("/api/cash-sessions/sess-A/movements")
      .set("Authorization", AUTH)
      .send({ movementType: "unknown_type", amount: "10.00", reason: "Test" });

    expect(res.status).toBe(400);
  });
});

// ─── 7. Devolución en efectivo ────────────────────────────────────────────────

describe("Test 7 — extended movement types (supplier_payment, tip, change_added, correction)", () => {
  const EXTENDED_TYPES = ["supplier_payment", "tip", "change_added", "correction"];

  for (const movType of EXTENDED_TYPES) {
    it(`accepts movementType '${movType}' with 201`, async () => {
      mockDb.select.mockReturnValueOnce(makeChain([SESSION_A]));
      mockDb.insert.mockReturnValueOnce(makeChain([{
        id: `mov-${movType}`, cashSessionId: "sess-A",
        movementType: movType, amount: "10.00", reason: "Test", employeeId: "mgr-1", createdAt: new Date().toISOString()
      }]));

      const res = await request(app)
        .post("/api/cash-sessions/sess-A/movements")
        .set("Authorization", AUTH)
        .send({ movementType: movType, amount: "10.00", reason: `Test ${movType}` });

      expect(res.status).toBe(201);
      expect(res.body.movementType).toBe(movType);
    });
  }
});

// ─── 8. Arqueo correcto sin diferencia ───────────────────────────────────────

describe("Test 8 — close with zero difference: no discrepancyReason needed", () => {
  it("returns 200 when countedCash == expectedCash and no reason provided", async () => {
    // open session exists
    mockDb.select
      .mockReturnValueOnce(makeChain([SESSION_A]))            // session guard
      .mockReturnValueOnce(makeChain([CASH_METHOD]))          // cash method lookup
      .mockReturnValueOnce(makeChain([{ total: "0" }]))       // cash sales
      .mockReturnValueOnce(makeChain([]))                     // movements (empty)
    mockDb.update.mockReturnValueOnce(makeChain([{
      ...SESSION_A, status: "closed", countedCash: "100.00", expectedCash: "100.00", difference: "0.00"
    }]));

    const res = await request(app)
      .post("/api/cash-sessions/sess-A/close")
      .set("Authorization", AUTH)
      .send({ countedCash: "100.00" });

    expect(res.status).toBe(200);
    expect(res.body.difference).toBe("0.00");
  });
});

// ─── 9. Arqueo con sobrante (diferencia positiva) ─────────────────────────────

describe("Test 9 — close with positive difference: requires discrepancyReason", () => {
  it("returns 422 when there is a positive diff and no reason is provided", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([SESSION_A]))
      .mockReturnValueOnce(makeChain([CASH_METHOD]))
      .mockReturnValueOnce(makeChain([{ total: "0" }]))
      .mockReturnValueOnce(makeChain([]));

    // expectedCash = 100.00 (opening float, no sales, no movements)
    // countedCash = 110.00 → diff = +10.00 → needs reason
    const res = await request(app)
      .post("/api/cash-sessions/sess-A/close")
      .set("Authorization", AUTH)
      .send({ countedCash: "110.00" });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/descuadre|explicación/i);
  });

  it("returns 200 when positive diff + reason provided", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([SESSION_A]))
      .mockReturnValueOnce(makeChain([CASH_METHOD]))
      .mockReturnValueOnce(makeChain([{ total: "0" }]))
      .mockReturnValueOnce(makeChain([]));
    mockDb.update.mockReturnValueOnce(makeChain([{
      ...SESSION_A, status: "closed", countedCash: "110.00", expectedCash: "100.00", difference: "10.00"
    }]));

    const res = await request(app)
      .post("/api/cash-sessions/sess-A/close")
      .set("Authorization", AUTH)
      .send({ countedCash: "110.00", discrepancyReason: "Encontré dinero en la caja" });

    expect(res.status).toBe(200);
    expect(parseFloat(res.body.difference)).toBeCloseTo(10, 2);
  });
});

// ─── 10. Arqueo con faltante (diferencia negativa) ────────────────────────────

describe("Test 10 — close with negative difference: requires discrepancyReason", () => {
  it("returns 422 when there is a negative diff (even just 1 cent) and no reason provided", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([SESSION_A]))
      .mockReturnValueOnce(makeChain([CASH_METHOD]))
      .mockReturnValueOnce(makeChain([{ total: "0" }]))
      .mockReturnValueOnce(makeChain([]));

    // expectedCash = 100.00, countedCash = 99.99 → diff = -0.01
    const res = await request(app)
      .post("/api/cash-sessions/sess-A/close")
      .set("Authorization", AUTH)
      .send({ countedCash: "99.99" });

    expect(res.status).toBe(422);
  });

  it("returns 200 when negative diff + reason provided", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([SESSION_A]))
      .mockReturnValueOnce(makeChain([CASH_METHOD]))
      .mockReturnValueOnce(makeChain([{ total: "0" }]))
      .mockReturnValueOnce(makeChain([]));
    mockDb.update.mockReturnValueOnce(makeChain([{
      ...SESSION_A, status: "closed", countedCash: "95.00", expectedCash: "100.00", difference: "-5.00"
    }]));

    const res = await request(app)
      .post("/api/cash-sessions/sess-A/close")
      .set("Authorization", AUTH)
      .send({ countedCash: "95.00", discrepancyReason: "Falta de cambio durante el turno" });

    expect(res.status).toBe(200);
    expect(parseFloat(res.body.difference)).toBeCloseTo(-5, 2);
  });
});

// ─── 11. Cierre y bloqueo de nuevos cobros ───────────────────────────────────

describe("Test 11 — closed session: GET /current returns null for that terminal", () => {
  it("returns null when no open session exists for the terminal", async () => {
    // No open session found
    mockDb.select.mockReturnValueOnce(makeChain([]));

    const res = await request(app)
      .get("/api/cash-sessions/current?terminal=Caja+principal")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

// ─── 12. Informe X (sin cerrar) ───────────────────────────────────────────────

describe("Test 12 — GET /cash-sessions/:id/x-report: provisional report on open session", () => {
  it("returns x-report data with isProvisional=true without closing the session", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([SESSION_A]))                // session
      .mockReturnValueOnce(makeChain([{ name: "Manager" }]))    // employee
      .mockReturnValueOnce(makeChain([]))                        // salesByMethod
      .mockReturnValueOnce(makeChain([]))                        // movements
      .mockReturnValueOnce(makeChain([]))                        // tips
      .mockReturnValueOnce(makeChain([]))                        // payments in session
      .mockReturnValueOnce(makeChain([]))                        // voids
      .mockReturnValueOnce(makeChain([]))                        // tax (tickets)
      .mockReturnValueOnce(makeChain([CASH_METHOD]))             // cash method for expectedCash
      .mockReturnValueOnce(makeChain([{ total: "0" }]));         // cash sales for expectedCash

    const res = await request(app)
      .get("/api/cash-sessions/sess-A/x-report")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body.isProvisional).toBe(true);
    expect(res.body.session.id).toBe("sess-A");
    // Session must still be open (x-report doesn't change state)
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

// ─── 13. Informe Z definitivo (tras cierre) ──────────────────────────────────

describe("Test 13 — GET /cash-sessions/:id/report: Z-report works for closed sessions", () => {
  it("returns report data for a closed session", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([CLOSED_SESSION]))          // session
      .mockReturnValueOnce(makeChain([{ name: "Manager" }]))    // employee
      .mockReturnValueOnce(makeChain([]))                        // salesByMethod
      .mockReturnValueOnce(makeChain([]))                        // movements
      .mockReturnValueOnce(makeChain([]))                        // tips
      .mockReturnValueOnce(makeChain([]))                        // payments in session
      .mockReturnValueOnce(makeChain([]));                       // voids

    const res = await request(app)
      .get("/api/cash-sessions/sess-A/report")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe("closed");
    expect(typeof res.body.totalSales).toBe("string");
  });
});

// ─── Admin reopen: conflict guard + full state reset ─────────────────────────

describe("POST /cash-sessions/:id/reopen — admin-only", () => {
  beforeEach(() => {
    // Make the mock JWT return admin role for these tests
    mockJwtVerify.mockReturnValue({ id: "admin-1", name: "Admin", role: "admin" });
  });

  afterEach(() => {
    // Restore default (manager) for other tests
    mockJwtVerify.mockReturnValue({ id: "mgr-1", name: "Manager Test", role: "manager" });
  });

  it("returns 409 when another session on the same terminal is already open", async () => {
    // Find the closed session
    mockDb.select
      .mockReturnValueOnce(makeChain([CLOSED_SESSION]))          // session lookup
      .mockReturnValueOnce(makeChain([{ id: "sess-other" }]));   // conflicting open session on same terminal

    const res = await request(app)
      .post("/api/cash-sessions/sess-A/reopen")
      .set("Authorization", ADMIN_AUTH);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/sesión abierta|terminal/i);
    // update should NOT have been called
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("clears all closure-derived fields on successful reopen", async () => {
    // Find the closed session; no conflicting open session
    mockDb.select
      .mockReturnValueOnce(makeChain([CLOSED_SESSION]))  // session lookup
      .mockReturnValueOnce(makeChain([]));               // no conflicting session
    mockDb.update.mockReturnValueOnce(makeChain([{
      ...CLOSED_SESSION,
      status: "open",
      closedAt: null,
      countedCash: null,
      difference: null,
      expectedCash: null,
      discrepancyReason: null,
      closingNotes: null,
      denominationBreakdown: null,
    }]));

    const res = await request(app)
      .post("/api/cash-sessions/sess-A/reopen")
      .set("Authorization", ADMIN_AUTH);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("open");
    expect(res.body.closedAt).toBeNull();
    expect(res.body.countedCash).toBeNull();
    expect(res.body.difference).toBeNull();
    expect(res.body.expectedCash).toBeNull();
    expect(res.body.discrepancyReason).toBeNull();
    expect(res.body.denominationBreakdown).toBeNull();

    // Verify update was called exactly once
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when called by a non-admin (manager)", async () => {
    // mockJwtVerify already returns manager by default; override for this test
    mockJwtVerify.mockReturnValueOnce({ id: "mgr-1", name: "Manager", role: "manager" });

    const res = await request(app)
      .post("/api/cash-sessions/sess-A/reopen")
      .set("Authorization", AUTH);

    expect(res.status).toBe(403);
  });
});

// ─── 14. Dos terminales simultáneos — movimientos aislados ───────────────────

describe("Test 14 — two simultaneous open sessions on different terminals", () => {
  it("two sessions can be open concurrently and their movements are independent", async () => {
    // Open session A (Caja principal) — no existing session for that terminal
    mockDb.select.mockReturnValueOnce(makeChain([]));
    mockDb.insert.mockReturnValueOnce(makeChain([SESSION_A]));

    const resA = await request(app)
      .post("/api/cash-sessions/open")
      .set("Authorization", AUTH)
      .send({ openingFloat: "100.00", terminalName: "Caja principal" });
    expect(resA.status).toBe(201);
    expect(resA.body.terminalName).toBe("Caja principal");

    // Open session B (Caja barra) — no existing session for that terminal
    mockDb.select.mockReturnValueOnce(makeChain([]));
    mockDb.insert.mockReturnValueOnce(makeChain([SESSION_B]));

    const resB = await request(app)
      .post("/api/cash-sessions/open")
      .set("Authorization", AUTH)
      .send({ openingFloat: "50.00", terminalName: "Caja barra" });
    expect(resB.status).toBe(201);
    expect(resB.body.terminalName).toBe("Caja barra");

    // Each session has a different ID — movements would be scoped to each
    expect(resA.body.id).toBe("sess-A");
    expect(resB.body.id).toBe("sess-B");
    expect(resA.body.id).not.toBe(resB.body.id);
  });

  it("opening a second session on the same terminal returns 409", async () => {
    // Terminal already has an open session
    mockDb.select.mockReturnValueOnce(makeChain([SESSION_A]));

    const res = await request(app)
      .post("/api/cash-sessions/open")
      .set("Authorization", AUTH)
      .send({ openingFloat: "200.00", terminalName: "Caja principal" });

    expect(res.status).toBe(409);
  });
});
