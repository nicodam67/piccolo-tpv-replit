import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(value: unknown) {
  const result: Record<string, unknown> & {
    then: (resolve: (value: unknown) => unknown) => Promise<unknown>;
  } = { then: (resolve) => Promise.resolve(value).then(resolve) };
  for (const method of [
    "from", "where", "for", "set", "values", "returning", "onConflictDoUpdate",
    "catch", "limit", "orderBy", "leftJoin",
  ]) result[method] = vi.fn(() => result);
  return result;
}

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});
vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn((token: string) => ({
      id: token === "manager" ? "manager-self" : "admin-self",
      name: "Actor",
      role: token,
    })),
  },
}));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hash") },
}));

const { default: hrRouter } = await import("./hr");

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use("/api", hrRouter);
  return instance;
}

const ADMIN = { id: "admin-target", name: "Admin", role: "admin", active: true, empStatus: "active" };
const WAITER = { id: "waiter-target", name: "Waiter", role: "waiter", active: true, empStatus: "active" };

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret";
  vi.clearAllMocks();
  mockDb.select.mockReturnValue(chain([]));
  mockDb.insert.mockReturnValue(chain([]));
  mockDb.update.mockReturnValue(chain([]));
  mockDb.delete.mockReturnValue(chain([]));
  mockDb.execute.mockResolvedValue({ rows: [] });
  mockDb.transaction.mockImplementation(async (callback: (tx: typeof mockDb) => Promise<unknown>) =>
    callback(mockDb)
  );
});

describe("HR privilege escalation protection", () => {
  it("denies and audits a manager creating an admin", async () => {
    const response = await request(app()).post("/api/hr/employees")
      .set("Authorization", "Bearer manager")
      .send({ name: "Escalation", role: "admin" });
    expect(response.status).toBe(403);
    expect(mockDb.insert).toHaveBeenCalledOnce();
  });

  it("allows a manager to create a non-privileged employee", async () => {
    mockDb.insert.mockReturnValueOnce(chain([{ ...WAITER, id: "new-waiter" }]));
    const response = await request(app()).post("/api/hr/employees")
      .set("Authorization", "Bearer manager")
      .send({ name: "Waiter", role: "waiter" });
    expect(response.status).toBe(201);
  });

  it("denies a manager modifying an admin or promoting itself", async () => {
    mockDb.select.mockReturnValueOnce(chain([ADMIN]));
    const adminResponse = await request(app()).patch(`/api/hr/employees/${ADMIN.id}`)
      .set("Authorization", "Bearer manager")
      .send({ name: "Compromised" });
    expect(adminResponse.status).toBe(403);

    mockDb.select.mockReturnValueOnce(chain([{ ...WAITER, id: "manager-self", role: "manager" }]));
    const selfResponse = await request(app()).patch("/api/hr/employees/manager-self")
      .set("Authorization", "Bearer manager")
      .send({ role: "admin" });
    expect(selfResponse.status).toBe(403);
  });

  it("allows an admin to create another admin", async () => {
    mockDb.insert.mockReturnValueOnce(chain([{ ...ADMIN, id: "admin-2" }]));
    const response = await request(app()).post("/api/hr/employees")
      .set("Authorization", "Bearer admin")
      .send({ name: "Admin 2", role: "admin" });
    expect(response.status).toBe(201);
  });

  it("never deactivates or deletes the last active admin", async () => {
    mockDb.select
      .mockReturnValueOnce(chain([ADMIN]))
      .mockReturnValueOnce(chain([{ count: 1 }]));
    const patchResponse = await request(app()).patch(`/api/hr/employees/${ADMIN.id}`)
      .set("Authorization", "Bearer admin")
      .send({ active: false });
    expect(patchResponse.status).toBe(409);

    mockDb.select
      .mockReturnValueOnce(chain([ADMIN]))
      .mockReturnValueOnce(chain([{ count: 1 }]));
    const deleteResponse = await request(app()).delete(`/api/hr/employees/${ADMIN.id}`)
      .set("Authorization", "Bearer admin");
    expect(deleteResponse.status).toBe(409);
  });

  it("allows deleting an admin when another active admin remains", async () => {
    mockDb.select
      .mockReturnValueOnce(chain([ADMIN]))
      .mockReturnValueOnce(chain([{ count: 2 }]));
    mockDb.update.mockReturnValueOnce(chain([{ ...ADMIN, active: false }]));
    const response = await request(app()).delete(`/api/hr/employees/${ADMIN.id}`)
      .set("Authorization", "Bearer admin");
    expect(response.status).toBe(200);
  });

  it("denies and audits a manager deleting employees", async () => {
    const response = await request(app()).delete(`/api/hr/employees/${ADMIN.id}`)
      .set("Authorization", "Bearer manager");
    expect(response.status).toBe(403);
    expect(mockDb.insert).toHaveBeenCalledOnce();
  });
});
