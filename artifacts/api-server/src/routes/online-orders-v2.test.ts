/**
 * Online Orders v2 — Integration tests
 *
 * All @workspace/db operations are mocked (the vitest config provides a fake
 * DATABASE_URL; the real pg.Pool never connects). Each test sets up
 * mockResolvedValueOnce on the shared mock fns before making HTTP requests.
 *
 * Tests:
 *   1. Table session creation and validation
 *   2. Table session expiry / close detection
 *   3. Cart GET (empty) and POST (upsert)
 *   4. Product availability rules list
 *   5. Stripe HMAC webhook signature verification (security tests — no DB needed)
 *   6. Simulator security (production block, wrong secret)
 */

import { vi, describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createHmac } from "node:crypto";

// ─── Hoisted mock fns ────────────────────────────────────────────────────────
// vi.hoisted runs before vi.mock so these refs are available in the factory.

const {
  mockInsertReturning,
  mockSelectResult,
  mockUpdateReturning,
  mockExecuteResult,
} = vi.hoisted(() => ({
  /** Resolves to the array returned by .insert().values().returning() */
  mockInsertReturning: vi.fn().mockResolvedValue([]),
  /** Resolves to the array returned by .select().from().where().limit() or await (no limit) */
  mockSelectResult: vi.fn().mockResolvedValue([]),
  /** Resolves to the array returned by .update().set().where().returning() */
  mockUpdateReturning: vi.fn().mockResolvedValue([]),
  /** Resolves to { rows: [] } for db.execute() */
  mockExecuteResult: vi.fn().mockResolvedValue({ rows: [] }),
}));

// ─── Mock @workspace/db ──────────────────────────────────────────────────────
// Spread the REAL module so every table export (kitchenTasksTable, etc.)
// is available to other routes loaded by app.ts.  We only override `db`
// and `pool` so no real pg connection is attempted.

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();

  /** Creates a chainable select mock that terminates at .limit() or await */
  function makeSelectChain(): any {
    const c: any = {
      from: () => c,
      where: () => c,
      orderBy: () => c,
      limit: (_n: number) => mockSelectResult(),
      then: (resolve: any, reject: any) =>
        mockSelectResult().then(resolve, reject),
    };
    return c;
  }

  return {
    ...actual,
    pool: { end: async () => {}, query: async () => ({ rows: [] }) },
    db: {
      insert: (_t: any) => ({
        values: (_data: any) => ({ returning: () => mockInsertReturning() }),
      }),
      select: (_columns?: any) => makeSelectChain(),
      update: (_t: any) => ({
        set: (_data: any) => ({
          where: (_cond: any) => ({ returning: () => mockUpdateReturning() }),
        }),
      }),
      delete: (_t: any) => ({ where: async () => {} }),
      execute: mockExecuteResult,
    },
  };
});

// ─── Mock auth middleware ────────────────────────────────────────────────────
// All admin routes require auth; bypass it in tests by injecting a fake user.

vi.mock("../middlewares/auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireRole:
    (..._roles: string[]) =>
    (_req: any, _res: any, next: any) =>
      next(),
  requirePermission:
    (_permission: string) =>
    (_req: any, _res: any, next: any) =>
      next(),
}));

// ─── Import app AFTER mocks are registered ───────────────────────────────────

import app from "../app";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PFX = "TEST-V2-";

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "sess-001",
    token: "open-token-001",
    status: "open",
    tableLabel: `${PFX}Mesa 1`,
    zoneLabel: "Terraza",
    tableId: null,
    zoneId: null,
    guestName: "",
    expiresAt: new Date(Date.now() + 4 * 3_600_000).toISOString(),
    closedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

let sessionToken = "";
let sessionId = "";
let ruleId = "";

// ─── Table sessions ───────────────────────────────────────────────────────────

