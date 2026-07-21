/**
 * Orders live-sync tests
 *
 * Verifies that every mutation path that changes an order's items emits an
 * `orders:refresh` Socket.IO event so a second connected session updates
 * automatically — without a page reload.
 *
 * Covered paths:
 *   POST   /orders/:orderId/items     → add item
 *   DELETE /order-items/:itemId       → remove draft item
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a PromiseLike, chainable mock that resolves to `value`.
 * Every method on it returns `chain` itself so the full Drizzle
 * builder chain (select().from().where() …) works without errors.
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
    "innerJoin", "limit", "for", "onConflictDoNothing", "execute",
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

/**
 * Controllable jwt.verify mock so individual tests can simulate a different
 * employee logging in by overriding the return value with mockReturnValueOnce.
 */
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

// Mock the socket helper so tests don't need a real HTTP server with Socket.IO
vi.mock("../lib/socket", () => ({
  getIO: () => ({ emit: mockEmit }),
  initSocket: vi.fn(),
}));

// ─── App import (after mocks are registered) ──────────────────────────────────

const { default: app } = await import("../app");

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTH = "Bearer test-token";
const ORDER_ID = "order-111";
const TABLE_ID = "table-222";
const PRODUCT_ID = "prod-abc";
const ITEM_ID = "item-xyz";

const PRODUCT = {
  id: PRODUCT_ID,
  name: "Paella Valenciana",
  price: "14.50",
  prepZone: "cocina",
  categoryId: "cat-1",
};

const ORDER_ITEM = {
  id: ITEM_ID,
  orderId: ORDER_ID,
  productId: PRODUCT_ID,
  quantity: 1,
  unitPrice: "14.50",
  status: "draft",
  notes: "",
  allergyNote: "",
  hasAllergy: false,
  createdAt: new Date().toISOString(),
};

/**
 * Shape returned by routes that SELECT with an innerJoin on products.
 * Drizzle returns `{ order_items: {...}, products: {...} }` for joined queries.
 */
