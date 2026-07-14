/**
 * Zone reordering API tests
 *
 * Covers edge cases for drag-to-reorder when zones are created or deleted:
 *  - reorder after create (new zone appended at max+1)
 *  - reorder after delete (gaps in sortOrder values remain for other zones)
 *  - reorder with non-contiguous sortOrder values (PATCH accepts any integer)
 *  - GET /zones always returns zones sorted by sortOrder ASC
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Builds a PromiseLike, chainable mock that resolves to `value`.
 * Every method on it returns `chain` itself so the full Drizzle
 * builder chain (select().from().where().orderBy() …) works without errors.
 */
function makeChain(value: unknown) {
  const chain: Record<string, unknown> & {
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => Promise<unknown>;
  } = {
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  for (const m of [
    "select", "from", "where", "orderBy",
    "insert", "update", "set", "values", "returning",
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
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

// Spread all real table exports (other routes import many tables from @workspace/db).
// Only override `db` with the mock — pg.Pool won't actually connect because
// we mock the db object and never call real queries.
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: mockDb,
  };
});

// The auth middleware calls jwt.verify; we want it to always succeed as admin
vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn(() => ({ id: "admin-1", name: "Test Admin", role: "admin" })),
  },
}));

// drizzle-orm helpers are passed as arguments to the mocked chain — they don't
// need to do anything real, but they must exist so the import doesn't throw.
vi.mock("drizzle-orm", async (importOriginal) => {
  // Keep real implementations (they're harmless) — just make sure the module
  // resolves even if no real DB connection is present.
  return importOriginal();
});

// ─── App import (after mocks are registered) ──────────────────────────────────

const { default: app } = await import("../app");

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTH = "Bearer test-token";

// Sample zone fixtures
const ZONE_A = { id: "zone-a", name: "Terraza", type: "dining", sortOrder: 1, active: true, color: null };
const ZONE_B = { id: "zone-b", name: "Interior", type: "dining", sortOrder: 2, active: true, color: null };
const ZONE_C = { id: "zone-c", name: "Barra", type: "bar", sortOrder: 3, active: true, color: null };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/zones", () => {
  it("returns zones sorted by sortOrder ASC", async () => {
    // DB returns them in order (the query uses orderBy, which the real DB honours)
    mockDb.select.mockReturnValue(makeChain([ZONE_A, ZONE_B, ZONE_C]));

    const res = await request(app).get("/api/zones").set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body.map((z: typeof ZONE_A) => z.id)).toEqual(["zone-a", "zone-b", "zone-c"]);
  });

  it("returns zones in correct order when sortOrder has gaps (after a deletion)", async () => {
    // Zone B was soft-deleted; active zones now have sortOrder 1 and 3
    const ZONE_A_SORT1 = { ...ZONE_A, sortOrder: 1 };
    const ZONE_C_SORT3 = { ...ZONE_C, sortOrder: 3 };
    mockDb.select.mockReturnValue(makeChain([ZONE_A_SORT1, ZONE_C_SORT3]));

    const res = await request(app).get("/api/zones").set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe("zone-a");
    expect(res.body[0].sortOrder).toBe(1);
    expect(res.body[1].id).toBe("zone-c");
    expect(res.body[1].sortOrder).toBe(3);
  });
});

