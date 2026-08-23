/**
 * payments.test.ts
 * Critical-path tests for POST /orders/:id/payments.
 *
 * Key scenarios verified:
 *   1. Duplicate final-payment retry on already-paid order returns 200 idempotent
 *   2. Two equal split payments BOTH persist (no false deduplication)
 *   3. Normal single-payment success
 *   4. Unknown order → 404
 *   5. Invalid payment method → 400
 *   6. Payment on already-paid order with no recent dupe → 409
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ── makeChain helper ──────────────────────────────────────────────────────────
function makeChain(value: unknown) {
  const chain: Record<string, unknown> & {
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => Promise<unknown>;
  } = {
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  for (const m of [
    "select", "from", "where", "orderBy", "insert", "update", "delete",
    "set", "values", "returning", "innerJoin", "leftJoin", "limit",
    "groupBy", "offset", "onConflictDoUpdate", "catch",
  ]) {
    chain[m] = () => chain;
  }
  return chain;
}

// ── Hoisted mocks (must appear before any imports that load the modules) ──────
const mockJwtVerify = vi.hoisted(() =>
  vi.fn().mockImplementation(() => ({
    id: "emp-1",
    name: "Test Cashier",
    role: "manager",
  }))
);

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});

vi.mock("jsonwebtoken", () => ({
  default: { verify: mockJwtVerify },
}));

vi.mock("drizzle-orm", async (importOriginal) => importOriginal());

vi.mock("../lib/socket", () => ({
  getIO: () => ({ emit: vi.fn(), to: vi.fn().mockReturnValue({ emit: vi.fn() }) }),
  initSocket: vi.fn(),
}));

vi.mock("../lib/document-audit", () => ({
  logDocumentAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/invoice-series", () => ({
  getNextNumber: vi.fn().mockResolvedValue(1),
}));

vi.mock("../lib/fiscal-issuance", () => ({
  FiscalIssuanceError: class FiscalIssuanceError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  createFiscalRecord: vi.fn().mockResolvedValue({ id: "fiscal-record-1" }),
}));

vi.mock("../lib/print-worker", () => ({
  startPrintWorker: vi.fn(),
  stopPrintWorker: vi.fn(),
}));

vi.mock("../lib/backup-worker", () => ({
  startBackupWorker: vi.fn(),
  stopBackupWorker: vi.fn(),
}));

vi.mock("../lib/verifactu-worker", () => ({
  startVerifactuWorker: vi.fn(),
  stopVerifactuWorker: vi.fn(),
}));

// ── App (imported after mocks) ────────────────────────────────────────────────
const { default: app } = await import("../app");

// ── Shared fixtures ───────────────────────────────────────────────────────────
const AUTH = "Bearer test-token";
const ORDER_ID = "order-uuid-1";
const METHOD_ID = "method-uuid-card";
const SESSION_ID = "session-uuid-1";
const EMP_ID = "emp-1";

const OPEN_ORDER = {
  id: ORDER_ID,
  status: "sent",
  tableId: "table-1",
};
const PAID_ORDER = { ...OPEN_ORDER, status: "paid" };

const CARD_METHOD = {
  id: METHOD_ID,
  code: "card",
  name: "Tarjeta",
  active: true,
};

const OPEN_SESSION = {
  id: SESSION_ID,
  status: "open",
  terminalName: "Caja principal",
};

const COMPLETED_PAYMENT = {
  id: "payment-uuid-1",
  orderId: ORDER_ID,
  paymentMethodId: METHOD_ID,
  amount: "20.00",
  status: "completed",
  createdAt: new Date(), // within 60 s
};

const TICKET = {
  id: "ticket-uuid-1",
  orderId: ORDER_ID,
  total: "20.00",
};

// ── Setup: reset mocks before each test ──────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  // Default: most queries return empty / not-found
  mockDb.select.mockReturnValue(makeChain([]));
  mockDb.insert.mockReturnValue(makeChain([]));
  mockDb.update.mockReturnValue(makeChain([]));
  mockDb.delete.mockReturnValue(makeChain([]));
  mockDb.execute.mockResolvedValue({ rows: [] });
  mockDb.transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) =>
    fn(mockDb)
  );
});

// Helper: configure the mock DB for a standard "open order" payment flow
function mockOpenOrderFlow(override: { paymentRow?: object } = {}) {
  let call = 0;
  mockDb.select.mockImplementation(() => {
    call++;
    // 1st select: order lookup
    if (call === 1) return makeChain([OPEN_ORDER]);
    // 2nd select: method lookup
    if (call === 2) return makeChain([CARD_METHOD]);
    // 3rd select: items (for total calc)
    if (call === 3) return makeChain([{ unitPrice: "20.00", quantity: 1, taxRate: 10 }]);
    // 4th select: discounts
    if (call === 4) return makeChain([{ total: "0" }]);
    // 5th select: payments sum
    if (call === 5) return makeChain([{ paid: "0" }]);
    // 6th select: open session for the supplied terminal
    if (call === 6) return makeChain([OPEN_SESSION]);
    // 7th select: no pre-existing full invoice
    if (call === 7) return makeChain([]);
    // 8th select: business config for final ticket
    if (call === 8) return makeChain([{ nif: "B12345678", razonSocial: "Test SL" }]);
    return makeChain([]);
  });

  mockDb.insert
    .mockReturnValueOnce(makeChain([override.paymentRow ?? COMPLETED_PAYMENT]))
    .mockReturnValueOnce(makeChain([TICKET]))
    .mockReturnValue(makeChain([]));
}

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/orders/:id/payments", () => {

  // ── Scenario 1 ──────────────────────────────────────────────────────────────
  it("1. Returns 200 idempotent when order is settled and a matching payment exists within 60 s", async () => {
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) return makeChain([PAID_ORDER]);       // order lookup
      if (call === 2) return makeChain([CARD_METHOD]);      // method lookup
      if (call === 3) return makeChain([COMPLETED_PAYMENT]); // idempotency check → found
      if (call === 4) return makeChain([TICKET]);           // existing ticket
      return makeChain([]);
    });

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH)
      .set("x-terminal-name", "Caja principal")
      .send({ methodCode: "card", amount: "20.00" });

    expect(res.status).toBe(200);
    expect(res.body.idempotent).toBe(true);
    expect(res.body.payment.id).toBe(COMPLETED_PAYMENT.id);
    expect(res.body.newRemaining).toBe(0);
    expect(res.body.ticket).toBeTruthy();
  });

  // ── Scenario 2 ──────────────────────────────────────────────────────────────
  it("2. Two equal split payments both persist (no false deduplication on open order)", async () => {
    // This test verifies that idempotency never fires for an open order,
    // so two consecutive 10.00 card payments both succeed.

    const PARTIAL_PAYMENT_1 = { ...COMPLETED_PAYMENT, id: "pay-1", amount: "10.00" };
    const PARTIAL_PAYMENT_2 = { ...COMPLETED_PAYMENT, id: "pay-2", amount: "10.00" };

    // First payment (remaining 20.00, open order)
    {
      let call = 0;
      mockDb.select.mockImplementation(() => {
        call++;
        if (call === 1) return makeChain([OPEN_ORDER]);
        if (call === 2) return makeChain([CARD_METHOD]);
        if (call === 3) return makeChain([{ unitPrice: "20.00", quantity: 1, taxRate: 10 }]);
        if (call === 4) return makeChain([{ total: "0" }]);
        if (call === 5) return makeChain([{ paid: "0" }]);
        if (call === 6) return makeChain([OPEN_SESSION]);
        return makeChain([]);
      });
      mockDb.insert.mockReturnValueOnce(makeChain([PARTIAL_PAYMENT_1]));

      const res1 = await request(app)
        .post(`/api/orders/${ORDER_ID}/payments`)
        .set("Authorization", AUTH)
        .set("x-terminal-name", "Caja principal")
        .send({ methodCode: "card", amount: "10.00" });

      expect(res1.status).toBe(201);
      expect(res1.body.idempotent).toBeUndefined(); // NOT an idempotent response
      expect(res1.body.payment.id).toBe("pay-1");
    }

    // Second payment (remaining now 10.00, still open order — idempotency must NOT fire)
    {
      let call = 0;
      mockDb.select.mockImplementation(() => {
        call++;
        if (call === 1) return makeChain([OPEN_ORDER]);        // still open (status != paid)
        if (call === 2) return makeChain([CARD_METHOD]);
        if (call === 3) return makeChain([{ unitPrice: "20.00", quantity: 1, taxRate: 10 }]);
        if (call === 4) return makeChain([{ total: "0" }]);
        if (call === 5) return makeChain([{ paid: "10.00" }]); // first payment already there
        if (call === 6) return makeChain([OPEN_SESSION]);
        if (call === 7) return makeChain([]);
        if (call === 8) return makeChain([{ nif: "B12345678", razonSocial: "Test SL" }]);
        return makeChain([]);
      });
      mockDb.insert
        .mockReturnValueOnce(makeChain([PARTIAL_PAYMENT_2]))
        .mockReturnValueOnce(makeChain([TICKET]))
        .mockReturnValue(makeChain([]));

      const res2 = await request(app)
        .post(`/api/orders/${ORDER_ID}/payments`)
        .set("Authorization", AUTH)
        .set("x-terminal-name", "Caja principal")
        .send({ methodCode: "card", amount: "10.00" });

      expect(res2.status).toBe(201);
      expect(res2.body.idempotent).toBeUndefined(); // NOT an idempotent response
      expect(res2.body.payment.id).toBe("pay-2"); // distinct payment row
    }
  });

  // ── Scenario 3 ──────────────────────────────────────────────────────────────
  it("3. Normal single-payment success returns 200 with a payment and ticket", async () => {
    mockOpenOrderFlow();

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH)
      .set("x-terminal-name", "Caja principal")
      .send({ methodCode: "card", amount: "20.00" });

    expect(res.status).toBe(201);
    expect(res.body.payment).toBeTruthy();
    expect(res.body.idempotent).toBeUndefined();
  });

  // ── Scenario 4 ──────────────────────────────────────────────────────────────
  it("4. Returns 404 when the order does not exist", async () => {
    mockDb.select.mockReturnValue(makeChain([])); // empty → order not found

    const res = await request(app)
      .post(`/api/orders/nonexistent/payments`)
      .set("Authorization", AUTH)
      .send({ methodCode: "card", amount: "20.00" });

    expect(res.status).toBe(404);
  });

  // ── Scenario 5 ──────────────────────────────────────────────────────────────
  it("5. Returns 400 when the payment method is unknown or inactive", async () => {
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) return makeChain([OPEN_ORDER]); // order found
      if (call === 2) return makeChain([]);            // method NOT found
      return makeChain([]);
    });

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH)
      .send({ methodCode: "unknown_method", amount: "20.00" });

    expect(res.status).toBe(400);
  });

  // ── Scenario 6 ──────────────────────────────────────────────────────────────
  it("6. Returns 409 when order is paid and no matching recent payment exists", async () => {
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) return makeChain([PAID_ORDER]);  // order is paid
      if (call === 2) return makeChain([CARD_METHOD]); // method found
      if (call === 3) return makeChain([]);             // idempotency check → no recent dupe
      return makeChain([]);
    });

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/payments`)
      .set("Authorization", AUTH)
      .send({ methodCode: "card", amount: "20.00" });

    expect(res.status).toBe(409);
  });
});
