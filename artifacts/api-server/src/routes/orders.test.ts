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
    "innerJoin", "limit",
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

  it("returns 400 and does NOT emit orders:refresh when the item is already sent (not draft)", async () => {
    // innerJoin shape with status: "sent"
    const sentItemRow = { order_items: { ...ORDER_ITEM, status: "sent" }, products: PRODUCT };
    mockDb.select.mockReturnValueOnce(makeChain([sentItemRow]));

    const res = await request(app)
      .delete(`/api/order-items/${ITEM_ID}`)
      .set("Authorization", AUTH);

    expect(res.status).toBe(400);
    expect(mockEmit).not.toHaveBeenCalled();
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

  it("emits kds:refresh and orders:refresh after successfully sending draft items", async () => {
    // 1. order guard select
    mockDb.select.mockReturnValueOnce(makeChain([{ status: "open" }]));
    // 2. draft items query (select + innerJoin)
    mockDb.select.mockReturnValueOnce(makeChain([DRAFT_ROW]));
    // 3. modifiers query (inArray on draftItemIds)
    mockDb.select.mockReturnValueOnce(makeChain([]));
    // 3. transaction — execute callback with a minimal tx mock
    mockDb.transaction.mockImplementationOnce(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
      const tx = {
        insert: vi.fn(() => makeChain([])),
        update: vi.fn(() => makeChain([])),
      };
      await cb(tx);
    });
    // 4. final select → updated order
    mockDb.select.mockReturnValueOnce(makeChain([UPDATED_ORDER]));

    const res = await request(app)
      .post(`/api/orders/${ORDER_ID}/send`)
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    // Both events must be emitted
    expect(mockEmit).toHaveBeenCalledWith("kds:refresh", expect.objectContaining({ employeeName: "Test Waiter" }));
    expect(mockEmit).toHaveBeenCalledWith("orders:refresh", expect.objectContaining({ orderId: ORDER_ID }));
    expect(mockEmit).toHaveBeenCalledTimes(2);
  });

  it("emits kds:refresh before orders:refresh (kitchen display updates first)", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([{ status: "open" }]));
    mockDb.select.mockReturnValueOnce(makeChain([DRAFT_ROW]));
    mockDb.select.mockReturnValueOnce(makeChain([]));
    mockDb.transaction.mockImplementationOnce(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
      const tx = {
        insert: vi.fn(() => makeChain([])),
        update: vi.fn(() => makeChain([])),
      };
      await cb(tx);
    });
    mockDb.select.mockReturnValueOnce(makeChain([UPDATED_ORDER]));

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

  it("returns 400 and does NOT emit any socket event when there are no draft items", async () => {
    // order guard passes, then draft items query returns empty → 400
    mockDb.select.mockReturnValueOnce(makeChain([{ status: "open" }]));
    mockDb.select.mockReturnValueOnce(makeChain([]));

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
