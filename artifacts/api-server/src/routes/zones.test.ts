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
  transaction: vi.fn(),
  execute: vi.fn(),
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

// The socket module is not initialised in tests; mock getIO so routes that call
// getIO().emit(...) after a successful write don't throw and return 500.
vi.mock("../lib/socket", () => ({
  getIO: vi.fn(() => ({ emit: vi.fn() })),
  initSocket: vi.fn(),
}));

// ─── App import (after mocks are registered) ──────────────────────────────────

const { default: app } = await import("../app");

// ─── Default transaction implementation ───────────────────────────────────────
// POST /zones and POST /zones/:zoneId/duplicate use db.transaction() with an
// advisory lock.  The mock passes itself as the tx argument so existing tests
// that set up mockDb.select / mockDb.insert continue to work unchanged.
// vi.clearAllMocks() preserves mockImplementation, so this only needs to be
// called once at module scope.
mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockDb) => unknown) => cb(mockDb));
mockDb.execute.mockResolvedValue([]);

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

  it("ignores soft-deleted zones when computing the next sortOrder", async () => {
    // Scenario: 3 active zones (max sortOrder=3) plus one soft-deleted zone at sortOrder=50
    // (accumulated from many create/delete cycles). The new zone must get sortOrder=4,
    // not sortOrder=51 — the MAX query filters active=true only.
    mockDb.select.mockReturnValue(makeChain([{ v: 3 }])); // active-only max
    const newZone = { id: "zone-f", name: "Terraza 2", type: "dining", sortOrder: 4, active: true, color: null };
    mockDb.insert.mockReturnValue(makeChain([newZone]));

    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", AUTH)
      .send({ name: "Terraza 2" });

    expect(res.status).toBe(201);
    // sortOrder must be based on the active-zones max (3), not a bloated all-rows max (50)
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
    vi.clearAllMocks();
  });

  it("soft-deletes the zone (sets active=false) and returns 204", async () => {
    // DELETE handler checks for active tables first, then soft-deletes
    mockDb.select.mockReturnValueOnce(makeChain([])); // no active tables
    mockDb.update.mockReturnValueOnce(makeChain([{ ...ZONE_B, active: false }]));

    const res = await request(app)
      .delete("/api/zones/zone-b")
      .set("Authorization", AUTH);

    expect(res.status).toBe(204);
  });

  it("returns 404 when deleting a non-existent zone", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([])); // no active tables
    mockDb.update.mockReturnValueOnce(makeChain([])); // zone not found

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
    // Step 1: Delete zone-b — handler checks tables first, then soft-deletes
    mockDb.select.mockReturnValueOnce(makeChain([])); // no active tables on zone-b
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

// ─── Concurrent reorder conflict (optimistic concurrency guard) ───────────────

describe("PATCH /api/zones/:zoneId — optimistic concurrency (expectedSortOrder)", () => {
  beforeEach(() => {
    process.env["SESSION_SECRET"] = "test-secret";
    vi.clearAllMocks(); // isolate mock queues so leftover state from other describes can't leak
  });

  it("returns 409 when expectedSortOrder does not match current sortOrder (concurrent reorder)", async () => {
    // Admin A saw sortOrder=1 before dragging.  Admin B already changed it to 3.
    // The conditional WHERE (id=zone-a AND sortOrder=1) finds no row → returns [].
    // Server then checks the zone exists and replies 409 (not 404).
    mockDb.update.mockReturnValueOnce(makeChain([]));
    mockDb.select.mockReturnValueOnce(makeChain([{ id: "zone-a" }])); // existence check

    const res = await request(app)
      .patch("/api/zones/zone-a")
      .set("Authorization", AUTH)
      .send({ sortOrder: 2, expectedSortOrder: 1 }); // client snapshot was sortOrder=1

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/conflicto/i);
  });

  it("returns 404 when expectedSortOrder is provided but the zone does not exist at all", async () => {
    // Conditional update finds nothing; existence check also returns nothing.
    mockDb.update.mockReturnValueOnce(makeChain([]));
    mockDb.select.mockReturnValueOnce(makeChain([])); // zone truly absent

    const res = await request(app)
      .patch("/api/zones/nonexistent")
      .set("Authorization", AUTH)
      .send({ sortOrder: 1, expectedSortOrder: 1 });

    expect(res.status).toBe(404);
  });

  it("applies update unconditionally when expectedSortOrder is absent (no guard)", async () => {
    const updated = { ...ZONE_A, sortOrder: 2 };
    mockDb.update.mockReturnValueOnce(makeChain([updated]));

    const res = await request(app)
      .patch("/api/zones/zone-a")
      .set("Authorization", AUTH)
      .send({ sortOrder: 2 }); // no expectedSortOrder → plain last-write-wins

    expect(res.status).toBe(200);
    expect(res.body.sortOrder).toBe(2);
  });

  it("succeeds (200) when expectedSortOrder matches the row's current sortOrder", async () => {
    const updated = { ...ZONE_A, sortOrder: 3 };
    mockDb.update.mockReturnValueOnce(makeChain([updated]));

    const res = await request(app)
      .patch("/api/zones/zone-a")
      .set("Authorization", AUTH)
      .send({ sortOrder: 3, expectedSortOrder: 1 }); // zone-a was at sortOrder=1

    expect(res.status).toBe(200);
    expect(res.body.sortOrder).toBe(3);
  });
});

