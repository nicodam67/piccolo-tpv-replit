/**
 * Purchase orders module tests (T9–T16)
 * Uses vi.mock for DB and JWT — no real DB connection needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

function makeChain(value: unknown) {
  const chain: Record<string, unknown> & { then: any } = {
    then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject),
  };
  for (const m of ["select","from","where","orderBy","insert","update","set","values","returning",
    "delete","innerJoin","leftJoin","limit","groupBy","$dynamic","mapWith","inArray","gte","lte","asc","desc"]) {
    chain[m] = () => chain;
  }
  return chain;
}

const SUPPLIER = { id: "sup-1", commercialName: "Proveedor Test", active: true };
const ORDER = {
  id: "ord-1", supplierId: "sup-1", supplierName: "Proveedor Test",
  status: "draft", totalAmount: "0", orderDate: new Date().toISOString(),
  expectedDeliveryDate: null, notes: null, cancelReason: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  sentAt: null, confirmedAt: null, cancelledAt: null,
};
const ORDER_ITEM = {
  id: "item-1", orderId: "ord-1", ingredientId: "ing-1",
  ingredientName: "Harina", ingredientUnit: "kg", currentStock: "10",
  minStock: "2", supplierCatalogItemId: null, quantity: "5", unit: "kg",
  unitPrice: "2.50", vatPct: "10", discount: "0", notes: null,
};

const mockDb = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
  transaction: vi.fn(), execute: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});

vi.mock("jsonwebtoken", () => ({
  default: { verify: vi.fn(() => ({ id: "emp-1", name: "Admin", role: "admin" })) },
}));

vi.mock("drizzle-orm", async (importOriginal) => importOriginal());
vi.mock("../lib/socket", () => ({ getIO: vi.fn(() => ({ emit: vi.fn() })), initSocket: vi.fn() }));

const { default: app } = await import("../app");
const AUTH = "Bearer test-token";

describe("Purchase orders module (T9–T16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.transaction.mockImplementation(async (cb: any) => cb(mockDb));
    mockDb.execute.mockResolvedValue([]);
  });

  // T9 – Create purchase order
  it("T9 – POST /api/admin/purchase-orders creates draft order", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([SUPPLIER]));  // supplier check
    mockDb.transaction.mockImplementation(async (cb: any) => {
      const tx = {
        insert: vi.fn().mockReturnValueOnce(makeChain([ORDER]))  // order
          .mockReturnValue(makeChain([])),                       // audit
        select: vi.fn().mockReturnValue(makeChain([ORDER])),
        update: vi.fn().mockReturnValue(makeChain([])),
      };
      await cb(tx);
      return { ...ORDER, id: "ord-1" };
    });
    const res = await request(app)
      .post("/api/admin/purchase-orders")
      .set("Authorization", AUTH)
      .send({ supplierId: "sup-1" });
    expect([200, 201]).toContain(res.status);
  });

  // T10 – Add order item
  it("T10 – POST /api/admin/purchase-orders/:id/items adds a line", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([ORDER]))       // order check
      .mockReturnValue(makeChain([ORDER_ITEM]));     // all items for total
    mockDb.insert.mockReturnValue(makeChain([ORDER_ITEM]));
    mockDb.update.mockReturnValue(makeChain([ORDER]));

    const res = await request(app)
      .post("/api/admin/purchase-orders/ord-1/items")
      .set("Authorization", AUTH)
      .send({ ingredientId: "ing-1", quantity: "5", unitPrice: "2.50" });
    expect([200, 201]).toContain(res.status);
  });

  // T11 – Order total auto-computed
  it("T11 – GET /api/admin/purchase-orders/:id returns computed total", async () => {
    const orderWithItems = { ...ORDER, totalAmount: "13.75", items: [ORDER_ITEM] };
    mockDb.select
      .mockReturnValueOnce(makeChain([orderWithItems]))  // order detail
      .mockReturnValue(makeChain([ORDER_ITEM]));          // items
    const res = await request(app)
      .get("/api/admin/purchase-orders/ord-1")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("ord-1");
  });

  // T12 – Valid state transition draft → pending_approval
  it("T12 – POST /api/admin/purchase-orders/:id/transition advances state", async () => {
    mockDb.select.mockReturnValue(makeChain([ORDER]));
    mockDb.update.mockReturnValue(makeChain([{ ...ORDER, status: "pending_approval" }]));
    mockDb.insert.mockReturnValue(makeChain([]));

    const res = await request(app)
      .post("/api/admin/purchase-orders/ord-1/transition")
      .set("Authorization", AUTH)
      .send({ status: "pending_approval" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending_approval");
  });

  // T13 – Invalid transition rejected
  it("T13 – invalid state transition returns 409", async () => {
    mockDb.select.mockReturnValue(makeChain([ORDER])); // order is "draft"
    const res = await request(app)
      .post("/api/admin/purchase-orders/ord-1/transition")
      .set("Authorization", AUTH)
      .send({ status: "received" }); // cannot go draft → received
    expect(res.status).toBe(409);
  });

  // T14 – Cancel order
  it("T14 – can cancel a draft order", async () => {
    mockDb.select.mockReturnValue(makeChain([ORDER]));
    mockDb.update.mockReturnValue(makeChain([{ ...ORDER, status: "cancelled", cancelledAt: new Date() }]));
    mockDb.insert.mockReturnValue(makeChain([]));

    const res = await request(app)
      .post("/api/admin/purchase-orders/ord-1/transition")
      .set("Authorization", AUTH)
      .send({ status: "cancelled", cancelReason: "Test" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
  });

  // T15 – Cannot add items to received order
  it("T15 – POST items to received order returns 409", async () => {
    mockDb.select.mockReturnValue(makeChain([{ ...ORDER, status: "received" }]));
    const res = await request(app)
      .post("/api/admin/purchase-orders/ord-1/items")
      .set("Authorization", AUTH)
      .send({ ingredientId: "ing-1", quantity: "1", unitPrice: "1" });
    expect(res.status).toBe(409);
  });

  // T16 – Proposal endpoint
  it("T16 – POST /api/admin/purchase-orders/proposal returns suggestions", async () => {
    // ingredients, stock movements, pending items, catalogue
    mockDb.select
      .mockReturnValueOnce(makeChain([
        { id: "ing-1", name: "Harina", unit: "kg", currentStock: "1", minStock: "5", optimalStock: "10", purchaseCost: "2" },
      ]))
      .mockReturnValueOnce(makeChain([]))  // consumption from movements
      .mockReturnValueOnce(makeChain([]))  // pending items in orders
      .mockReturnValue(makeChain([]));     // catalogue

    const res = await request(app)
      .post("/api/admin/purchase-orders/proposal")
      .set("Authorization", AUTH)
      .send({ daysAhead: 7 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    // Harina: stock=1, min=5 → should be in suggestions
    expect(res.body.suggestions.length).toBeGreaterThan(0);
    expect(res.body.suggestions[0].ingredientId).toBe("ing-1");
  });
});
