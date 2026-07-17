/**
 * Checkout flow integration tests — R6 production risk
 *
 * Covers the critical authenticated path:
 *   GET  /tables/:tableId/order      — retrieve active order for a table
 *   POST /orders/:orderId/items      — add an item to an open order
 *   POST /orders/:id/payments        — process payment
 *   GET  /orders/:id/ticket          — retrieve issued ticket
 *   GET  /admin/permissions/catalog  — permission catalog (R5 smoke test)
 *   PUT  /admin/permissions          — upsert a permission override (R5)
 *
 * All routes are mounted under /api by the main router.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── Drizzle chain mock ────────────────────────────────────────────────────────
function makeChain(value: unknown) {
  const chain: Record<string, unknown> & {
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => Promise<unknown>;
  } = {
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  for (const m of [
    "select", "from", "where", "orderBy", "leftJoin", "innerJoin",
    "insert", "update", "delete", "set", "values", "returning",
    "limit", "offset", "groupBy", "having", "execute",
    "onConflictDoUpdate", "onConflictDoNothing",
  ]) {
    chain[m] = () => chain;
  }
  return chain;
}

// ─── Hoisted mock references ──────────────────────────────────────────────────
const mockDb = vi.hoisted(() => ({
  select:      vi.fn(),
  insert:      vi.fn(),
  update:      vi.fn(),
  delete:      vi.fn(),
  transaction: vi.fn(),
  execute:     vi.fn(),
}));

// ─── Module mocks (vi.mock is hoisted before any imports) ─────────────────────
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});

// Synchronous form matches how requireAuth calls jwt.verify(token, secret).
vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn(() => ({ id: "admin-uuid", role: "admin", name: "Test Admin" })),
    sign:   vi.fn(() => "mock-token"),
  },
}));

vi.mock("drizzle-orm", async (importOriginal) => importOriginal());

vi.mock("../lib/socket", () => ({
  getIO:      vi.fn(() => ({ emit: vi.fn(), to: vi.fn(() => ({ emit: vi.fn() })) })),
  initSocket: vi.fn(),
}));

// ─── App import ───────────────────────────────────────────────────────────────
const { default: app } = await import("../app");

// ─── Test fixtures ────────────────────────────────────────────────────────────
const TABLE_ID  = "aaaaaaaa-0000-0000-0000-000000000001";
const ORDER_ID  = "bbbbbbbb-0000-0000-0000-000000000002";
const ITEM_ID   = "cccccccc-0000-0000-0000-000000000003";
const TICKET_ID = "dddddddd-0000-0000-0000-000000000004";

const MOCK_TABLE = {
  id: TABLE_ID, label: "Mesa 1", zoneId: "zone-1",
  status: "occupied", seats: 4, sortOrder: 1,
  rotation: 0, x: 100, y: 100, width: 80, height: 80, shape: "rect",
};

const MOCK_ORDER = {
  id: ORDER_ID, tableId: TABLE_ID, status: "open",
  channel: "tpv", deliveryType: "table",
  total: "0.00", subtotal: "0.00", taxTotal: "0.00",
  isDemo: false, guestCount: 1, notes: null,
  createdAt: new Date(), updatedAt: new Date(),
};

const MOCK_ORDER_ITEM = {
  id: ITEM_ID, orderId: ORDER_ID, productId: "prod-1",
  productName: "Café solo", quantity: 2,
  unitPrice: "1.50", subtotal: "3.00", taxRate: "0.10",
  formatId: null, formatName: null, isInvitation: false,
  notes: null, sentAt: null, createdAt: new Date(),
};

const MOCK_TICKET = {
  id: TICKET_ID, orderId: ORDER_ID, ticketNumber: "T-0001",
  total: "3.30", subtotal: "3.00", taxTotal: "0.30",
  isDemo: false, voidedAt: null, issuedAt: new Date(),
};

const MOCK_PERMISSION_OVERRIDE = {
  id: "perm-uuid-1", role: "manager", module: "orders",
  action: "cancel", allowed: false,
  updatedBy: "admin-uuid", createdAt: new Date(), updatedAt: new Date(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Checkout flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Auth guard — every protected route must reject unauthenticated requests ──
  describe("Authentication guard", () => {
    it("GET /api/tables/:id/order → 401 without token", async () => {
      const res = await request(app).get(`/api/tables/${TABLE_ID}/order`);
      expect(res.status).toBe(401);
    });

    it("POST /api/orders/:id/items → 401 without token", async () => {
      const res = await request(app)
        .post(`/api/orders/${ORDER_ID}/items`)
        .send({ productName: "Café", quantity: 1, unitPrice: 1.5, taxRate: 0.1 });
      expect(res.status).toBe(401);
    });

    it("POST /api/orders/:id/payments → 401 without token", async () => {
      const res = await request(app)
        .post(`/api/orders/${ORDER_ID}/payments`)
        .send({ amount: 3.3, paymentMethodId: "pm-1" });
      expect(res.status).toBe(401);
    });

    it("GET /api/orders/:id/ticket → 401 without token", async () => {
      const res = await request(app).get(`/api/orders/${ORDER_ID}/ticket`);
      expect(res.status).toBe(401);
    });
  });

  // ── Step 1: Retrieve active order for a table ─────────────────────────────
  describe("GET /api/tables/:tableId/order", () => {
    it("returns 404 when table does not exist", async () => {
      mockDb.select.mockReturnValue(makeChain([]));  // table not found

      const res = await request(app)
        .get(`/api/tables/${TABLE_ID}/order`)
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(404);
    });

    it("returns 404 when table has no active order", async () => {
      mockDb.select
        .mockReturnValueOnce(makeChain([MOCK_TABLE]))  // table found
        .mockReturnValueOnce(makeChain([]))             // no active order
        .mockReturnValue(makeChain([]));

      const res = await request(app)
        .get(`/api/tables/${TABLE_ID}/order`)
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(404);
    });

    it("returns table + order + items when active order exists", async () => {
      mockDb.select
        .mockReturnValueOnce(makeChain([MOCK_TABLE]))       // table found
        .mockReturnValueOnce(makeChain([MOCK_ORDER]))       // active order
        .mockReturnValue(makeChain([MOCK_ORDER_ITEM]));     // items

      const res = await request(app)
        .get(`/api/tables/${TABLE_ID}/order`)
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("table");
      expect(res.body).toHaveProperty("order");
      expect(res.body.table.id).toBe(TABLE_ID);
      expect(res.body.order.id).toBe(ORDER_ID);
    });
  });

  // ── Step 2: Add item to an order ─────────────────────────────────────────
  describe("POST /api/orders/:orderId/items", () => {
    it("returns 400 when productId is missing", async () => {
      const res = await request(app)
        .post(`/api/orders/${ORDER_ID}/items`)
        .set("Authorization", "Bearer test-token")
        .send({});  // route requires productId as the first check

      expect(res.status).toBe(400);
    });

    it("returns 404 when order is not found", async () => {
      // Route checks productId first (→400), then order (→404).
      // Supply a productId so the route reaches the order lookup.
      mockDb.select.mockReturnValue(makeChain([]));  // order not found

      const res = await request(app)
        .post(`/api/orders/${ORDER_ID}/items`)
        .set("Authorization", "Bearer test-token")
        .send({ productId: "prod-uuid-1", quantity: 1 });

      expect(res.status).toBe(404);
    });

    it("adds item and returns 201 with the new item", async () => {
      const MOCK_PRODUCT = {
        id: "prod-uuid-1", name: "Café solo",
        price: "1.50", taxRate: 10, categoryId: "cat-1",
        active: true, sortOrder: 0,
      };
      mockDb.select
        .mockReturnValueOnce(makeChain([{ status: "open" }]))  // order status check
        .mockReturnValueOnce(makeChain([MOCK_PRODUCT]))         // product lookup
        .mockReturnValue(makeChain([]));                        // any further selects
      mockDb.insert.mockReturnValue(makeChain([MOCK_ORDER_ITEM]));

      const res = await request(app)
        .post(`/api/orders/${ORDER_ID}/items`)
        .set("Authorization", "Bearer test-token")
        .send({ productId: "prod-uuid-1", quantity: 2 });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
    });
  });

  // ── Step 3: Process payment ───────────────────────────────────────────────
  describe("POST /api/orders/:id/payments", () => {
    it("returns 404 when order is not found", async () => {
      mockDb.select.mockReturnValue(makeChain([]));

      const res = await request(app)
        .post(`/api/orders/${ORDER_ID}/payments`)
        .set("Authorization", "Bearer test-token")
        .send({ amount: 3.3, paymentMethodId: "pm-1" });

      // Expect either 404 (order not found) or 400/422 (validation)
      expect([400, 404, 422]).toContain(res.status);
    });

    it("requires amount and paymentMethodId", async () => {
      mockDb.select.mockReturnValue(makeChain([MOCK_ORDER]));

      const res = await request(app)
        .post(`/api/orders/${ORDER_ID}/payments`)
        .set("Authorization", "Bearer test-token")
        .send({});  // missing amount and paymentMethodId

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  // ── Step 4: Retrieve ticket ───────────────────────────────────────────────
  describe("GET /api/orders/:id/ticket", () => {
    it("returns 404 when order has no ticket", async () => {
      // Route queries ticketsTable first by orderId → [] → 404
      mockDb.select.mockReturnValue(makeChain([]));

      const res = await request(app)
        .get(`/api/orders/${ORDER_ID}/ticket`)
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(404);
    });

    it("returns ticket data when it exists", async () => {
      // Route: ticket → order → items (innerJoin) → table
      mockDb.select
        .mockReturnValueOnce(makeChain([MOCK_TICKET]))  // ticket found
        .mockReturnValueOnce(makeChain([MOCK_ORDER]))   // order
        .mockReturnValue(makeChain([]));                // items, table

      const res = await request(app)
        .get(`/api/orders/${ORDER_ID}/ticket`)
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("ticket");
    });
  });

  // ── Granular permissions API (R5 smoke tests) ────────────────────────────
  describe("Permission catalog — GET /api/admin/permissions/catalog", () => {
    it("returns 401 without auth", async () => {
      const res = await request(app).get("/api/admin/permissions/catalog");
      expect(res.status).toBe(401);
    });

    it("returns catalog with modules and roles for admin", async () => {
      const res = await request(app)
        .get("/api/admin/permissions/catalog")
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("catalog");
      expect(res.body).toHaveProperty("roles");
      expect(Array.isArray(res.body.catalog)).toBe(true);
      expect(res.body.catalog.length).toBeGreaterThan(0);
      const first = res.body.catalog[0];
      expect(first).toHaveProperty("module");
      expect(first).toHaveProperty("label");
      expect(first).toHaveProperty("actions");
      expect(Array.isArray(first.actions)).toBe(true);
    });
  });

  describe("Permission list — GET /api/admin/permissions", () => {
    it("returns 401 without auth", async () => {
      const res = await request(app).get("/api/admin/permissions");
      expect(res.status).toBe(401);
    });

    it("returns overrides array for admin", async () => {
      mockDb.select.mockReturnValue(makeChain([MOCK_PERMISSION_OVERRIDE]));

      const res = await request(app)
        .get("/api/admin/permissions")
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("overrides");
      expect(Array.isArray(res.body.overrides)).toBe(true);
    });
  });

  describe("Permission upsert — PUT /api/admin/permissions", () => {
    it("returns 401 without auth", async () => {
      const res = await request(app)
        .put("/api/admin/permissions")
        .send({ role: "manager", module: "orders", action: "cancel", allowed: false });
      expect(res.status).toBe(401);
    });

    it("returns 400 for unknown role", async () => {
      const res = await request(app)
        .put("/api/admin/permissions")
        .set("Authorization", "Bearer test-token")
        .send({ role: "superadmin", module: "orders", action: "cancel", allowed: true });
      expect(res.status).toBe(400);
    });

    it("returns 400 when fields are missing", async () => {
      const res = await request(app)
        .put("/api/admin/permissions")
        .set("Authorization", "Bearer test-token")
        .send({ role: "manager" });  // missing module, action, allowed
      expect(res.status).toBe(400);
    });

    it("saves override and returns the new permission", async () => {
      mockDb.insert.mockReturnValue(makeChain([MOCK_PERMISSION_OVERRIDE]));

      const res = await request(app)
        .put("/api/admin/permissions")
        .set("Authorization", "Bearer test-token")
        .send({ role: "manager", module: "orders", action: "cancel", allowed: false });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("permission");
      expect(res.body.permission.role).toBe("manager");
      expect(res.body.permission.allowed).toBe(false);
    });
  });

  describe("Permission delete — DELETE /api/admin/permissions/:id", () => {
    it("returns 401 without auth", async () => {
      const res = await request(app).delete(`/api/admin/permissions/${MOCK_PERMISSION_OVERRIDE.id}`);
      expect(res.status).toBe(401);
    });

    it("returns 404 when permission not found", async () => {
      mockDb.delete.mockReturnValue(makeChain([]));  // nothing deleted

      const res = await request(app)
        .delete(`/api/admin/permissions/nonexistent-id`)
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(404);
    });

    it("deletes the override and confirms", async () => {
      mockDb.delete.mockReturnValue(makeChain([MOCK_PERMISSION_OVERRIDE]));

      const res = await request(app)
        .delete(`/api/admin/permissions/${MOCK_PERMISSION_OVERRIDE.id}`)
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("ok", true);
    });
  });
});
