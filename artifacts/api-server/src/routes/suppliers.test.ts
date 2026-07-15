/**
 * Suppliers module tests (T1–T8)
 * Uses vi.mock for DB and JWT — no real DB connection needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── DB mock ─────────────────────────────────────────────────────────────────
function makeChain(value: unknown) {
  const chain: Record<string, unknown> & { then: any } = {
    then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject),
  };
  for (const m of ["select","from","where","orderBy","insert","update","set","values","returning",
    "delete","innerJoin","leftJoin","limit","groupBy","$dynamic","asc","desc"]) {
    chain[m] = () => chain;
  }
  return chain;
}

const SUPPLIER = {
  id: "sup-1", commercialName: "Test SA", active: true, leadTimeDays: 1,
  legalName: null, nif: null, address: null, phone: null, email: null,
  contactPerson: null, paymentTerms: null, deliveryDays: null, minOrder: "0",
  notes: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};
const CATALOG_ITEM = {
  id: "cat-1", supplierId: "sup-1", ingredientId: "ing-1", supplierRef: null,
  purchaseFormat: null, unitsPerPack: "1", purchaseUnit: "ud", price: "3.50",
  vatPct: "10", discount: "0", transportCost: "0", isPreferred: false,
  updatedAt: new Date().toISOString(),
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

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.transaction.mockImplementation(async (cb: any) => cb(mockDb));
  mockDb.execute.mockResolvedValue([]);

  // Default chain: returns empty or supplier
  const listChain = makeChain([SUPPLIER]);
  const singleChain = makeChain([SUPPLIER]);
  const updChain = makeChain([{ ...SUPPLIER, phone: "612345678" }]);
  const catChain = makeChain([CATALOG_ITEM]);
  const catUpdChain = makeChain([{ ...CATALOG_ITEM, isPreferred: true }]);
  const insChain = makeChain([SUPPLIER]);
  const auditChain = makeChain([]);
  const insChainCat = makeChain([CATALOG_ITEM]);

  // select: returns supplier list or details
  mockDb.select.mockReturnValueOnce(listChain)
    .mockReturnValueOnce(singleChain) // supplier detail
    .mockReturnValueOnce(catChain)    // catalogue
    .mockReturnValueOnce(singleChain) // update — existing check
    .mockReturnValueOnce(singleChain) // delete — check
    .mockReturnValueOnce(catChain)    // catalogue item for set-preferred
    .mockReturnValueOnce(catChain)    // price comparison
    .mockReturnValue(makeChain([SUPPLIER])); // fallback

  mockDb.insert.mockReturnValueOnce(insChain) // supplier create
    .mockReturnValueOnce(auditChain)          // audit log
    .mockReturnValueOnce(insChainCat)         // catalogue insert
    .mockReturnValue(makeChain([]));

  mockDb.update.mockReturnValueOnce(updChain) // supplier update
    .mockReturnValueOnce(catUpdChain)         // clear preferred
    .mockReturnValueOnce(catUpdChain)         // set preferred
    .mockReturnValue(makeChain([SUPPLIER]));

  mockDb.delete.mockReturnValue(makeChain([]));
});

describe("Suppliers module (T1–T8)", () => {
  // T1 – Create supplier
  it("T1 – POST /api/admin/suppliers creates a supplier", async () => {
    mockDb.insert.mockReturnValueOnce(makeChain([SUPPLIER]))
      .mockReturnValue(makeChain([]));
    const res = await request(app)
      .post("/api/admin/suppliers")
      .set("Authorization", AUTH)
      .send({ commercialName: "Test SA" });
    expect([201, 200]).toContain(res.status);
  });

  // T2 – List suppliers
  it("T2 – GET /api/admin/suppliers returns array", async () => {
    mockDb.select.mockReturnValue(makeChain([SUPPLIER]));
    const res = await request(app)
      .get("/api/admin/suppliers")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T3 – Get supplier detail with catalogue
  it("T3 – GET /api/admin/suppliers/:id returns supplier + catalogue", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([SUPPLIER]))
      .mockReturnValue(makeChain([CATALOG_ITEM]));
    const res = await request(app)
      .get("/api/admin/suppliers/sup-1")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("sup-1");
    expect(Array.isArray(res.body.catalogue)).toBe(true);
  });

  // T4 – Update supplier
  it("T4 – PATCH /api/admin/suppliers/:id updates fields", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([SUPPLIER]));
    mockDb.update.mockReturnValue(makeChain([{ ...SUPPLIER, phone: "612345678" }]));
    const res = await request(app)
      .patch("/api/admin/suppliers/sup-1")
      .set("Authorization", AUTH)
      .send({ phone: "612345678" });
    expect([200, 201]).toContain(res.status);
  });

  // T5 – Add catalogue item
  it("T5 – POST /api/admin/suppliers/:id/catalogue adds item", async () => {
    mockDb.insert.mockReturnValueOnce(makeChain([CATALOG_ITEM]));
    const res = await request(app)
      .post("/api/admin/suppliers/sup-1/catalogue")
      .set("Authorization", AUTH)
      .send({ ingredientId: "ing-1", price: "3.50" });
    expect([200, 201]).toContain(res.status);
  });

  // T6 – Set preferred supplier
  it("T6 – PATCH /api/admin/supplier-catalogue/:id/set-preferred sets preferred flag", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([CATALOG_ITEM]));
    mockDb.update
      .mockReturnValueOnce(makeChain([]))   // clear all preferred
      .mockReturnValueOnce(makeChain([{ ...CATALOG_ITEM, isPreferred: true }]));
    const res = await request(app)
      .patch("/api/admin/supplier-catalogue/cat-1/set-preferred")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.isPreferred).toBe(true);
  });

  // T7 – Price comparison (ingredient list endpoint)
  it("T7 – GET /api/admin/price-comparison returns ingredient list", async () => {
    mockDb.select.mockReturnValue(makeChain([
      { ingredientId: "ing-1", ingredientName: "Harina", ingredientUnit: "kg", supplierCount: 2 },
    ]));
    const res = await request(app)
      .get("/api/admin/price-comparison")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T8 – Deactivate supplier (soft delete)
  it("T8 – DELETE /api/admin/suppliers/:id soft-deactivates", async () => {
    mockDb.update.mockReturnValue(makeChain([]));
    mockDb.insert.mockReturnValue(makeChain([]));
    const res = await request(app)
      .delete("/api/admin/suppliers/sup-1")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