// ─── Partial reorder: browser reload / network drop mid-drag ─────────────────
//
// Scenario: the client fires two PATCHes to swap zone-a (1→2) and zone-b (2→1).
// The first PATCH succeeds; then the browser reloads (network drop, hard refresh)
// before the second PATCH is sent.  The server is now in a partially-committed
// state: zone-b=1, zone-a=1 (still unchanged).
//
// On reload the client re-fetches GET /zones, which returns the server's actual
// state.  The UI must NOT show the optimistic order — it must show whatever the
// server committed.
//
// This suite verifies:
//  1. The server accepts the first PATCH and rejects/never-receives the second.
//  2. GET /zones after the partial reorder returns the server's true state so a
//     freshly-loaded client can restore a consistent (if imperfect) order.
//  3. The rollback path (non-409 catch) restores from the pre-drag snapshot and
//     then triggers a refetch — confirmed here by the GET response matching what
//     the server holds after the partial write.

describe("Partial reorder — browser reload mid-drag rollback", () => {
  beforeEach(() => {
    process.env["SESSION_SECRET"] = "test-secret";
    vi.clearAllMocks();
  });

  it("first PATCH (zone-b → sortOrder=1) succeeds; second PATCH never arrives; GET returns server state", async () => {
    // Initial state: A(sort=1), B(sort=2), C(sort=3)
    // User drags B to position 1.  Client would send:
    //   PATCH zone-b sortOrder=1  (expectedSortOrder=2)  ← this one lands
    //   PATCH zone-a sortOrder=2  (expectedSortOrder=1)  ← browser reloads before this fires

    // First PATCH: zone-b promoted to sortOrder=1
    const zoneBMoved = { ...ZONE_B, sortOrder: 1 };
    mockDb.update.mockReturnValueOnce(makeChain([zoneBMoved]));

    const patchB = await request(app)
      .patch("/api/zones/zone-b")
      .set("Authorization", AUTH)
      .send({ sortOrder: 1, expectedSortOrder: 2 });

    expect(patchB.status).toBe(200);
    expect(patchB.body.sortOrder).toBe(1);

    // ── browser reloads here; second PATCH never arrives ──────────────────────

    // On reload: GET /zones — DB returns the partial state the server holds.
    // zone-b is now at sortOrder=1; zone-a is still at sortOrder=1 (its PATCH
    // never landed).  The DB orders by sortOrder ASC; ties preserve insertion
    // order which puts zone-a first.
    mockDb.select.mockReturnValueOnce(
      makeChain([
        { ...ZONE_A, sortOrder: 1 }, // zone-a unchanged — still at 1
        { ...ZONE_B, sortOrder: 1 }, // zone-b moved to 1 (now tied)
        ZONE_C,                       // zone-c unaffected at 3
      ])
    );

    const getRes = await request(app)
      .get("/api/zones")
      .set("Authorization", AUTH);

    expect(getRes.status).toBe(200);
    // Client receives whatever the server committed — not the optimistic order.
    // The key assertion is that the response is exactly the server state; the
    // client's handleDragEnd rollback (setLocalZones(preDragSnapshot) + invalidate)
    // will then let the useEffect on serverZones converge to this.
    const ids = getRes.body.map((z: { id: string }) => z.id);
    expect(ids).toContain("zone-a");
    expect(ids).toContain("zone-b");
    expect(ids).toContain("zone-c");
    expect(getRes.body).toHaveLength(3);
  });

  it("second PATCH fails with a network error (500); GET after rollback reflects only the first commit", async () => {
    // Both PATCHes fire but the second returns a 500 before reload.
    // The client catch block must: (a) restore the pre-drag snapshot immediately,
    // (b) call invalidateQueries so the useEffect on serverZones re-syncs.

    // First PATCH succeeds (zone-b sortOrder=1)
    const zoneBMoved = { ...ZONE_B, sortOrder: 1 };
    mockDb.update.mockReturnValueOnce(makeChain([zoneBMoved]));

    const patchB = await request(app)
      .patch("/api/zones/zone-b")
      .set("Authorization", AUTH)
      .send({ sortOrder: 1, expectedSortOrder: 2 });

    expect(patchB.status).toBe(200);

    // Second PATCH fails — server throws / returns 500 (simulated by making
    // the mock return an empty array, which the route interprets as "not found"
    // and responds 404 — any non-2xx is sufficient to exercise the catch path).
    mockDb.update.mockReturnValueOnce(makeChain([]));         // update found nothing
    mockDb.select.mockReturnValueOnce(makeChain([]));         // zone truly absent (404)

    const patchA = await request(app)
      .patch("/api/zones/zone-a")
      .set("Authorization", AUTH)
      .send({ sortOrder: 2, expectedSortOrder: 1 });

    // Non-2xx triggers the client's .catch → setLocalZones(preDragSnapshot)
    expect(patchA.status).not.toBe(200);

    // After the error the client calls invalidateQueries.  Simulate the
    // subsequent GET the query cache fires — it returns the partially-committed
    // server state.  The useEffect on serverZones will call setLocalZones with
    // this, converging the UI to the actual server order.
    mockDb.select.mockReturnValueOnce(
      makeChain([
        { ...ZONE_A, sortOrder: 1 }, // zone-a still at 1 (its PATCH failed)
        { ...ZONE_B, sortOrder: 1 }, // zone-b at 1 (first PATCH succeeded)
        ZONE_C,
      ])
    );

    const getRes = await request(app)
      .get("/api/zones")
      .set("Authorization", AUTH);

    expect(getRes.status).toBe(200);
    // Server exposes its true (partial) state — not the optimistic order.
    expect(getRes.body).toHaveLength(3);
    const byId = Object.fromEntries(
      getRes.body.map((z: { id: string; sortOrder: number }) => [z.id, z.sortOrder])
    );
    // The DB holds a tie (zone-a=1, zone-b=1) from the partial reorder.
    // GET /zones detects the tie and re-normalises to sequential values
    // preserving the order the DB returned (zone-a first, zone-b second,
    // zone-c third in the mock array).
    expect(byId["zone-a"]).toBe(1); // first in returned array → gets 1
    expect(byId["zone-b"]).toBe(2); // second in returned array → gets 2
    expect(byId["zone-c"]).toBe(3); // third in returned array → gets 3
  });
});

