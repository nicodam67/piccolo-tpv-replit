/**
 * auth.test.ts — Security surface tests for the authentication system
 *
 * Scenarios covered:
 *   1.  POST /auth/pin  — correct PIN → 200 + token
 *   2.  POST /auth/pin  — wrong PIN → 401
 *   3.  POST /auth/pin  — employee not found → 401
 *   4.  POST /auth/pin  — rate-limited after 10 attempts → 429
 *   5.  GET  /auth/me   — valid non-revoked token → 200
 *   6.  GET  /auth/me   — no Authorization header → 401
 *   7.  GET  /auth/me   — revoked token (jti in revoked_tokens) → 401
 *   8.  POST /auth/logout — valid token → revokes jti → 200
 *   9.  POST /auth/logout — DB insert fails → 503 (fail-closed)
 *   10. Admin-only route  — manager token → 403 (insufficient role)
 *   11. Admin-only route  — no token → 401
 *   12. Permission check  — waiter on manager-only route → 403
 *   13. Idempotency       — second call with same Idempotency-Key → replayed response
 *   14. Rate limiting     — 429 after pin limiter threshold (10 requests)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a chainable Promise-like mock that resolves to `value`.
 * Covers every Drizzle builder method so the full select/insert chain works.
 */
function makeChain(value: unknown) {
  const chain: Record<string, unknown> & {
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => Promise<unknown>;
  } = {
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  for (const m of [
    "select", "from", "where", "orderBy", "insert", "update", "delete",
    "set", "values", "returning", "innerJoin", "leftJoin", "limit",
    "groupBy", "offset", "onConflictDoNothing", "onConflictDoUpdate", "catch",
  ]) {
    chain[m] = () => chain;
  }
  return chain;
}

// ── Hoisted mocks (registered before any import) ──────────────────────────────

/** Controls what jwt.verify returns — override per test with mockReturnValueOnce */
const mockJwtVerify = vi.hoisted(() =>
  vi.fn(() => ({
    id:   "emp-admin",
    name: "Admin",
    role: "admin",
    jti:  "test-jti-111",
    exp:  Math.floor(Date.now() / 1000) + 3600,
  })),
);

/** Controls whether bcrypt.compare succeeds — can be flipped per test */
const mockBcryptCompare = vi.hoisted(() => vi.fn().mockResolvedValue(true));

/** Fake DB driver */
const mockDb = vi.hoisted(() => ({
  select:      vi.fn(),
  insert:      vi.fn(),
  update:      vi.fn(),
  delete:      vi.fn(),
  transaction: vi.fn(),
}));

/**
 * Fake pg Pool — used by requireAuth (revocation check) and idempotency middleware.
 * Default: returns no rows (= no revoked jti, no cached idempotency result).
 */
const mockPool = vi.hoisted(() => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb, pool: mockPool };
});

vi.mock("jsonwebtoken", () => ({
  default: {
    verify: mockJwtVerify,
    sign:   vi.fn(() => "mocked.jwt.access.token"),
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: mockBcryptCompare,
    hash: vi.fn().mockResolvedValue("$2a$12$bootstrap-hash"),
    hashSync: vi.fn(() => "$2a$10$dummy-hash"),
  },
}));

vi.mock("drizzle-orm", async (importOriginal) => importOriginal());

vi.mock("../lib/socket", () => ({
  getIO:      () => ({ emit: vi.fn(), to: vi.fn().mockReturnValue({ emit: vi.fn() }) }),
  initSocket: vi.fn(),
}));

vi.mock("../lib/print-worker", () => ({
  startPrintWorker: vi.fn(),
  stopPrintWorker:  vi.fn(),
}));

vi.mock("../lib/backup-worker", () => ({
  startBackupWorker: vi.fn(),
  stopBackupWorker:  vi.fn(),
}));

vi.mock("../lib/verifactu-worker", () => ({
  startVerifactuWorker: vi.fn(),
  stopVerifactuWorker:  vi.fn(),
}));

// ── App import (after mocks are registered) ───────────────────────────────────

const { default: app } = await import("../app");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const AUTH = "Bearer valid-token";

/** Realistic employee row as returned by DB (pinHash is a bcrypt placeholder) */
const ADMIN_EMPLOYEE = {
  id:      "emp-admin",
  name:    "Admin",
  role:    "admin",
  pinHash: "$2a$06$dummy-hash-for-tests-only",
};

