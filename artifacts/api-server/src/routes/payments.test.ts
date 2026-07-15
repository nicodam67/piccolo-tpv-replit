/**
 * Payment route tests
 *
 * Covers the critical scenarios for `POST /orders/:id/payments`:
 *   1. Single exact card payment → order closes, ticket created, table freed
 *   2. Two equal halves       → stays open after first, closes after second
 *   3. Cash overpayment       → change returned, effective amount capped
 *   4. Mixed methods (card + cash) → both recorded, order closes on second
 *   5. Three partial payments  → open → open → closed
 *   6. Invitation method       → 403 for waiter role, 201 for admin role
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Drizzle-style chainable mock that resolves to `value`.
 * Each builder method (from, where, limit, …) returns the same chain so
 * the full Drizzle expression tree resolves correctly in tests.
 */
function makeChain(value: unknown) {
  const chain: Record<string, unknown> & {
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => Promise<unknown>;
  } = {
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  for (const m of [
    "select", "from", "where", "orderBy",
    "insert", "update", "delete", "set", "values", "returning",
    "innerJoin", "leftJoin", "limit", "offset",
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

const mockEmit = vi.hoisted(() => vi.fn());

/** Default: waiter. Override with mockReturnValueOnce for admin tests. */
const mockJwtVerify = vi.hoisted(() =>
  vi.fn(() => ({ id: "waiter-1", name: "Test Waiter", role: "waiter" })),
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
  getIO: () => ({ emit: mockEmit }),
  initSocket: vi.fn(),
}));

/** Keep logDocumentAction from attempting real DB inserts. */
vi.mock("../lib/document-audit", () => ({
  logDocumentAction: vi.fn().mockResolvedValue(undefined),
}));

/** Fixed order total of €10.00 for all tests — simplifies amount arithmetic. */
vi.mock("../lib/tax", () => ({
  calcMultiRateBreakdown: vi.fn(() => ({
    taxBreakdown: [{ rate: 10, base: "9.09", cuota: "0.91" }],
    subtotal:  "9.09",
    taxTotal:  "0.91",
    total:    "10.00",
  })),
}));

// ─── App (after mocks) ────────────────────────────────────────────────────────

const { default: app } = await import("../app");

// ─── Shared constants ─────────────────────────────────────────────────────────

const AUTH       = "Bearer test-token";
const ORDER_ID   = "order-pay-111";
const TABLE_ID   = "table-222";
const EMP_ID     = "emp-333";
const SESSION_ID = "session-444";

const ORDER = {
  id: ORDER_ID, status: "open", tableId: TABLE_ID, employeeId: EMP_ID,
  createdAt: new Date().toISOString(),
};

const CARD_METHOD = { id: "method-card", code: "card",       name: "Tarjeta",    active: true };
const CASH_METHOD = { id: "method-cash", code: "cash",       name: "Efectivo",   active: true };
const INV_METHOD  = { id: "method-inv",  code: "invitation", name: "Invitación", active: true };

const ITEM       = { unitPrice: "9.09", quantity: 1, taxRate: 10 };
const SESSION    = { id: SESSION_ID, status: "open", terminalName: "Caja principal" };
const BIZ_CONFIG = { nif: "B12345678", razonSocial: "Test S.L.", direccionFiscal: "Calle Test 1" };

const BASE_PAYMENT = {
  id: "payment-001", orderId: ORDER_ID, amount: "10.00",
  status: "completed", createdAt: new Date().toISOString(),
};

const BASE_TICKET = {
  id: "ticket-001", orderId: ORDER_ID, ticketNumber: 1, serie: "T",
  verifactuStatus: "pending", total: "10.00", subtotal: "9.09", taxTotal: "0.91",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Selects shared by every payment request up to the session lookup (7 calls).
 *  alreadyPaid: decimal string representing the sum already charged. */
function setupCommonSelects(alreadyPaid: string, method = CARD_METHOD) {
  mockDb.select
    .mockReturnValueOnce(makeChain([ORDER]))                              // 1. order guard
    .mockReturnValueOnce(makeChain([method]))                            // 2. method lookup
    .mockReturnValueOnce(makeChain([ITEM]))                              // 3. items for tax calc
    .mockReturnValueOnce(makeChain([{ total: "0" }]))                    // 4. discounts sum
    .mockReturnValueOnce(makeChain([{ paid: alreadyPaid }]))             // 5. already paid sum
    .mockReturnValueOnce(makeChain([{ id: SESSION_ID }]))                // 6. allOpen (1 session → OK)
    .mockReturnValueOnce(makeChain([SESSION]));                          // 7. open session
}

/** Transaction mock that creates a payment but does NOT close the order. */
function setupNonClosingTx(paymentAmount: string) {
  mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
    const tx = {
      insert: vi.fn().mockReturnValueOnce(makeChain([{ ...BASE_PAYMENT, amount: paymentAmount }])),
      update: vi.fn(),
    };
    return cb(tx);
  });
}

/** Transaction mock that creates a payment AND closes the order (ticket, update ×2).
 *  Also mocks the two db.select calls that happen inside the tx callback (bizConfig + pmRow). */
function setupClosingTx(paymentAmount: string, pmName = "Tarjeta") {
  // bizConfig + pmRow are fetched inside the tx callback using `db` (not `tx`)
  mockDb.select
    .mockReturnValueOnce(makeChain([BIZ_CONFIG]))           // bizConfig
    .mockReturnValueOnce(makeChain([{ name: pmName }]));   // pmRow

  mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
    const txInsert = vi.fn()
      .mockReturnValueOnce(makeChain([{ ...BASE_PAYMENT, amount: paymentAmount }])) // payment
      .mockReturnValueOnce(makeChain([BASE_TICKET]));                                // ticket
    const txUpdate = vi.fn().mockReturnValue(makeChain([]));
    return cb({ insert: txInsert, update: txUpdate });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /orders/:id/payments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: any unmatched db.select returns an empty array
    mockDb.select.mockReturnValue(makeChain([]));
    mockDb.transaction.mockImplementation(async (cb: Function) => {
      return cb({
        insert: vi.fn().mockReturnValue(makeChain([])),
        update: vi.fn().mockReturnValue(makeChain([])),
      });
    });
  });

  // ── 1. Single exact card payment ─────────────────────────────────────────────

  it("single card payment equal to remaining → closes order, creates ticket, frees table", async () => {
    setupCommonSelects("0");
    setupClosingTx("10.00");

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH)
      .send({ methodCode: "card", amount: "10.00" });

    expect(res.status).toBe(201);
    expect(res.body.ticket).toBeTruthy();
    expect(res.body.newRemaining).toBe(0);
    expect(res.body.change).toBe("0.00");
    // Socket event must fire after a closing payment
    expect(mockEmit).toHaveBeenCalledWith("tables:refresh");
  });

  // ── 2. Two equal halves ───────────────────────────────────────────────────────

  it("two equal halves: order stays open after first, closes after second", async () => {
    // ── First payment (€5.00) ────────────────────────────────────────────────
    setupCommonSelects("0");
    setupNonClosingTx("5.00");

    const res1 = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH)
      .send({ methodCode: "card", amount: "5.00" });

    expect(res1.status).toBe(201);
    expect(res1.body.ticket).toBeNull();
    expect(res1.body.newRemaining).toBeCloseTo(5, 2);

    // ── Second payment (€5.00) — now €5 already paid ─────────────────────────
    setupCommonSelects("5.00");
    setupClosingTx("5.00");

    const res2 = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH)
      .send({ methodCode: "card", amount: "5.00" });

    expect(res2.status).toBe(201);
    expect(res2.body.ticket).toBeTruthy();
    expect(res2.body.newRemaining).toBe(0);
  });

  // ── 3. Cash overpayment ───────────────────────────────────────────────────────

  it("cash payment exceeding remaining → change returned, amount capped, order closes", async () => {
    setupCommonSelects("0", CASH_METHOD);
    setupClosingTx("10.00", "Efectivo"); // effective amount capped at remaining (10.00)

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH)
      .send({ methodCode: "cash", amount: "15.00" });

    expect(res.status).toBe(201);
    // Route caps effectiveAmount at remaining for cash overpayment
    expect(parseFloat(res.body.change)).toBeCloseTo(5, 2);
    expect(res.body.newRemaining).toBe(0);
    expect(res.body.ticket).toBeTruthy();
  });

  // ── 4. Mixed methods (card 6 + cash 4) ───────────────────────────────────────

  it("mixed methods: card then cash — each accepted, order closes on second", async () => {
    // ── First: card €6.00 ───────────────────────────────────────────────────
    setupCommonSelects("0");
    setupNonClosingTx("6.00");

    const res1 = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH)
      .send({ methodCode: "card", amount: "6.00" });

    expect(res1.status).toBe(201);
    expect(res1.body.ticket).toBeNull();
    expect(res1.body.newRemaining).toBeCloseTo(4, 2);

    // ── Second: cash €4.00 (exact, no change) ───────────────────────────────
    setupCommonSelects("6.00", CASH_METHOD);
    setupClosingTx("4.00", "Efectivo");

    const res2 = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH)
      .send({ methodCode: "cash", amount: "4.00" });

    expect(res2.status).toBe(201);
    expect(res2.body.ticket).toBeTruthy();
    expect(res2.body.newRemaining).toBe(0);
    expect(res2.body.change).toBe("0.00");
  });

  // ── 5. Three partial card payments ───────────────────────────────────────────

  it("three partial card payments (3+3+4) — open → open → closed", async () => {
    // Payment 1 (€3): nothing paid yet
    setupCommonSelects("0");
    setupNonClosingTx("3.00");
    const r1 = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH)
      .send({ methodCode: "card", amount: "3.00" });
    expect(r1.status).toBe(201);
    expect(r1.body.ticket).toBeNull();
    expect(r1.body.newRemaining).toBeCloseTo(7, 2);

    // Payment 2 (€3): €3 already paid
    setupCommonSelects("3.00");
    setupNonClosingTx("3.00");
    const r2 = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH)
      .send({ methodCode: "card", amount: "3.00" });
    expect(r2.status).toBe(201);
    expect(r2.body.ticket).toBeNull();
    expect(r2.body.newRemaining).toBeCloseTo(4, 2);

    // Payment 3 (€4): €6 already paid — closes order
    setupCommonSelects("6.00");
    setupClosingTx("4.00");
    const r3 = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH)
      .send({ methodCode: "card", amount: "4.00" });
    expect(r3.status).toBe(201);
    expect(r3.body.ticket).toBeTruthy();
    expect(r3.body.newRemaining).toBe(0);
  });

  // ── 6. Invitation method role guard ──────────────────────────────────────────

  describe("invitation method", () => {
    it("returns 403 for waiter role (default mock)", async () => {
      // Only order + method selects are needed before the 403 check
      mockDb.select
        .mockReturnValueOnce(makeChain([ORDER]))
        .mockReturnValueOnce(makeChain([INV_METHOD]));

      const res = await request(app)
        .post(`/api/orders/${ORDER_ID}/payments`)
        .set("Authorization", AUTH)
        .send({ methodCode: "invitation", amount: "10.00" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/administrador/i);
    });

    it("returns 201 for admin role", async () => {
      mockJwtVerify.mockReturnValueOnce({ id: "admin-1", name: "Admin", role: "admin" });

      setupCommonSelects("0", INV_METHOD);
      setupClosingTx("10.00", "Invitación");

      const res = await request(app)
        .post(`/api/orders/${ORDER_ID}/payments`)
        .set("Authorization", AUTH)
        .send({ methodCode: "invitation", amount: "10.00" });

      expect(res.status).toBe(201);
      expect(res.body.ticket).toBeTruthy();
      expect(res.body.newRemaining).toBe(0);
    });
  });
});