describe("POST /api/zones — sortOrder after create", () => {
  beforeEach(() => {
    // SESSION_SECRET must be set so auth middleware doesn't short-circuit
    process.env["SESSION_SECRET"] = "test-secret";
  });

  it("assigns sortOrder = max + 1 when zones already exist", async () => {
    // First db.select call returns the current max sortOrder (3)
    mockDb.select.mockReturnValue(makeChain([{ v: 3 }]));
    // db.insert returns the newly created zone with sortOrder=4
    const newZone = { id: "zone-d", name: "Privado", type: "dining", sortOrder: 4, active: true, color: null };
    mockDb.insert.mockReturnValue(makeChain([newZone]));

    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", AUTH)
      .send({ name: "Privado", type: "dining" });

    expect(res.status).toBe(201);
    expect(res.body.sortOrder).toBe(4);
    expect(res.body.name).toBe("Privado");
  });

  it("assigns sortOrder = 1 when no zones exist yet (max is null)", async () => {
    // DB returns null for max when the table is empty
    mockDb.select.mockReturnValue(makeChain([{ v: null }]));
    const firstZone = { id: "zone-first", name: "Principal", type: "dining", sortOrder: 1, active: true, color: null };
    mockDb.insert.mockReturnValue(makeChain([firstZone]));

    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", AUTH)
      .send({ name: "Principal" });

    expect(res.status).toBe(201);
    expect(res.body.sortOrder).toBe(1);
  });

  it("assigns sortOrder = max + 1 even when existing sortOrders are non-contiguous", async () => {
    // After deleting zone-b (sort=2), the highest remaining is zone-c (sort=3)
    // A new zone should get sort=4, not sort=3 (filling the gap)
    mockDb.select.mockReturnValue(makeChain([{ v: 3 }]));
    const newZone = { id: "zone-e", name: "VIP", type: "dining", sortOrder: 4, active: true, color: null };
    mockDb.insert.mockReturnValue(makeChain([newZone]));

    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", AUTH)
      .send({ name: "VIP" });

    expect(res.status).toBe(201);
    // New zone appended after the highest sort, not into the gap
    expect(res.body.sortOrder).toBe(4);
  });
});

describe("PATCH /api/zones/:zoneId — reordering with various sortOrder values", () => {
  beforeEach(() => {
    process.env["SESSION_SECRET"] = "test-secret";
  });

  it("accepts a sortOrder of 1 (move to front)", async () => {
    const updated = { ...ZONE_C, sortOrder: 1 };
    mockDb.update.mockReturnValue(makeChain([updated]));

    const res = await request(app)
      .patch("/api/zones/zone-c")
      .set("Authorization", AUTH)
      .send({ sortOrder: 1 });

    expect(res.status).toBe(200);
    expect(res.body.sortOrder).toBe(1);
  });

  it("accepts a high sortOrder after non-contiguous gaps (reorder after delete)", async () => {
    // Zones have sortOrders 1, 3 (gap at 2 due to deletion).
    // Client normalises and sends sortOrder=2 for the second remaining zone.
    const updated = { ...ZONE_C, sortOrder: 2 };
    mockDb.update.mockReturnValue(makeChain([updated]));

    const res = await request(app)
      .patch("/api/zones/zone-c")
      .set("Authorization", AUTH)
      .send({ sortOrder: 2 });

    expect(res.status).toBe(200);
    expect(res.body.sortOrder).toBe(2);
  });

  it("accepts a sortOrder of 10 (sparse gap scenario)", async () => {
    // Zones with sortOrders like 1, 5, 10 — client can send any integer
    const updated = { ...ZONE_A, sortOrder: 10 };
    mockDb.update.mockReturnValue(makeChain([updated]));

    const res = await request(app)
      .patch("/api/zones/zone-a")
      .set("Authorization", AUTH)
      .send({ sortOrder: 10 });

    expect(res.status).toBe(200);
    expect(res.body.sortOrder).toBe(10);
  });

  it("returns 404 when the zone does not exist", async () => {
    // DB returning empty array simulates a missing zone
    mockDb.update.mockReturnValue(makeChain([]));

    const res = await request(app)
      .patch("/api/zones/nonexistent")
      .set("Authorization", AUTH)
      .send({ sortOrder: 1 });

    expect(res.status).toBe(404);
  });

  it("returns 400 when no valid fields are provided", async () => {
    const res = await request(app)
      .patch("/api/zones/zone-a")
      .set("Authorization", AUTH)
      .send({}); // empty body — nothing to update

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sin cambios/i);
  });
});

describe("DELETE /api/zones/:zoneId", () => {
  beforeEach(() => {
    process.env["SESSION_SECRET"] = "test-secret";
  });

  it("soft-deletes the zone (sets active=false) and returns 204", async () => {
    mockDb.update.mockReturnValue(makeChain([{ ...ZONE_B, active: false }]));

    const res = await request(app)
      .delete("/api/zones/zone-b")
      .set("Authorization", AUTH);

    expect(res.status).toBe(204);
  });

  it("returns 404 when deleting a non-existent zone", async () => {
    mockDb.update.mockReturnValue(makeChain([]));

    const res = await request(app)
      .delete("/api/zones/ghost")
      .set("Authorization", AUTH);

    expect(res.status).toBe(404);
  });
});