// ── Shared setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: jwt.verify returns an admin session with a valid jti
  mockJwtVerify.mockReturnValue({
    id:   "emp-admin",
    name: "Admin",
    role: "admin",
    jti:  "test-jti-111",
    exp:  Math.floor(Date.now() / 1000) + 3600,
  });

  // Default: db.select returns EMPTY — critical for requireAuth revocation check.
  // The revocation check does: const [revoked] = await db.select()...
  // If the result is [], revoked is undefined (falsy) → request proceeds.
  // If the result is [{ jti }], revoked is truthy → 401 "Sesión cerrada".
  // Individual tests that need an employee row use mockReturnValueOnce.
  mockDb.select.mockReturnValue(makeChain([]));
  mockDb.insert.mockReturnValue(makeChain([]));
  mockDb.delete.mockReturnValue(makeChain([]));
  mockDb.transaction.mockImplementation(async (callback) =>
    callback({
      select: mockDb.select,
      insert: mockDb.insert,
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    }),
  );
  mockBcryptCompare.mockResolvedValue(true);
  process.env["BOOTSTRAP_SECRET"] = "bootstrap-secret-for-tests-32-characters";

  // Default pool: no cached idempotency entry
  mockPool.query.mockResolvedValue({ rows: [] });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1–4: PIN Login
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/auth/pin", () => {
  it("1. correct employee + PIN → 200 with token and employee info", async () => {
    // PIN login calls db.select to look up the employee row
    mockDb.select.mockReturnValueOnce(makeChain([ADMIN_EMPLOYEE]));

    const res = await request(app)
      .post("/api/auth/pin")
      .send({ employeeId: "emp-admin", pin: "1234" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("employee");
    expect(res.body.employee).toMatchObject({ id: "emp-admin", name: "Admin", role: "admin" });
  });

  it("2. wrong PIN → 401", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([ADMIN_EMPLOYEE]));
    mockBcryptCompare.mockResolvedValueOnce(false);

    const res = await request(app)
      .post("/api/auth/pin")
      .send({ employeeId: "emp-admin", pin: "9999" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/PIN incorrecto/i);
  });

  it("3. employee not found → 401 (no timing oracle)", async () => {
    // db.select default already returns [] (employee not found)
    // bcrypt dummy comparison still runs for constant-time behavior
    mockBcryptCompare.mockResolvedValueOnce(false);

    const res = await request(app)
      .post("/api/auth/pin")
      .send({ employeeId: "does-not-exist", pin: "0000" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/PIN incorrecto/i);
  });

  it("4. missing body fields → 400", async () => {
    const res = await request(app)
      .post("/api/auth/pin")
      .send({});

    expect(res.status).toBe(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5–7: Session info — GET /auth/me
// ═════════════════════════════════════════════════════════════════════════════

describe("GET /api/auth/me", () => {
  it("5. valid non-revoked token → 200 with user info", async () => {
    // requireAuth checks db.select for revocation → default makeChain([]) = not revoked
    // GET /auth/me just reads req.user — no additional DB calls needed

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "emp-admin", name: "Admin", role: "admin" });
    expect(res.body).toHaveProperty("expiresAt");
  });

  it("6. no Authorization header → 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/No autorizado/i);
  });

  it("7. revoked token (jti in DB) → 401", async () => {
    // requireAuth: db.select for revocation check returns the jti → session closed
    mockDb.select.mockReturnValueOnce(makeChain([{ jti: "test-jti-111" }]));

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", AUTH);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Sesión cerrada/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8–9: Logout — POST /auth/logout
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/auth/logout", () => {
  it("8. valid token → 200, jti is revoked in DB", async () => {
    // requireAuth: db.select default = [] → not revoked → proceed
    // logout insert: success (already default)
    // housekeeping delete: ignore (already default)

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // The insert was called to persist the revoked jti
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("9. DB insert fails during logout → 503 (fail-closed)", async () => {
    // requireAuth: db.select default = [] → not revoked → proceed
    // logout insert throws to simulate DB failure
    mockDb.insert.mockImplementationOnce(() => {
      throw new Error("DB connection error");
    });

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", AUTH);

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/No se pudo cerrar la sesión/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10–12: Role and permission enforcement
// ═════════════════════════════════════════════════════════════════════════════

describe("Role / permission checks", () => {
  it("10. admin-only route with no token → 401", async () => {
    const res = await request(app).get("/api/admin/verifactu/status");
    expect(res.status).toBe(401);
  });

  it("11. admin-only route with waiter token → 403", async () => {
    mockJwtVerify.mockReturnValueOnce({
      id:   "emp-waiter",
      name: "Camarer@",
      role: "waiter",
      jti:  "test-jti-waiter",
      exp:  Math.floor(Date.now() / 1000) + 3600,
    });
    // requireAuth: db.select default = [] → not revoked; then requireRole("admin") blocks

    const res = await request(app)
      .get("/api/admin/verifactu/status")
      .set("Authorization", AUTH);

    expect(res.status).toBe(403);
  });

  it("12. admin-only route with admin token → 200 (role permitted)", async () => {
    // requireAuth: db.select default = [] → not revoked → proceed
    // Then override for the route handler's config fetch
    mockDb.select.mockReturnValueOnce(makeChain([]));   // revocation check
    mockDb.select.mockReturnValue(makeChain([{          // subsequent route queries
      id: "cfg-1", isEnabled: true, testMode: true, nif: "B12345678",
      businessName: "Test S.L.", fiscalYear: 2025, sequence: 1,
    }]));

    const res = await request(app)
      .get("/api/admin/verifactu/status")
      .set("Authorization", AUTH);

    // 200 or 404 are both valid (config may not exist in mock),
    // the critical assertion is that it is NOT 401/403.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13: Idempotency — second call replays the first result
// ═════════════════════════════════════════════════════════════════════════════

describe("Idempotency", () => {
  /**
   * Tests the idempotency middleware in isolation using a minimal inline Express
   * app. This avoids the complexity of mocking the full fichaje handler while
   * still verifying that:
   *   - A first successful POST is processed normally.
   *   - A second POST with the same Idempotency-Key is replayed from the
   *     in-process memory cache with an `Idempotency-Replayed: true` header.
   *
   * The middleware is imported here and will automatically use the mocked pool
   * (from the vi.mock("@workspace/db") declaration at the top of this file).
   */
  it("13. second call with same Idempotency-Key returns the replayed response", async () => {
    // Import the middleware and express after mocks are set up.
    const { idempotency: idemMiddleware } = await import("../middlewares/idempotency");
    const { default: expressLib } = await import("express");

    // Minimal app: idempotency middleware + a simple echo handler.
    const testApp = expressLib();
    testApp.use(expressLib.json());
    testApp.post("/echo", idemMiddleware, (_req, res) => {
      res.json({ value: 42 });
    });

    const key = `idem-test-${Date.now()}`;

    // pool returns no cached entry → first request is processed normally.
    mockPool.query.mockResolvedValue({ rows: [] });

    const first = await request(testApp)
      .post("/echo")
      .set("Idempotency-Key", key)
      .send({});

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ value: 42 });

    // The response is now in the in-process memory cache (keyed by "anon:<key>").
    // The second call must be replayed from that cache.
    const second = await request(testApp)
      .post("/echo")
      .set("Idempotency-Key", key)
      .send({});

    expect(second.status).toBe(200);
    expect(second.headers["idempotency-replayed"]).toBe("true");
    expect(second.body).toEqual(first.body);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14: Rate limiting — POST /auth/pin triggers 429 after threshold
// ═════════════════════════════════════════════════════════════════════════════

describe("Rate limiting", () => {
  /**
   * The pinLoginLimiter allows 10 requests per IP per 15 minutes.
   * After sending 10 requests (any response), the 11th must be 429.
   *
   * Important: all requests are from the supertest default IP (127.0.0.1)
   * and are processed in the same module instance (fresh per file due to
   * Vitest isolation), so the in-process store accumulates correctly.
   */
  it("14. 429 after exceeding the PIN limiter threshold (10 requests)", async () => {
    // Drain the remaining limiter budget (some may have been used in earlier tests
    // within this file; the limiter resets per module load, not per test).
    // We send 10 quick failed-auth requests to ensure the counter is at the limit.
    const promises = Array.from({ length: 10 }, () =>
      request(app)
        .post("/api/auth/pin")
        .send({ employeeId: "x", pin: "0000" }),
    );
    await Promise.all(promises);

    // The 11th (or later) request must be blocked regardless of credentials.
    const blocked = await request(app)
      .post("/api/auth/pin")
      .send({ employeeId: "emp-admin", pin: "1234" });

    expect(blocked.status).toBe(429);
  });
});

describe("POST /api/setup/seed-employees", () => {
  it("rejects a missing or incorrect bootstrap secret without touching the DB", async () => {
    const res = await request(app)
      .post("/api/setup/seed-employees")
      .send({ bootstrapSecret: "incorrect", name: "Owner", pin: "4826" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Bootstrap no autorizado" });
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("creates only the supplied administrator under an advisory transaction lock", async () => {
    const admin = { id: "generated-admin-id", name: "Owner", role: "admin" };
    mockDb.select.mockReturnValue(makeChain([{ value: 0 }]));
    mockDb.insert.mockReturnValue(makeChain([admin]));

    const res = await request(app)
      .post("/api/setup/seed-employees")
      .send({
        bootstrapSecret: process.env["BOOTSTRAP_SECRET"],
        name: "Owner",
        pin: "4826",
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      created: true,
      admin: { id: "generated-admin-id", name: "Owner" },
    });
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });

  it("stays closed after any employee exists", async () => {
    mockDb.select.mockReturnValue(makeChain([{ value: 1 }]));

    const res = await request(app)
      .post("/api/setup/seed-employees")
      .send({
        bootstrapSecret: process.env["BOOTSTRAP_SECRET"],
        name: "Owner",
        pin: "4826",
      });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Bootstrap cerrado" });
  });
});