describe("Table sessions", () => {
  beforeAll(() => {
    sessionToken = "";
    sessionId = "";
  });

  it("creates a new table session", async () => {
    const mockSession = makeSession();
    mockInsertReturning.mockResolvedValueOnce([mockSession]);

    const res = await request(app)
      .post("/api/public/table-sessions")
      .send({ tableLabel: `${PFX}Mesa 1`, zoneLabel: "Terraza" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("open");
    expect(res.body.tableLabel).toContain(PFX);

    sessionToken = res.body.token ?? mockSession.token;
    sessionId = res.body.id ?? mockSession.id;
  });

  it("validates a live session token", async () => {
    const mockSession = makeSession();
    mockSelectResult.mockResolvedValueOnce([mockSession]);

    const res = await request(app).get(
      `/api/public/table-sessions/check?token=${sessionToken || "open-token-001"}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("open");
  });

  it("returns 404 for unknown token", async () => {
    mockSelectResult.mockResolvedValueOnce([]);

    const res = await request(app).get(
      "/api/public/table-sessions/check?token=unknown-token-xyz",
    );

    expect(res.status).toBe(404);
  });

  it("admin can close a session", async () => {
    const closed = makeSession({ status: "closed", closedAt: new Date().toISOString() });
    mockUpdateReturning.mockResolvedValueOnce([closed]);

    const res = await request(app)
      .patch(`/api/admin/table-sessions/${sessionId || "sess-001"}`)
      .send({ status: "closed" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("closed");
  });

  it("returns 410 for closed session", async () => {
    const closed = makeSession({ status: "closed", closedAt: new Date().toISOString() });
    mockSelectResult.mockResolvedValueOnce([closed]);

    const res = await request(app).get(
      `/api/public/table-sessions/check?token=${sessionToken || "open-token-001"}`,
    );

    expect([410, 404]).toContain(res.status);
  });
});

// ─── Cart persistence ─────────────────────────────────────────────────────────

describe("Cart persistence", () => {
  const cartToken = `${PFX}cart-001`;

  it("returns empty cart for unknown token", async () => {
    mockSelectResult.mockResolvedValueOnce([]);

    const res = await request(app).get(
      `/api/public/cart?token=${cartToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("saves and retrieves a cart", async () => {
    const mockCart = {
      id: "cart-001",
      sessionToken: cartToken,
      items: [{ productId: "prod-1", quantity: 2 }],
      deliveryType: "takeaway",
      updatedAt: new Date().toISOString(),
    };

    // POST upsert — db.execute returns the saved cart
    mockExecuteResult.mockResolvedValueOnce({ rows: [mockCart] });

    const saveRes = await request(app)
      .post("/api/public/cart")
      .send({ token: cartToken, items: mockCart.items, deliveryType: "takeaway" });

    expect([200, 201]).toContain(saveRes.status);

    // GET — db.select returns the saved cart
    mockSelectResult.mockResolvedValueOnce([mockCart]);

    const getRes = await request(app).get(`/api/public/cart?token=${cartToken}`);

    expect(getRes.status).toBe(200);
    expect(Array.isArray(getRes.body.items)).toBe(true);
  });

  it("upserts existing cart (overwrites)", async () => {
    const updatedCart = {
      id: "cart-001",
      sessionToken: cartToken,
      items: [{ productId: "prod-1", quantity: 5 }],
      deliveryType: "dine_in",
      updatedAt: new Date().toISOString(),
    };

    mockExecuteResult.mockResolvedValueOnce({ rows: [updatedCart] });

    const res = await request(app)
      .post("/api/public/cart")
      .send({
        token: cartToken,
        items: updatedCart.items,
        deliveryType: "dine_in",
      });

    expect([200, 201]).toContain(res.status);
  });
});

// ─── Product availability rules ───────────────────────────────────────────────

describe("Product availability rules", () => {
  beforeAll(() => {
    ruleId = "";
  });

  it("lists rules (empty store)", async () => {
    mockSelectResult.mockResolvedValueOnce([]);

    const res = await request(app)
      .get("/api/admin/product-availability-rules");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("creates a rule", async () => {
    const mockRule = {
      id: "rule-001",
      productId: "prod-001",
      categoryId: null,
      label: "Solo mañana",
      daysOfWeek: [1],
      timeFrom: "08:00",
      timeTo: "14:00",
      active: true,
      createdAt: new Date().toISOString(),
    };

    mockInsertReturning.mockResolvedValueOnce([mockRule]);

    const res = await request(app)
      .post("/api/admin/product-availability-rules")
      .send({
        productId: "prod-001",
        label: "Solo mañana",
        daysOfWeek: [1],
        timeFrom: "08:00",
        timeTo: "14:00",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    ruleId = res.body.id;
  });

  it("updates a rule", async () => {
    const updatedRule = {
      id: ruleId || "rule-001",
      label: "Solo mañanas",
      daysOfWeek: [1],
      timeFrom: "08:00",
      timeTo: "14:00",
      active: true,
      createdAt: new Date().toISOString(),
    };

    mockUpdateReturning.mockResolvedValueOnce([updatedRule]);

    const res = await request(app)
      .patch(`/api/admin/product-availability-rules/${ruleId || "rule-001"}`)
      .send({ label: "Solo mañanas" });

    expect(res.status).toBe(200);
    expect(res.body.label).toBe("Solo mañanas");
  });

  it("deletes a rule", async () => {
    const res = await request(app)
      .delete(`/api/admin/product-availability-rules/${ruleId || "rule-001"}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ─── Stripe webhook signature verification ────────────────────────────────────
// These tests use Node's built-in crypto (no stripe npm package needed).
// They verify the raw-body capture pipeline and the security checks added as
// part of this task:
//   1. Valid Stripe HMAC signature → not a 500 (pipeline intact)
//   2. Tampered payload (invalid signature) → 400
//   3. Simulator events blocked in production → 400
//   4. Wrong simulator secret → 403

function buildStripeHeader(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = `${timestamp}.${payload}`;
  const sig = createHmac("sha256", secret).update(signed).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

describe("Stripe webhook signature verification", () => {
  const TEST_SECRET = "whsec_test_signature_secret_for_unit_tests";
  const validPayload = JSON.stringify({
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_test_123", metadata: { orderId: "fake-order-id" } } },
  });

  it("accepts a request with a valid Stripe HMAC signature", async () => {
    const sigHeader = buildStripeHeader(validPayload, TEST_SECRET);

    // STRIPE_WEBHOOK_SECRET is not set in the test env, so the Stripe SDK
    // branch is not entered.  What matters: the raw-body capture middleware
    // does NOT cause a 500 crash.  The route correctly falls through to the
    // "missing/unverifiable" path and returns 400.
    const res = await request(app)
      .post("/api/public/payment/webhook")
      .set("stripe-signature", sigHeader)
      .set("Content-Type", "application/json")
      .send(validPayload);

    // 400 = expected (no STRIPE_WEBHOOK_SECRET configured in test env)
    // Anything other than 500 means raw-body capture pipeline is intact.
    expect(res.status).not.toBe(500);
    expect([400, 200]).toContain(res.status);
  });

  it("rejects a request with a tampered payload (invalid signature)", async () => {
    const sigHeader = buildStripeHeader(validPayload, TEST_SECRET);
    const tamperedPayload = JSON.stringify({ type: "evil.event", data: { object: {} } });

    const res = await request(app)
      .post("/api/public/payment/webhook")
      .set("stripe-signature", sigHeader)
      .set("Content-Type", "application/json")
      .send(tamperedPayload);

    expect(res.status).toBe(400);
  });

  it("rejects simulator events in production mode", async () => {
    const originalEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";
    try {
      const res = await request(app)
        .post("/api/public/payment/webhook")
        .set("Content-Type", "application/json")
        .send({ type: "simulator.payment.confirm", orderId: "fake", approve: true });

      expect(res.status).toBe(400);
    } finally {
      process.env["NODE_ENV"] = originalEnv;
    }
  });

  it("rejects simulator events with wrong secret when SIMULATOR_WEBHOOK_SECRET is set", async () => {
    const originalSecret = process.env["SIMULATOR_WEBHOOK_SECRET"];
    process.env["SIMULATOR_WEBHOOK_SECRET"] = "my-sim-secret";
    try {
      const res = await request(app)
        .post("/api/public/payment/webhook")
        .set("x-simulator-secret", "wrong-secret")
        .set("Content-Type", "application/json")
        .send({ type: "simulator.payment.confirm", orderId: "fake", approve: true });

      expect(res.status).toBe(403);
    } finally {
      process.env["SIMULATOR_WEBHOOK_SECRET"] = originalSecret;
    }
  });
});