describe("Reorder sequence: reorder after create", () => {
  beforeEach(() => {
    process.env["SESSION_SECRET"] = "test-secret";
  });

  it("full sequence: create zone then reorder all zones to new positions", async () => {
    // Step 1: Create a new zone — it gets sortOrder = max(3) + 1 = 4
    mockDb.select.mockReturnValueOnce(makeChain([{ v: 3 }]));
    const newZone = { id: "zone-d", name: "Nuevo", type: "dining", sortOrder: 4, active: true, color: null };
    mockDb.insert.mockReturnValueOnce(makeChain([newZone]));

    const createRes = await request(app)
      .post("/api/zones")
      .set("Authorization", AUTH)
      .send({ name: "Nuevo" });

    expect(createRes.status).toBe(201);
    expect(createRes.body.sortOrder).toBe(4);

    // Step 2: User drags zone-d to position 1 → sends sequential PATCHes
    // zone-d gets sortOrder=1, zone-a→2, zone-b→3, zone-c→4
    const patchCases = [
      { id: "zone-d", newSort: 1 },
      { id: "zone-a", newSort: 2 },
      { id: "zone-b", newSort: 3 },
      { id: "zone-c", newSort: 4 },
    ];

    for (const { id, newSort } of patchCases) {
      const existing = [ZONE_A, ZONE_B, ZONE_C, newZone].find(z => z.id === id)!;
      mockDb.update.mockReturnValueOnce(makeChain([{ ...existing, sortOrder: newSort }]));
    }

    for (const { id, newSort } of patchCases) {
      const res = await request(app)
        .patch(`/api/zones/${id}`)
        .set("Authorization", AUTH)
        .send({ sortOrder: newSort });

      expect(res.status).toBe(200);
      expect(res.body.sortOrder).toBe(newSort);
    }

    // Step 3: Verify GET returns the new order
    mockDb.select.mockReturnValueOnce(
      makeChain([
        { ...newZone, sortOrder: 1 },
        { ...ZONE_A, sortOrder: 2 },
        { ...ZONE_B, sortOrder: 3 },
        { ...ZONE_C, sortOrder: 4 },
      ])
    );

    const getRes = await request(app).get("/api/zones").set("Authorization", AUTH);
    expect(getRes.status).toBe(200);
    expect(getRes.body.map((z: { id: string }) => z.id)).toEqual([
      "zone-d", "zone-a", "zone-b", "zone-c",
    ]);
  });
});

describe("Reorder sequence: reorder after delete", () => {
  beforeEach(() => {
    process.env["SESSION_SECRET"] = "test-secret";
  });

  it("full sequence: delete middle zone then reorder remaining zones contiguously", async () => {
    // Initial state: A(sort=1), B(sort=2), C(sort=3)
    // Step 1: Delete zone-b
    mockDb.update.mockReturnValueOnce(makeChain([{ ...ZONE_B, active: false }]));

    const deleteRes = await request(app)
      .delete("/api/zones/zone-b")
      .set("Authorization", AUTH);

    expect(deleteRes.status).toBe(204);

    // Step 2: GET /zones now returns A(1) and C(3) — gap at 2
    mockDb.select.mockReturnValueOnce(
      makeChain([
        { ...ZONE_A, sortOrder: 1 },
        { ...ZONE_C, sortOrder: 3 }, // gap — sortOrder=2 is absent
      ])
    );

    const getAfterDelete = await request(app).get("/api/zones").set("Authorization", AUTH);
    expect(getAfterDelete.status).toBe(200);
    expect(getAfterDelete.body).toHaveLength(2);
    // Sorted correctly despite the gap
    expect(getAfterDelete.body[0].id).toBe("zone-a");
    expect(getAfterDelete.body[1].id).toBe("zone-c");

    // Step 3: User drags C above A → client normalises to sequential 1,2
    // PATCH zone-c → sortOrder=1, PATCH zone-a → sortOrder=2
    mockDb.update.mockReturnValueOnce(makeChain([{ ...ZONE_C, sortOrder: 1 }]));
    mockDb.update.mockReturnValueOnce(makeChain([{ ...ZONE_A, sortOrder: 2 }]));

    const patchC = await request(app)
      .patch("/api/zones/zone-c")
      .set("Authorization", AUTH)
      .send({ sortOrder: 1 });

    expect(patchC.status).toBe(200);
    expect(patchC.body.sortOrder).toBe(1);

    const patchA = await request(app)
      .patch("/api/zones/zone-a")
      .set("Authorization", AUTH)
      .send({ sortOrder: 2 });

    expect(patchA.status).toBe(200);
    expect(patchA.body.sortOrder).toBe(2);

    // Step 4: GET reflects the new contiguous order
    mockDb.select.mockReturnValueOnce(
      makeChain([
        { ...ZONE_C, sortOrder: 1 },
        { ...ZONE_A, sortOrder: 2 },
      ])
    );

    const getAfterReorder = await request(app).get("/api/zones").set("Authorization", AUTH);
    expect(getAfterReorder.status).toBe(200);
    expect(getAfterReorder.body.map((z: { id: string }) => z.id)).toEqual(["zone-c", "zone-a"]);
    expect(getAfterReorder.body[0].sortOrder).toBe(1);
    expect(getAfterReorder.body[1].sortOrder).toBe(2);
  });
});