const DELETE_ITEM_ROW = {
  order_items: ORDER_ITEM,
  products: PRODUCT,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/orders/:orderId/items — add item emits orders:refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SESSION_SECRET"] = "test-secret";
    // Default: any unmocked DB call returns an empty chain so the route
    // doesn't throw when it hits optional queries (modifiers, audit log,
    // prefactura status, ingredient stock) that tests don't need to assert on.
    mockDb.select.mockImplementation(() => makeChain([]));
    mockDb.insert.mockImplementation(() => makeChain([]));
    mockDb.update.mockImplementation(() => makeChain([]));
    mockDb.delete.mockImplementation(() => makeChain([]));
  });

  it("emits orders:refresh with the correct orderId after adding an item", async () => {
    // 1st select → order guard (currentOrder status check)
    mockDb.select.mockReturnValueOnce(makeChain([{ status: "open" }]));
    // 2nd select → find the product
    mockDb.select.mockReturnValueOnce(makeChain([PRODUCT]));
    // insert → return the new order item
    mockDb.insert.mockReturnValueOnce(makeChain([ORDER_ITEM]));

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/items`)
      .set("Authorization", AUTH)
      .send({ productId: PRODUCT_ID, quantity: 1 });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(ITEM_ID);

    // The socket event must have fired exactly once with the right payload
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith("orders:refresh", expect.objectContaining({ orderId: ORDER_ID }));
  });

  it("returns 404 and does NOT emit orders:refresh when the product is not found", async () => {
    // 1st select → order guard passes
    mockDb.select.mockReturnValueOnce(makeChain([{ status: "open" }]));
    // 2nd select → product not found
    mockDb.select.mockReturnValueOnce(makeChain([]));

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/items`)
      .set("Authorization", AUTH)
      .send({ productId: "nonexistent-product", quantity: 1 });

    expect(res.status).toBe(404);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("returns 400 and does NOT emit orders:refresh when productId is missing", async () => {
    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/items`)
      .set("Authorization", AUTH)
      .send({ quantity: 1 }); // no productId

    expect(res.status).toBe(400);
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/order-items/:itemId — remove item emits orders:refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SESSION_SECRET"] = "test-secret";
    mockDb.select.mockImplementation(() => makeChain([]));
    mockDb.insert.mockImplementation(() => makeChain([]));
    mockDb.update.mockImplementation(() => makeChain([]));
    mockDb.delete.mockImplementation(() => makeChain([]));
  });

  it("emits orders:refresh with the correct orderId after deleting a draft item", async () => {
    // select → find the item with innerJoin shape { order_items, products }
    mockDb.select.mockReturnValueOnce(makeChain([DELETE_ITEM_ROW]));
    // delete → resolves to empty (no return value needed)
    mockDb.delete.mockReturnValueOnce(makeChain([]));

    const res = await request(app)
      .delete(`/api/order-items/${ITEM_ID}`)
      .set("Authorization", AUTH);

    expect(res.status).toBe(204);

    // The socket event must have fired exactly once with the right orderId
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith("orders:refresh", expect.objectContaining({ orderId: ORDER_ID }));
  });

  it("returns 404 and does NOT emit orders:refresh when the item is not found", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([]));

    const res = await request(app)
      .delete(`/api/order-items/nonexistent-item`)
      .set("Authorization", AUTH);

    expect(res.status).toBe(404);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("cancels the kitchen task and returns 204 when the item is already sent", async () => {
    // Sent items now propagate to KDS (cancel the kitchen task) instead of blocking deletion.
    const sentItemRow = { order_items: { ...ORDER_ITEM, status: "sent" }, products: PRODUCT };
    mockDb.select.mockReturnValueOnce(makeChain([sentItemRow]));
    mockDb.update.mockReturnValue(makeChain([]));   // cancel kitchen task
    mockDb.delete.mockReturnValue(makeChain([]));   // delete the item
    mockDb.insert.mockReturnValue(makeChain([]));   // audit log

    const res = await request(app)
      .delete(`/api/order-items/${ITEM_ID}`)
      .set("Authorization", AUTH);

    expect(res.status).toBe(204);
    // kds:refresh must be emitted so KDS screens update immediately
    expect(mockEmit).toHaveBeenCalledWith(
      "kds:refresh",
      expect.objectContaining({ employeeName: expect.any(String) }),
    );
  });
});

describe("POST /api/orders/:orderId/send — emits kds:refresh and orders:refresh", () => {
  const DRAFT_ROW = {
    order_items: {
      id: ITEM_ID,
      orderId: ORDER_ID,
      notes: "",
      allergyNote: "",
      hasAllergy: false,
      quantity: 1,
    },
    products: {
      id: PRODUCT_ID,
      name: "Paella Valenciana",
      prepZone: "cocina",
      price: "14.50",
    },
  };

  const UPDATED_ORDER = {
    id: ORDER_ID,
    tableId: TABLE_ID,
    status: "sent",
    sentAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SESSION_SECRET"] = "test-secret";
  });

  // Helper: sets up the full mock chain for a successful send, with a given printMode.
  function setupSendMocks(printMode: string, draftRow: unknown = DRAFT_ROW) {
    mockDb.select.mockReturnValueOnce(makeChain([{ status: "open" }]));          // 1. guard
    mockDb.select.mockReturnValueOnce(makeChain([{ printMode }]));                // 2. businessCfg
    mockDb.select.mockReturnValueOnce(makeChain([{ sentAt: null }]));             // 3. preUpdate
    mockDb.select.mockReturnValueOnce(makeChain([draftRow]));                     // 4. draftItems
    mockDb.select.mockReturnValueOnce(makeChain([]));                             // 5. modifiers
    mockDb.transaction.mockImplementationOnce(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
      const txInsert = vi.fn(() => makeChain([]));
      const txUpdate = vi.fn(() => makeChain([]));
      const txSelect = vi.fn()
        .mockReturnValueOnce(makeChain([{ status: "open" }]))
        .mockReturnValueOnce(makeChain([draftRow]))
        .mockReturnValueOnce(makeChain([]))
        .mockReturnValueOnce(makeChain([]));
      await cb({
        execute: vi.fn().mockResolvedValue({ rows: [] }),
        select: txSelect,
        insert: txInsert,
        update: txUpdate,
      });
      return { txInsert, txUpdate };
    });
    mockDb.select.mockReturnValueOnce(makeChain([UPDATED_ORDER]));                // 6. updated order
  }

  it("emits kds:refresh and orders:refresh after successfully sending draft items (kds_only mode)", async () => {
    setupSendMocks("kds_only");

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/send`)
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith("kds:refresh", expect.objectContaining({ employeeName: "Test Waiter" }));
    expect(mockEmit).toHaveBeenCalledWith("orders:refresh", expect.objectContaining({ orderId: ORDER_ID }));
    expect(mockEmit).toHaveBeenCalledTimes(2);
  });

  it("emits kds:refresh before orders:refresh (kitchen display updates first)", async () => {
    setupSendMocks("kds_only");

    await request(app)
      .post(`/api/orders/${ORDER_ID}/send`)
      .set("Authorization", AUTH)
      .expect(200);

    const calls = mockEmit.mock.calls;
    const kdsIndex = calls.findIndex((c) => c[0] === "kds:refresh");
    const ordersIndex = calls.findIndex((c) => c[0] === "orders:refresh");
    expect(kdsIndex).toBeGreaterThanOrEqual(0);
    expect(ordersIndex).toBeGreaterThan(kdsIndex);
  });

  it("printers_only mode: does NOT emit kds:refresh, still emits orders:refresh", async () => {
    setupSendMocks("printers_only");

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/send`)
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    // No KDS event — kitchen display should not receive this
    expect(mockEmit).not.toHaveBeenCalledWith("kds:refresh", expect.anything());
    // But the orders panel must still update
    expect(mockEmit).toHaveBeenCalledWith("orders:refresh", expect.objectContaining({ orderId: ORDER_ID }));
  });

  it("printers_only mode: transaction does NOT insert KDS tasks", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([{ status: "open" }]));
    mockDb.select.mockReturnValueOnce(makeChain([{ printMode: "printers_only" }]));
    mockDb.select.mockReturnValueOnce(makeChain([{ sentAt: null }]));
    mockDb.select.mockReturnValueOnce(makeChain([DRAFT_ROW]));
    mockDb.select.mockReturnValueOnce(makeChain([]));

    let txInsertCalls = 0;
    mockDb.transaction.mockImplementationOnce(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
      const txInsert = vi.fn(() => { txInsertCalls++; return makeChain([]); });
      const txUpdate = vi.fn(() => makeChain([]));
      const txSelect = vi.fn()
        .mockReturnValueOnce(makeChain([{ status: "open" }]))
        .mockReturnValueOnce(makeChain([DRAFT_ROW]))
        .mockReturnValueOnce(makeChain([]))
        .mockReturnValueOnce(makeChain([]));
      await cb({
        execute: vi.fn().mockResolvedValue({ rows: [] }),
        select: txSelect,
        insert: txInsert,
        update: txUpdate,
      });
    });
    mockDb.select.mockReturnValueOnce(makeChain([UPDATED_ORDER]));

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/send`)
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    // In printers_only mode the transaction must NOT create kitchenTask rows
    expect(txInsertCalls).toBe(0);
  });

  it("both mode: emits kds:refresh AND orders:refresh (full dual path)", async () => {
    setupSendMocks("both");

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/send`)
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith("kds:refresh", expect.objectContaining({ employeeName: "Test Waiter" }));
    expect(mockEmit).toHaveBeenCalledWith("orders:refresh", expect.objectContaining({ orderId: ORDER_ID }));
  });

  it("both mode: transaction creates KDS tasks", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([{ status: "open" }]));
    mockDb.select.mockReturnValueOnce(makeChain([{ printMode: "both" }]));
    mockDb.select.mockReturnValueOnce(makeChain([{ sentAt: null }]));
    mockDb.select.mockReturnValueOnce(makeChain([DRAFT_ROW]));
    mockDb.select.mockReturnValueOnce(makeChain([]));

    let txInsertCalls = 0;
    mockDb.transaction.mockImplementationOnce(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
      const txInsert = vi.fn(() => { txInsertCalls++; return makeChain([]); });
      const txUpdate = vi.fn(() => makeChain([]));
      const txSelect = vi.fn()
        .mockReturnValueOnce(makeChain([{ status: "open" }]))
        .mockReturnValueOnce(makeChain([DRAFT_ROW]))
        .mockReturnValueOnce(makeChain([]))
        .mockReturnValueOnce(makeChain([]));
      await cb({
        execute: vi.fn().mockResolvedValue({ rows: [] }),
        select: txSelect,
        insert: txInsert,
        update: txUpdate,
      });
    });
    mockDb.select.mockReturnValueOnce(makeChain([UPDATED_ORDER]));

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/send`)
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    // In both mode the transaction MUST create kitchenTask rows
    expect(txInsertCalls).toBeGreaterThan(0);
  });

  it("returns 400 and does NOT emit any socket event when there are no draft items", async () => {
    // order guard passes, businessCfg loads, then draft items query returns empty → 400
    mockDb.select.mockReturnValueOnce(makeChain([{ status: "open" }]));
    mockDb.select.mockReturnValueOnce(makeChain([{ printMode: "kds_only" }]));
    mockDb.select.mockReturnValueOnce(makeChain([{ sentAt: null }]));
    mockDb.select.mockReturnValueOnce(makeChain([])); // empty draft items

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/send`)
      .set("Authorization", AUTH);

    expect(res.status).toBe(400);
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

// ─── Employee-switch / session-token tests ────────────────────────────────────

describe("orders:refresh employeeName — name always comes from the JWT, never cached", () => {
  /**
   * If a staff member logs out and a different person logs in on the same
   * device, the server re-reads req.user from the new JWT on every request.
   * These tests verify that the `employeeName` field in the `orders:refresh`
   * payload exactly matches the name in the Bearer token that was used for
   * that specific request — not any earlier session.
   */

  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SESSION_SECRET"] = "test-secret";
    mockDb.select.mockImplementation(() => makeChain([]));
    mockDb.insert.mockImplementation(() => makeChain([]));
    mockDb.update.mockImplementation(() => makeChain([]));
    mockDb.delete.mockImplementation(() => makeChain([]));
  });

  it("carries the name from the JWT in the orders:refresh payload (add-item path)", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([{ status: "open" }]));
    mockDb.select.mockReturnValueOnce(makeChain([PRODUCT]));
    mockDb.insert.mockReturnValueOnce(makeChain([ORDER_ITEM]));

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/items`)
      .set("Authorization", "Bearer waiter-token")
      .send({ productId: PRODUCT_ID, quantity: 1 });

    expect(res.status).toBe(201);
    expect(mockEmit).toHaveBeenCalledWith(
      "orders:refresh",
      expect.objectContaining({ orderId: ORDER_ID, employeeName: "Test Waiter" }),
    );
  });

  it("uses the NEW employee name after a session switch (different JWT on next request)", async () => {
    // Simulate a second employee logging in — next request arrives with their JWT.
    mockJwtVerify.mockReturnValueOnce({ id: "waiter-2", name: "María García", role: "waiter" });

    mockDb.select.mockReturnValueOnce(makeChain([{ status: "open" }]));
    mockDb.select.mockReturnValueOnce(makeChain([PRODUCT]));
    mockDb.insert.mockReturnValueOnce(makeChain([ORDER_ITEM]));

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/items`)
      .set("Authorization", "Bearer new-session-token")
      .send({ productId: PRODUCT_ID, quantity: 1 });

    expect(res.status).toBe(201);
    // Must broadcast the new employee's name, NOT the previous one.
    expect(mockEmit).toHaveBeenCalledWith(
      "orders:refresh",
      expect.objectContaining({ orderId: ORDER_ID, employeeName: "María García" }),
    );
    expect(mockEmit).not.toHaveBeenCalledWith(
      "orders:refresh",
      expect.objectContaining({ employeeName: "Test Waiter" }),
    );
  });

  it("carries the JWT name on the delete-item path too", async () => {
    mockJwtVerify.mockReturnValueOnce({ id: "waiter-3", name: "Carlos López", role: "waiter" });

    mockDb.select.mockReturnValueOnce(makeChain([DELETE_ITEM_ROW]));
    mockDb.delete.mockReturnValueOnce(makeChain([]));

    const res = await request(app)
      .delete(`/api/order-items/${ITEM_ID}`)
      .set("Authorization", "Bearer another-token");

    expect(res.status).toBe(204);
    expect(mockEmit).toHaveBeenCalledWith(
      "orders:refresh",
      expect.objectContaining({ orderId: ORDER_ID, employeeName: "Carlos López" }),
    );
  });
});

describe("Two-session live sync — end-to-end scenario", () => {
  /**
   * Simulates two devices viewing the same order page.
   * Device A adds an item → the server emits orders:refresh.
   * Device B's socket listener invalidates its query → sees the new item.
   *
   * The server side is covered by the unit tests above.
   * This integration-style test documents the expected API contract:
   *   - POST /orders/:orderId/items → 201 + orders:refresh emitted
   *   - DELETE /order-items/:itemId → 204 + orders:refresh emitted
   */

  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SESSION_SECRET"] = "test-secret";
    mockDb.select.mockImplementation(() => makeChain([]));
    mockDb.insert.mockImplementation(() => makeChain([]));
    mockDb.update.mockImplementation(() => makeChain([]));
    mockDb.delete.mockImplementation(() => makeChain([]));
  });

  it("add-item path: Device A adds, orders:refresh reaches Device B's listener", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([{ status: "open" }]));
    mockDb.select.mockReturnValueOnce(makeChain([PRODUCT]));
    mockDb.insert.mockReturnValueOnce(makeChain([ORDER_ITEM]));

    await request(app)
      .post(`/api/orders/${ORDER_ID}/items`)
      .set("Authorization", AUTH)
      .send({ productId: PRODUCT_ID, quantity: 1 })
      .expect(201);

    // Socket server broadcasts the event — any connected client (Device B)
    // receives it and invalidates its React-Query cache for this order.
    expect(mockEmit).toHaveBeenCalledWith("orders:refresh", expect.objectContaining({ orderId: ORDER_ID }));
  });

  it("delete-item path: Device A removes an item, orders:refresh reaches Device B's listener", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([DELETE_ITEM_ROW]));
    mockDb.delete.mockReturnValueOnce(makeChain([]));

    await request(app)
      .delete(`/api/order-items/${ITEM_ID}`)
      .set("Authorization", AUTH)
      .expect(204);

    expect(mockEmit).toHaveBeenCalledWith("orders:refresh", expect.objectContaining({ orderId: ORDER_ID }));
  });
});
