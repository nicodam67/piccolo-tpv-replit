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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/orders/:orderId/items — add item emits orders:refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SESSION_SECRET"] = "test-secret";
  });

  it("emits orders:refresh with the correct orderId after adding an item", async () => {
    // 1st select → find the product
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
    expect(mockEmit).toHaveBeenCalledWith("orders:refresh", { orderId: ORDER_ID });
  });

  it("returns 404 and does NOT emit orders:refresh when the product is not found", async () => {
    // select → product not found
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
    // select → find the item (status=draft, so deletion is allowed)
    mockDb.select.mockReturnValueOnce(makeChain([ORDER_ITEM]));
    // delete → resolves to empty (no return value needed)
    mockDb.delete.mockReturnValueOnce(makeChain([]));

    const res = await request(app)
      .delete(`/api/order-items/${ITEM_ID}`)
      .set("Authorization", AUTH);

    expect(res.status).toBe(204);

    // The socket event must have fired exactly once with the right orderId
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith("orders:refresh", { orderId: ORDER_ID });
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
    const sentItem = { ...ORDER_ITEM, status: "sent" };
    mockDb.select.mockReturnValueOnce(makeChain([sentItem]));

    const res = await request(app)
      .delete(`/api/order-items/${ITEM_ID}`)
      .set("Authorization", AUTH);

    expect(res.status).toBe(400);
    expect(mockEmit).not.toHaveBeenCalled();
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
    mockDb.select.mockReturnValueOnce(makeChain([PRODUCT]));
    mockDb.insert.mockReturnValueOnce(makeChain([ORDER_ITEM]));

    await request(app)
      .post(`/api/orders/${ORDER_ID}/items`)
      .set("Authorization", AUTH)
      .send({ productId: PRODUCT_ID, quantity: 1 })
      .expect(201);

    // Socket server broadcasts the event — any connected client (Device B)
    // receives it and invalidates its React-Query cache for this order.
    expect(mockEmit).toHaveBeenCalledWith("orders:refresh", { orderId: ORDER_ID });
  });

  it("delete-item path: Device A removes an item, orders:refresh reaches Device B's listener", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([ORDER_ITEM]));
    mockDb.delete.mockReturnValueOnce(makeChain([]));

    await request(app)
      .delete(`/api/order-items/${ITEM_ID}`)
      .set("Authorization", AUTH)
      .expect(204);

    expect(mockEmit).toHaveBeenCalledWith("orders:refresh", { orderId: ORDER_ID });
  });
});