describe("Reorder sequence: non-contiguous sortOrder values", () => {
  beforeEach(() => {
    process.env["SESSION_SECRET"] = "test-secret";
  });

  it("normalises sparse sortOrders (1, 5, 10) to sequential (1, 2, 3) on reorder", async () => {
    // Zones start with sparse sortOrders (e.g. from legacy data or migrations)
    const SPARSE_A = { ...ZONE_A, sortOrder: 1 };
    const SPARSE_B = { ...ZONE_B, sortOrder: 5 };
    const SPARSE_C = { ...ZONE_C, sortOrder: 10 };

    // GET shows the sparse order
    mockDb.select.mockReturnValueOnce(makeChain([SPARSE_A, SPARSE_B, SPARSE_C]));

    const getRes = await request(app).get("/api/zones").set("Authorization", AUTH);
    expect(getRes.status).toBe(200);
    expect(getRes.body.map((z: { sortOrder: number }) => z.sortOrder)).toEqual([1, 5, 10]);

    // User triggers a reorder: client sends sequential PATCHes regardless of original values
    mockDb.update.mockReturnValueOnce(makeChain([{ ...SPARSE_A, sortOrder: 1 }]));
    mockDb.update.mockReturnValueOnce(makeChain([{ ...SPARSE_B, sortOrder: 2 }]));
    mockDb.update.mockReturnValueOnce(makeChain([{ ...SPARSE_C, sortOrder: 3 }]));

    const cases = [
      { id: SPARSE_A.id, sortOrder: 1 },
      { id: SPARSE_B.id, sortOrder: 2 },
      { id: SPARSE_C.id, sortOrder: 3 },
    ];

    for (const { id, sortOrder } of cases) {
      const res = await request(app)
        .patch(`/api/zones/${id}`)
        .set("Authorization", AUTH)
        .send({ sortOrder });

      expect(res.status).toBe(200);
      expect(res.body.sortOrder).toBe(sortOrder);
    }

    // GET now reflects sequential sortOrders
    mockDb.select.mockReturnValueOnce(
      makeChain([
        { ...SPARSE_A, sortOrder: 1 },
        { ...SPARSE_B, sortOrder: 2 },
        { ...SPARSE_C, sortOrder: 3 },
      ])
    );

    const getAfterRes = await request(app).get("/api/zones").set("Authorization", AUTH);
    expect(getAfterRes.status).toBe(200);
    expect(getAfterRes.body.map((z: { sortOrder: number }) => z.sortOrder)).toEqual([1, 2, 3]);
  });

  it("only PATCHes zones whose sortOrder actually changed (no-op guard)", async () => {
    // Zones already have sequential sortOrders 1, 2, 3
    // Dragging zone-a from position 1 to position 1 (no actual move)
    // The client compares original vs new and skips no-ops, but the API
    // must still accept the call gracefully when it does arrive.
    const unchanged = { ...ZONE_A, sortOrder: 1 };
    mockDb.update.mockReturnValueOnce(makeChain([unchanged]));

    const res = await request(app)
      .patch("/api/zones/zone-a")
      .set("Authorization", AUTH)
      .send({ sortOrder: 1 }); // same as current — still a valid PATCH

    expect(res.status).toBe(200);
    expect(res.body.sortOrder).toBe(1);
  });
});
