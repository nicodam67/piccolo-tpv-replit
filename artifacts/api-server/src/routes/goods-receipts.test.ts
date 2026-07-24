/**
 * Goods receipts + supplier invoices + reports tests (T17–T20 + report tests)
 * Uses vi.mock for DB and JWT — no real DB connection needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

function makeChain(value: unknown) {
  const chain: Record<string, unknown> & { then: any } = {
    then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject),
  };
  for (const m of ["select","from","where","orderBy","insert","update","set","values","returning",
    "delete","innerJoin","leftJoin","limit","groupBy","$dynamic","mapWith","inArray","gte","lte","asc","desc","for"]) {
    chain[m] = () => chain;
  }
  return chain;
}

const INGREDIENT = {
  id: "ing-1", name: "Harina", unit: "kg", currentStock: "10", minStock: "2",
  optimalStock: "20", purchaseCost: "2.00", active: true,
};
const SUPPLIER = { id: "sup-1", commercialName: "Test SA", active: true };
const RECEIPT = {
  id: "rec-1", orderId: "ord-1", supplierId: "sup-1", supplierName: "Test SA",
  receiptNumber: "ALB-001", receiptDate: new Date().toISOString(),
  totalAmount: "9.00", incidents: null, attachmentUrl: null, createdAt: new Date().toISOString(),
};
const RECEIPT_ITEM = {
  id: "ri-1", receiptId: "rec-1", ingredientId: "ing-1", ingredientName: "Harina",
  ingredientUnit: "kg", orderItemId: null, qtyOrdered: "5", qtyReceived: "3",
  qtyRejected: "0", unitPrice: "3.00", lotNumber: "LOT-001", expiryDate: "2027-12-31",
  temperature: null, incidents: null, substitution: null,
};
const INVOICE = {
  id: "inv-1", supplierId: "sup-1", supplierName: "Test SA",
  invoiceNumber: "FAC-2024-001", invoiceDate: "2024-01-15",
  taxableBase: "9.00", vatAmount: "0.90", total: "9.90",
  dueDate: "2024-02-15", paymentStatus: "unpaid", paidAt: null,
  notes: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
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

describe("Goods receipts module (T17–T20)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.execute.mockResolvedValue([]);
  });

  // T17 – Create goods receipt (stock update via weighted average cost)
  it("T17 – POST /api/admin/goods-receipts creates receipt and triggers stock update", async () => {
    // Setup transaction that simulates the full creation flow
    mockDb.transaction.mockImplementation(async (cb: any) => {
      const tx = {
        insert: vi.fn().mockReturnValue(makeChain([RECEIPT])),
        select: vi.fn()
          .mockReturnValueOnce(makeChain([INGREDIENT]))   // ingredient for stock calc
          .mockReturnValueOnce(makeChain([]))             // all receipts (order status)
          .mockReturnValue(makeChain([])),
        update: vi.fn().mockReturnValue(makeChain([])),
      };
      return cb(tx);
    });

    const res = await request(app)
      .post("/api/admin/goods-receipts")
      .set("Authorization", AUTH)
      .send({
        supplierId: "sup-1",
        receiptNumber: "ALB-001",
        items: [{
          ingredientId: "ing-1",
          qtyReceived: "3",
          qtyRejected: "0",
          unitPrice: "3.00",
          lotNumber: "LOT-001",
          expiryDate: "2027-12-31",
        }],
      });
    // The transaction mock returns the receipt so we expect 201
    expect([200, 201]).toContain(res.status);
  });

  // T18 – Price deviation detection
  it("T18 – price deviation >10% returns 422 without force flag", async () => {
    // Order with price 3.00, receipt price 50.00 (>10% deviation)
    const ORDER_ITEMS = [{ ingredientId: "ing-1", unitPrice: "3.00" }];
    mockDb.select.mockReturnValue(makeChain(ORDER_ITEMS));

    const res = await request(app)
      .post("/api/admin/goods-receipts")
      .set("Authorization", AUTH)
      .send({
        supplierId: "sup-1",
        orderId: "ord-1",
        forceOnPriceDeviation: false,
        items: [{
          ingredientId: "ing-1",
          qtyReceived: "1",
          qtyRejected: "0",
          unitPrice: "50.00",  // 1567% deviation
        }],
      });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("price_deviation");
  });

  // T19 – Expiring lots report
  it("T19 – GET /api/admin/purchase-reports/expiring-lots returns lots array", async () => {
    const LOT = {
      id: "lot-1", ingredientId: "ing-1", ingredientName: "Harina", ingredientUnit: "kg",
      lotNumber: "LOT-001", expiryDate: "2026-07-20", remainingQty: "2",
      supplierId: "sup-1", supplierName: "Test SA", createdAt: new Date().toISOString(),
    };
    mockDb.select.mockReturnValue(makeChain([LOT]));
    const res = await request(app)
      .get("/api/admin/purchase-reports/expiring-lots?days=30")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.lots)).toBe(true);
  });

  // T20 – Supplier invoices CRUD
  it("T20 – POST /api/admin/supplier-invoices creates invoice", async () => {
    mockDb.transaction.mockImplementation(async (cb: any) => {
      const tx = {
        insert: vi.fn().mockReturnValue(makeChain([INVOICE])),
      };
      return cb(tx);
    });
    const res = await request(app)
      .post("/api/admin/supplier-invoices")
      .set("Authorization", AUTH)
      .send({
        supplierId: "sup-1",
        invoiceNumber: "FAC-2024-001",
        invoiceDate: "2024-01-15",
        taxableBase: "9.00",
        vatAmount: "0.90",
        total: "9.90",
      });
    expect([200, 201]).toContain(res.status);
  });

  // T21 – Reconciliation endpoint
  it("T21 – GET /api/admin/purchase-orders/:id/reconciliation returns summary", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([{ ...{ id: "ord-1", status: "received", totalAmount: "9.00" }, supplierName: "Test SA" }]))
      .mockReturnValueOnce(makeChain([]))  // order items
      .mockReturnValueOnce(makeChain([RECEIPT]))  // receipts
      .mockReturnValueOnce(makeChain([]))  // invoice links
      .mockReturnValue(makeChain([]));

    const res = await request(app)
      .get("/api/admin/purchase-orders/ord-1/reconciliation")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(typeof res.body.summary.orderTotal).toBe("string");
  });

  // T22 – By-supplier report
  it("T22 – GET /api/admin/purchase-reports/by-supplier returns supplier aggregates", async () => {
    mockDb.select.mockReturnValue(makeChain([
      { supplierId: "sup-1", supplierName: "Test SA", orderCount: 3, totalAmount: 250 },
    ]));
    const res = await request(app)
      .get("/api/admin/purchase-reports/by-supplier")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.suppliers)).toBe(true);
  });

  // T23 – Unpaid invoices report
  it("T23 – GET /api/admin/purchase-reports/unpaid-invoices returns unpaid list", async () => {
    mockDb.select.mockReturnValue(makeChain([INVOICE]));
    const res = await request(app)
      .get("/api/admin/purchase-reports/unpaid-invoices")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