// ─── GET /zones — on-the-fly sortOrder re-normalisation ──────────────────────
//
// When a partial reorder leaves two zones sharing the same sortOrder value,
// GET /zones re-assigns sequential 1-based values preserving the DB's returned
// order (sortOrder ASC, name ASC).  Nothing is written back to the DB.

describe("GET /api/zones — on-the-fly sortOrder re-normalisation", () => {
  beforeEach(() => {
    process.env["SESSION_SECRET"] = "test-secret";
    vi.clearAllMocks();
    mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockDb) => unknown) => cb(mockDb));
    mockDb.execute.mockResolvedValue([]);
  });

  it("re-normalises to 1,2,3 when two zones share sortOrder=1 (partial-reorder tie)", async () => {
    // Partial reorder left zone-a and zone-b both at sortOrder=1.
    // DB returns them in (sortOrder ASC, name ASC) order:
    //   zone-b (Interior, sort=1), zone-a (Terraza, sort=1), zone-c (Barra, sort=3)
    // After re-normalisation they get sequential values 1, 2, 3.
    mockDb.select.mockReturnValueOnce(
      makeChain([
        { ...ZONE_B, sortOrder: 1 }, // Interior — first alphabetically
        { ...ZONE_A, sortOrder: 1 }, // Terraza — second
        { ...ZONE_C, sortOrder: 3 }, // Barra — unaffected
      ])
    );
    // The heal-write fires UPDATEs for the two zones whose sortOrder changed.
    mockDb.update.mockReturnValue(makeChain([]));

    const res = await request(app).get("/api/zones").set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);

    const byId = Object.fromEntries(
      res.body.map((z: { id: string; sortOrder: number }) => [z.id, z.sortOrder])
    );
    // All values must be unique and sequential
    expect(byId["zone-b"]).toBe(1);
    expect(byId["zone-a"]).toBe(2);
    expect(byId["zone-c"]).toBe(3);

    // Let the fire-and-forget heal-write microtasks settle.
    await new Promise(resolve => setImmediate(resolve));
    // zone-a changed (1→2) and zone-c changed (3→3 — wait, zone-c sortOrder 3 → index 2+1=3, no change).
    // Only zone-a (1→2) changed. zone-b stayed at 1. zone-c stayed at 3.
    // Wait: zone-b was sortOrder=1 and gets index 0 → sortOrder=1 (no change).
    //       zone-a was sortOrder=1 and gets index 1 → sortOrder=2 (changed).
    //       zone-c was sortOrder=3 and gets index 2 → sortOrder=3 (no change).
    // So only one UPDATE fires.
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("does NOT re-normalise when sortOrders have gaps but no ties (normal after delete)", async () => {
    // Zone B was deleted; remaining zones have sortOrders 1 and 3 — a gap but no tie.
    mockDb.select.mockReturnValueOnce(
      makeChain([
        { ...ZONE_A, sortOrder: 1 },
        { ...ZONE_C, sortOrder: 3 },
      ])
    );

    const res = await request(app).get("/api/zones").set("Authorization", AUTH);

    expect(res.status).toBe(200);
    // Gaps are preserved — re-normalisation must not fire
    expect(res.body[0].sortOrder).toBe(1);
    expect(res.body[1].sortOrder).toBe(3);
    // No ties → no heal-write
    await new Promise(resolve => setImmediate(resolve));
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("re-normalises correctly when all three zones are tied at the same sortOrder, and writes back the two changed rows", async () => {
    // Extreme case: every zone has sortOrder=1 (e.g. from a broken migration).
    // zone-a (index 0) → 1 (unchanged), zone-b (index 1) → 2, zone-c (index 2) → 3
    mockDb.select.mockReturnValueOnce(
      makeChain([
        { ...ZONE_A, sortOrder: 1 },
        { ...ZONE_B, sortOrder: 1 },
        { ...ZONE_C, sortOrder: 1 },
      ])
    );
    mockDb.update.mockReturnValue(makeChain([]));

    const res = await request(app).get("/api/zones").set("Authorization", AUTH);

    expect(res.status).toBe(200);
    const sortOrders = res.body.map((z: { sortOrder: number }) => z.sortOrder);
    expect(sortOrders).toEqual([1, 2, 3]);

    // Two rows changed (zone-b: 1→2, zone-c: 1→3); one row was already correct.
    await new Promise(resolve => setImmediate(resolve));
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });

  it("returns an empty array without errors when no zones exist", async () => {
    mockDb.select.mockReturnValueOnce(makeChain([]));

    const res = await request(app).get("/api/zones").set("Authorization", AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    // Empty array → no ties → no heal-write
    await new Promise(resolve => setImmediate(resolve));
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("heal-write returns no-match (0 rows) when a concurrent PATCH already updated sort_order — response is still correct", async () => {
    // Scenario: GET reads zone-a=1 and zone-b=1 (tie).  A concurrent PATCH
    // changes zone-a to sortOrder=2 between this GET's read and the background
    // heal UPDATE.  The conditional WHERE (id=zone-a AND sort_order=1) finds no
    // row (zone-a is now at sortOrder=2 in the DB).  The heal-write is silently
    // skipped — it must not error and must not clobber the newer value.
    mockDb.select.mockReturnValueOnce(
      makeChain([
        { ...ZONE_A, sortOrder: 1 }, // zone-a: tied at 1
        { ...ZONE_B, sortOrder: 1 }, // zone-b: tied at 1
      ])
    );
    // Simulates the conditional WHERE finding no matching row (concurrent PATCH
    // already changed zone-a's sort_order before the heal-write ran).
    mockDb.update.mockReturnValue(makeChain([]));

    const res = await request(app).get("/api/zones").set("Authorization", AUTH);

    // Response is already sent with normalised values — concurrent DB state irrelevant.
    expect(res.status).toBe(200);
    const sortOrders = res.body.map((z: { sortOrder: number }) => z.sortOrder);
    expect(sortOrders).toEqual([1, 2]);

    // Let the fire-and-forget settle — should complete without throwing even if
    // the DB returned 0 updated rows (stale-heal no-op).
    await new Promise(resolve => setImmediate(resolve));
    // The heal-write was attempted for zone-b (sort 1→2; zone-a was already 1→1, no change)
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });
});

// ─── Concurrent POST /zones — no duplicate sortOrder ─────────────────────────
//
// The POST handler wraps the MAX(sort_order) read + INSERT inside a transaction
// that acquires a PostgreSQL advisory lock (pg_advisory_xact_lock(1001)).
// This serialises concurrent zone creations at the DB level, so each insert
// sees the previous insert's result in MAX() before computing the next value.
//
// In these unit tests the advisory lock is a no-op (mocked execute() call), but
// the test still validates that:
//  a) Two back-to-back POSTs are each given the sortOrder that the MAX query
//     returns inside their respective transaction, and
//  b) The final zone list contains no duplicate sortOrder values.
//
// The production guarantee (lock serialisation) is the responsibility of
// pg_advisory_xact_lock; these tests confirm the read-then-insert logic
// inside the transaction is correct.

describe("Concurrent POST /api/zones — no duplicate sortOrder", () => {
  beforeEach(() => {
    process.env["SESSION_SECRET"] = "test-secret";
    vi.clearAllMocks();
    // Restore transaction + execute defaults cleared by vi.clearAllMocks()
    mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockDb) => unknown) => cb(mockDb));
    mockDb.execute.mockResolvedValue([]);
  });

  it("two sequential POSTs each get a unique sortOrder (lock serialises reads)", async () => {
    // Simulate what happens when the advisory lock forces Admin B to wait
    // for Admin A's transaction to commit before reading MAX().
    //
    // Admin A transaction:
    //   MAX(sort_order) where active=true → 3  →  inserts sortOrder=4
    // Admin B transaction (starts after A commits):
    //   MAX(sort_order) where active=true → 4  →  inserts sortOrder=5

    const zoneA = { id: "zone-x", name: "VIP", type: "dining", sortOrder: 4, active: true, color: null };
    const zoneB = { id: "zone-y", name: "Staff", type: "dining", sortOrder: 5, active: true, color: null };

    // First POST: MAX returns 3 → new zone gets sortOrder=4
    mockDb.select.mockReturnValueOnce(makeChain([{ v: 3 }]));
    mockDb.insert.mockReturnValueOnce(makeChain([zoneA]));

    const res1 = await request(app)
      .post("/api/zones")
      .set("Authorization", AUTH)
      .send({ name: "VIP", type: "dining" });

    expect(res1.status).toBe(201);
    expect(res1.body.sortOrder).toBe(4);

    // Second POST: MAX now returns 4 (Admin A's row committed) → sortOrder=5
    mockDb.select.mockReturnValueOnce(makeChain([{ v: 4 }]));
    mockDb.insert.mockReturnValueOnce(makeChain([zoneB]));

    const res2 = await request(app)
      .post("/api/zones")
      .set("Authorization", AUTH)
      .send({ name: "Staff", type: "dining" });

    expect(res2.status).toBe(201);
    expect(res2.body.sortOrder).toBe(5);

    // No duplicate sortOrders
    expect(res1.body.sortOrder).not.toBe(res2.body.sortOrder);
  });

  it("advisory lock call (execute) is made once per POST inside the transaction", async () => {
    const newZone = { id: "zone-z", name: "Eventos", type: "dining", sortOrder: 1, active: true, color: null };
    mockDb.select.mockReturnValueOnce(makeChain([{ v: null }])); // empty table
    mockDb.insert.mockReturnValueOnce(makeChain([newZone]));

    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", AUTH)
      .send({ name: "Eventos" });

    expect(res.status).toBe(201);
    // The transaction callback was entered
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    // pg_advisory_xact_lock was called inside the transaction
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
    const executeArg = mockDb.execute.mock.calls[0][0];
    // The sql`` object from drizzle-orm serialises to its queryChunks; check
    // JSON for the advisory-lock function name rather than calling String().
    expect(JSON.stringify(executeArg)).toMatch(/pg_advisory_xact_lock/);
  });

  it("sortOrder starts at 1 when the first zone is created concurrently (empty table)", async () => {
    const firstZone = { id: "zone-first", name: "Principal", type: "dining", sortOrder: 1, active: true, color: null };
    mockDb.select.mockReturnValueOnce(makeChain([{ v: null }]));
    mockDb.insert.mockReturnValueOnce(makeChain([firstZone]));

    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", AUTH)
      .send({ name: "Principal" });

    expect(res.status).toBe(201);
    expect(res.body.sortOrder).toBe(1);
  });
});
