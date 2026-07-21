import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

function makeChain(value: unknown) {
  const chain: Record<string, unknown> & {
    then: (resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise<unknown>;
  } = {
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  for (const method of [
    "select", "from", "where", "limit", "innerJoin", "insert", "values",
    "returning", "update", "set", "for", "onConflictDoNothing",
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  return chain;
}

const mockBcryptCompare = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));
const mockPool = vi.hoisted(() => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb, pool: mockPool };
});

vi.mock("bcryptjs", () => ({
  compare: mockBcryptCompare,
  hashSync: vi.fn(() => "$2a$10$dummy-hash"),
}));

const { default: tabletRouter } = await import("./tablet");

const app = express();
app.use(express.json());
app.use("/api", tabletRouter);

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const DEVICE = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Tablet test",
  deviceToken: "device-token",
  status: "active",
  pinHash: "$2a$10$employee-hash",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBcryptCompare.mockResolvedValue(true);
  mockDb.select.mockReturnValue(makeChain([DEVICE]));
  mockDb.insert.mockReturnValue(makeChain([]));
  mockDb.update.mockReturnValue(makeChain([]));
  mockDb.transaction.mockImplementation(async (callback) =>
    callback({
      insert: mockDb.insert,
      select: mockDb.select,
      update: mockDb.update,
    }),
  );
  mockPool.query.mockResolvedValue({ rows: [] });
});

describe("secure tablet clock authorization", () => {
  it("issues short-lived action-bound proofs after a valid PIN", async () => {
    const res = await request(app)
      .post("/api/tablet/verify-pin")
      .send({ employeeId: EMPLOYEE_ID, pin: "4826", deviceToken: DEVICE.deviceToken });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.proofs).toEqual({
      clock_in: expect.any(String),
      clock_out: expect.any(String),
      break_start: expect.any(String),
      break_end: expect.any(String),
    });
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("returns the same external message for an incorrect PIN", async () => {
    mockBcryptCompare.mockResolvedValue(false);
    const res = await request(app)
      .post("/api/tablet/verify-pin")
      .send({ employeeId: EMPLOYEE_ID, pin: "0000", deviceToken: DEVICE.deviceToken });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("No se pudo autorizar el fichaje");
    expect(res.body).not.toHaveProperty("employee");
  });

  it("returns the same external message for an unknown device", async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    const res = await request(app)
      .post("/api/tablet/verify-pin")
      .send({ employeeId: EMPLOYEE_ID, pin: "4826", deviceToken: "unknown-device" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("No se pudo autorizar el fichaje");
  });

  it("rate-limits repeated PIN authorization attempts", async () => {
    mockBcryptCompare.mockResolvedValue(false);
    let blockedStatus = 0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const res = await request(app)
        .post("/api/tablet/verify-pin")
        .send({ employeeId: EMPLOYEE_ID, pin: "0000", deviceToken: DEVICE.deviceToken });
      if (res.status === 429) {
        blockedStatus = res.status;
        expect(res.body.error).toBe("No se pudo autorizar el fichaje");
        break;
      }
    }
    expect(blockedStatus).toBe(429);
  });
});
