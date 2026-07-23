import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

function makeChain(value: unknown) {
  const chain: Record<string, unknown> & {
    then: (resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise<unknown>;
  } = {
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  for (const method of [
    "select", "from", "where", "limit", "insert", "values", "returning",
    "update", "set", "orderBy", "offset", "onConflictDoUpdate", "catch", "for",
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  return chain;
}

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});

vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn(() => ({ id: "employee-1", name: "Waiter", role: "waiter" })),
  },
}));

const { default: offlineRouter } = await import("./offline");

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use("/api", offlineRouter);
  return instance;
}

const DEVICE = {
  id: "device-1",
  fingerprint: "device-fingerprint",
  status: "online",
  offlineAutorizado: true,
  cobroPermitido: true,
  offlinePerms: ["open_table", "add_item", "cash_payment"],
};

const BODY = {
  deviceId: DEVICE.fingerprint,
  operations: [{
    idempotencyKey: "device.operation.12345678",
    operationType: "cash_payment",
    payload: { orderId: "order-1", amount: "10.00" },
  }],
};

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret";
  vi.clearAllMocks();
  mockDb.select.mockImplementation(() => makeChain([]));
  mockDb.insert.mockImplementation(() => makeChain([]));
  mockDb.update.mockImplementation(() => makeChain([]));
  mockDb.delete.mockImplementation(() => makeChain([]));
  mockDb.execute.mockResolvedValue({ rows: [] });
  mockDb.transaction.mockImplementation(async (callback: (tx: typeof mockDb) => Promise<unknown>) =>
    callback(mockDb)
  );
});

describe("offline recovery safety", () => {
  it("registers waiter devices as pending without offline or payment privileges", async () => {
    mockDb.select.mockImplementationOnce(() => makeChain([]));
    const insertChain = makeChain([{
      ...DEVICE,
      status: "pending",
      offlineAutorizado: false,
      cobroPermitido: false,
      offlinePerms: [],
    }]);
    mockDb.insert.mockReturnValueOnce(insertChain);

    const response = await request(app())
      .post("/api/offline/devices")
      .set("Authorization", "Bearer token")
      .send({ name: "Tablet 1", fingerprint: "new-device" });

    expect(response.status).toBe(201);
    expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({
      status: "pending",
      offlineAutorizado: false,
      cobroPermitido: false,
      offlinePerms: [],
    }));
  });

  it("does not let a revoked fingerprint reactivate itself", async () => {
    mockDb.select.mockImplementationOnce(() => makeChain([{
      ...DEVICE,
      status: "revoked",
    }]));

    const response = await request(app())
      .post("/api/offline/devices")
      .set("Authorization", "Bearer token")
      .send({ name: "Tablet revocada", fingerprint: DEVICE.fingerprint });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("device_revoked");
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("rejects synchronization from a device without offline authorization", async () => {
    mockDb.select.mockImplementationOnce(() => makeChain([{
      ...DEVICE,
      offlineAutorizado: false,
    }]));

    const response = await request(app())
      .post("/api/offline/sync")
      .set("Authorization", "Bearer token")
      .send(BODY);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("offline_not_authorized");
  });

  it("never reports an unexecuted offline payment as synchronized", async () => {
    const results = [[DEVICE], [], [], [DEVICE], [{ count: 0 }]];
    mockDb.select.mockImplementation(() => makeChain(results.shift() ?? []));

    const response = await request(app())
      .post("/api/offline/sync")
      .set("Authorization", "Bearer token")
      .send(BODY);

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([
      expect.objectContaining({
        idempotencyKey: BODY.operations[0].idempotencyKey,
        status: "failed",
      }),
    ]);
  });

  it("returns a conflict instead of opening an already occupied table twice", async () => {
    const results = [[DEVICE], [], [], [DEVICE], [{ count: 0 }]];
    mockDb.select.mockImplementation(() => makeChain(results.shift() ?? []));
    mockDb.transaction.mockImplementation(async (callback: (tx: typeof mockDb) => Promise<unknown>) => {
      const tx = {
        ...mockDb,
        update: vi.fn(() => makeChain([])),
        insert: vi.fn(() => makeChain([])),
      };
      return callback(tx as typeof mockDb);
    });

    const response = await request(app())
      .post("/api/offline/sync")
      .set("Authorization", "Bearer token")
      .send({
        deviceId: DEVICE.fingerprint,
        operations: [{
          idempotencyKey: "device.open-table.12345678",
          operationType: "open_table",
          payload: { tableId: "table-1", guestCount: 2 },
        }],
      });

    expect(response.status).toBe(200);
    expect(response.body.results[0]).toMatchObject({
      status: "conflict",
      error: "La mesa ya no está disponible.",
    });
  });

  it("commits an offline item and its idempotency record atomically", async () => {
    const outerResults = [[DEVICE], [DEVICE], [{ count: 0 }]];
    mockDb.select.mockImplementation(() => makeChain(outerResults.shift() ?? []));
    const txSelectResults = [
      [],
      [],
      [{ id: "order-1", status: "open" }],
      [{ id: "product-1", name: "Pizza", price: "12.00", taxRate: 10, active: true }],
    ];
    let insertCall = 0;
    mockDb.transaction.mockImplementation(async (callback: (tx: typeof mockDb) => Promise<unknown>) => {
      const tx = {
        ...mockDb,
        execute: vi.fn().mockResolvedValue({ rows: [] }),
        select: vi.fn(() => makeChain(txSelectResults.shift() ?? [])),
        insert: vi.fn(() => {
          insertCall += 1;
          return makeChain(insertCall === 1 ? [{ id: "item-1" }] : []);
        }),
      };
      return callback(tx as typeof mockDb);
    });

    const response = await request(app())
      .post("/api/offline/sync")
      .set("Authorization", "Bearer token")
      .send({
        deviceId: DEVICE.fingerprint,
        operations: [{
          idempotencyKey: "device.add-item.12345678",
          operationType: "add_item",
          payload: { orderId: "order-1", productId: "product-1", quantity: 1 },
        }],
      });

    expect(response.body.results[0].status).toBe("synced");
    expect(insertCall).toBe(2);
  });

  it("replays an already synchronized operation without executing it again", async () => {
    const results = [[DEVICE], [], [{ status: "synced" }], [DEVICE], [{ count: 0 }]];
    mockDb.select.mockImplementation(() => makeChain(results.shift() ?? []));

    const response = await request(app())
      .post("/api/offline/sync")
      .set("Authorization", "Bearer token")
      .send(BODY);

    expect(response.body.results[0].status).toBe("skipped");
    expect(mockDb.transaction).toHaveBeenCalledOnce();
  });

  it("does not duplicate an online mutation whose response was lost", async () => {
    const results = [[DEVICE], [{ cacheKey: `employee-1:${BODY.operations[0].idempotencyKey}` }], [DEVICE], [{ count: 0 }]];
    mockDb.select.mockImplementation(() => makeChain(results.shift() ?? []));

    const response = await request(app())
      .post("/api/offline/sync")
      .set("Authorization", "Bearer token")
      .send(BODY);

    expect(response.body.results[0].status).toBe("skipped");
  });
});
