/**
 * Allergens & Food Safety module tests (T1–T15)
 * Uses vi.mock for DB and JWT — no real DB connection needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── DB mock ─────────────────────────────────────────────────────────────────
function makeChain(value: unknown) {
  const chain: Record<string, unknown> & { then: any } = {
    then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject),
  };
  for (const m of [
    "select","from","where","orderBy","insert","update","set","values","returning",
    "delete","innerJoin","leftJoin","limit","groupBy","$dynamic","asc","desc",
    "onConflictDoNothing","onConflictDoUpdate",
  ]) {
    chain[m] = () => chain;
  }
  return chain;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────
const ALLERGEN_CATALOG = {
  code: "gluten", nameEs: "Cereales con gluten", nameEn: "Gluten-containing cereals",
  description: "Trigo, centeno, cebada…", iconSlug: "allergen-gluten", active: true, sortOrder: "01",
};
const ING_ALLERGEN = {
  id: "ia-1", ingredientId: "ing-1", allergenCode: "gluten", type: "contains",
  manufacturerInfo: null, technicalDocUrl: null, lastReviewedAt: new Date().toISOString(),
  reviewedBy: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  allergenName: "Cereales con gluten", iconSlug: "allergen-gluten",
};
const PRODUCT_ALLERGEN_CACHE = {
  id: "pac-1", productId: "prod-1", allergenCode: "gluten", type: "contains",
  source: "ingredient", needsReview: false, calculatedAt: new Date().toISOString(),
  allergenName: "Cereales con gluten", allergenNameEn: "Gluten-containing cereals",
  iconSlug: "allergen-gluten",
};
const GUEST_ALLERGY = {
  id: "ga-1", orderId: "ord-1", tableId: "tbl-1", guestNumber: "1",
  allergenCode: "gluten", severity: "life_threatening", notes: null,
  registeredAt: new Date().toISOString(), active: true,
  allergenName: "Cereales con gluten", iconSlug: "allergen-gluten",
};
const TECH_SHEET = {
  id: "ts-1", productId: "prod-1", version: "1",
  content: { productName: "Pizza", ingredients: [], allergens: [], crossContaminationRisks: [], notes: "" },
  validFrom: new Date().toISOString(), validTo: null,
  createdBy: null, createdAt: new Date().toISOString(),
};
const KDS_CONFIRMATION = {
  id: "kc-1", taskId: "task-1", guestAllergyIds: [],
  confirmedBy: "emp-1", confirmedAt: new Date().toISOString(),
  notes: "Preparado con utensilios limpios", hasCrossContaminationRisk: false,
};
const LOT = {
  id: "lot-1", lotNumber: "LOT-2024-001", ingredientId: "ing-1",
  initialQty: "10.0000", remainingQty: "7.5000", expiryDate: "2025-12-31",
  supplierId: null, createdAt: new Date().toISOString(),
};
const LOT_BLOCK = {
  id: "lb-1", lotId: "lot-1", lotNumber: "LOT-2024-001",
  ingredientId: "ing-1", blockedAt: new Date().toISOString(),
  reason: "Alerta RASFF", blockReport: { affectedIngredients: [], affectedProducts: [], affectedOrders: [], summary: "Test" },
  resolvedAt: null, resolveNote: null,
};
const INGREDIENT = {
  id: "ing-1", name: "Harina", allergenTags: ["gluten"], unit: "kg",
  purchaseCost: "0.80", currentStock: "10.0000", minStock: "2.0000", optimalStock: "8.0000",
  active: true, supplierName: null, internalCode: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};
const PRODUCT = {
  id: "prod-1", name: "Pizza", allergens: "gluten",
  description: null, price: "9.50", active: true, qrVisible: true,
  categoryId: "cat-1", imageUrl: null, outOfStock: false,
};
const ORDER = {
  id: "ord-1", tableId: "tbl-1", status: "open", employeeId: "emp-1",
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};
const KITCHEN_TASK = {
  id: "task-1", orderId: "ord-1", productId: "prod-1", productName: "Pizza",
  quantity: 1, hasAllergy: true, allergyNote: "Sin gluten",
  tableName: "Mesa 1", employeeName: "Ana", zone: "cocina",
  status: "new", notes: null, createdAt: new Date().toISOString(),
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

function resetMocks() {
  vi.clearAllMocks();
  mockDb.transaction.mockImplementation(async (cb: any) => cb(mockDb));
  mockDb.execute.mockResolvedValue([]);
  mockDb.delete.mockReturnValue(makeChain([]));
}

beforeEach(() => {
  resetMocks();
});

// ─── Allergen Catalogue ───────────────────────────────────────────────────────
describe("Allergens module — Catalogue (T1–T2)", () => {
  it("T1 — GET /api/admin/allergens returns the 14-allergen catalogue", async () => {
    mockDb.select.mockReturnValue(makeChain([ALLERGEN_CATALOG]));
    const res = await request(app)
      .get("/api/admin/allergens")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("T2 — GET /api/admin/allergens/:code returns single allergen by code", async () => {
    mockDb.select.mockReturnValue(makeChain([ALLERGEN_CATALOG]));
    const res = await request(app)
      .get("/api/admin/allergens/gluten")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe("gluten");
  });
});

// ─── Ingredient Allergens ────────────────────────────────────────────────────
describe("Allergens module — Ingredient allergens (T3–T4)", () => {
  it("T3 — GET /api/admin/ingredients/:id/allergens returns structured allergens", async () => {
    mockDb.select.mockReturnValue(makeChain([ING_ALLERGEN]));
    const res = await request(app)
      .get("/api/admin/ingredients/ing-1/allergens")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("T4 — PUT /api/admin/ingredients/:id/allergens replaces allergens and saves version", async () => {
    // before snapshot, version insert, allergen delete, allergen insert, ingredient update, version close
    mockDb.select
      .mockReturnValueOnce(makeChain([{ allergenCode: "gluten", type: "contains" }])) // before snapshot
      .mockReturnValueOnce(makeChain([])) // recalculate: directLines
      .mockReturnValueOnce(makeChain([])) // recalculate: subrecipeLines
      .mockReturnValueOnce(makeChain([])) // recalculate: structured allergens
      .mockReturnValueOnce(makeChain([])) // recalculate: overrides
      .mockReturnValueOnce(makeChain([]))  // affected products
      .mockReturnValue(makeChain([]));
    mockDb.insert.mockReturnValue(makeChain([]));
    mockDb.update.mockReturnValue(makeChain([]));
    mockDb.delete.mockReturnValue(makeChain([]));

    const res = await request(app)
      .put("/api/admin/ingredients/ing-1/allergens")
      .set("Authorization", AUTH)
      .send({ allergens: [{ allergenCode: "gluten", type: "contains" }, { allergenCode: "milk", type: "traces" }], reviewNote: "Test review" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ─── Product Allergen Cache ──────────────────────────────────────────────────
describe("Allergens module — Product allergen cache (T5–T7)", () => {
  it("T5 — GET /api/admin/products/:id/allergens returns cache + overrides", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([PRODUCT_ALLERGEN_CACHE]))
      .mockReturnValue(makeChain([]));
    const res = await request(app)
      .get("/api/admin/products/prod-1/allergens")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.cache).toBeDefined();
    expect(res.body.overrides).toBeDefined();
  });

  it("T6 — POST /api/admin/products/:id/allergens/recalculate recomputes cache", async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    mockDb.delete.mockReturnValue(makeChain([]));
    mockDb.insert.mockReturnValue(makeChain([]));
    mockDb.update.mockReturnValue(makeChain([]));
    const res = await request(app)
      .post("/api/admin/products/prod-1/allergens/recalculate")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("T7 — POST /api/admin/products/:id/allergens/override adds manual allergen", async () => {
    mockDb.insert.mockReturnValue(makeChain([]));
    mockDb.select.mockReturnValue(makeChain([]));
    mockDb.delete.mockReturnValue(makeChain([]));
    mockDb.update.mockReturnValue(makeChain([]));
    const res = await request(app)
      .post("/api/admin/products/prod-1/allergens/override")
      .set("Authorization", AUTH)
      .send({ allergenCode: "sesame", type: "cross_contamination", note: "Riesgo en producción" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ─── Technical Sheets ────────────────────────────────────────────────────────
describe("Allergens module — Technical sheets (T8–T9)", () => {
  it("T8 — GET /api/admin/products/:id/technical-sheet returns current sheet", async () => {
    mockDb.select.mockReturnValue(makeChain([TECH_SHEET]));
    const res = await request(app)
      .get("/api/admin/products/prod-1/technical-sheet")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.version).toBe("1");
  });

  it("T9 — POST /api/admin/products/:id/technical-sheet generates new versioned sheet", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([PRODUCT])) // product
      .mockReturnValueOnce(makeChain([PRODUCT_ALLERGEN_CACHE])) // allergen cache
      .mockReturnValueOnce(makeChain([])) // recipe ingredients
      .mockReturnValueOnce(makeChain([])) // ingredient allergens
      .mockReturnValueOnce(makeChain([])) // previous versions (for next version number)
      .mockReturnValue(makeChain([]));
    mockDb.update.mockReturnValue(makeChain([]));
    mockDb.insert.mockReturnValue(makeChain([TECH_SHEET]));
    const res = await request(app)
      .post("/api/admin/products/prod-1/technical-sheet")
      .set("Authorization", AUTH)
      .send({ notes: "Generado automáticamente" });
    expect(res.status).toBe(201);
  });
});

// ─── Table Guest Allergies ───────────────────────────────────────────────────
describe("Allergens module — Guest allergies (T10–T13)", () => {
  it("T10 — GET /api/orders/:orderId/guest-allergies returns active allergies", async () => {
    mockDb.select.mockReturnValue(makeChain([GUEST_ALLERGY]));
    const res = await request(app)
      .get("/api/orders/ord-1/guest-allergies")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("T11 — POST /api/orders/:orderId/guest-allergies registers a new allergy", async () => {
    mockDb.select.mockReturnValue(makeChain([ORDER])); // order lookup
    mockDb.insert.mockReturnValue(makeChain([GUEST_ALLERGY]));
    const res = await request(app)
      .post("/api/orders/ord-1/guest-allergies")
      .set("Authorization", AUTH)
      .send({ guestNumber: "2", allergenCode: "gluten", severity: "life_threatening", notes: "Celíaco confirmado" });
    expect(res.status).toBe(201);
    expect(res.body.allergenCode).toBe("gluten");
  });

  it("T12 — DELETE /api/orders/:orderId/guest-allergies/:id deactivates the allergy", async () => {
    mockDb.update.mockReturnValue(makeChain([{ ...GUEST_ALLERGY, active: false }]));
    const res = await request(app)
      .delete("/api/orders/ord-1/guest-allergies/ga-1")
      .set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("T13 — POST /api/orders/:orderId/check-allergy detects conflicts with product allergens", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([{ allergenCode: "gluten", type: "contains", allergenName: "Cereales con gluten" }])) // product cache
      .mockReturnValueOnce(makeChain([{ id: "ga-1", guestNumber: "1", allergenCode: "gluten", severity: "life_threatening", allergenName: "Cereales con gluten" }])); // guest allergies
    const res = await request(app)
      .post("/api/orders/ord-1/check-allergy")
      .set("Authorization", AUTH)
      .send({ productId: "prod-1" });
    expect(res.status).toBe(200);
    expect(res.body.hasConflict).toBe(true);
    expect(res.body.conflicts.length).toBeGreaterThan(0);
    expect(res.body.conflicts[0].allergenCode).toBe("gluten");
  });
});

// ─── KDS Allergy Confirmation ─────────────────────────────────────────────────
describe("Allergens module — KDS confirmation (T14)", () => {
  it("T14 — POST /api/kitchen-tasks/:taskId/allergy-confirm creates confirmation record", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([KITCHEN_TASK]));
    mockDb.insert.mockReturnValue(makeChain([KDS_CONFIRMATION]));
    const res = await request(app)
      .post("/api/kitchen-tasks/task-1/allergy-confirm")
      .set("Authorization", AUTH)
      .send({ notes: "Preparado con utensilios limpios", hasCrossContaminationRisk: false });
    expect(res.status).toBe(201);
    expect(res.body.confirmedBy).toBe("emp-1");
  });
});

// ─── Lot Traceability & Block ─────────────────────────────────────────────────
describe("Allergens module — Lot block (T15)", () => {
  it("T15 — POST /api/admin/traceability/lots/:lotId/block creates a block and report", async () => {
    // lot lookup + check existing block + find products + find movements
    mockDb.select
      .mockReturnValueOnce(makeChain([{ id: "lot-1", lotNumber: "LOT-2024-001", ingredientId: "ing-1", ingredientName: "Harina", createdAt: new Date(), expiryDate: null }])) // lot
      .mockReturnValueOnce(makeChain([]))  // existing block check (none)
      .mockReturnValueOnce(makeChain([{ id: "prod-1", name: "Pizza" }])) // direct products
      .mockReturnValueOnce(makeChain([]))  // via-subrecipe products
      .mockReturnValueOnce(makeChain([])) // movements
      .mockReturnValue(makeChain([]));
    const FULL_REASON = "Alerta RASFF por presencia de Listeria en el lote";
    mockDb.insert.mockReturnValue(makeChain([{ ...LOT_BLOCK, reason: FULL_REASON }]));

    const res = await request(app)
      .post("/api/admin/traceability/lots/lot-1/block")
      .set("Authorization", AUTH)
      .send({ reason: FULL_REASON });
    expect(res.status).toBe(201);
    expect(res.body.lotNumber).toBe("LOT-2024-001");
    expect(res.body.reason).toBe(FULL_REASON);
  });
});
