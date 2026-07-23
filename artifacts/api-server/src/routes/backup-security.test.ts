import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(value: unknown) {
  const result: Record<string, unknown> & {
    then: (resolve: (value: unknown) => unknown) => Promise<unknown>;
  } = { then: (resolve) => Promise.resolve(value).then(resolve) };
  for (const method of ["from", "where", "values", "returning", "catch", "orderBy", "limit", "offset"]) {
    result[method] = vi.fn(() => result);
  }
  return result;
}

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  execute: vi.fn(),
}));
const mockPool = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb, pool: mockPool };
});
vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn((token: string) => ({
      id: "user-1",
      name: "Test",
      role: token,
    })),
  },
}));
vi.mock("express-rate-limit", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { default: backupRouter } = await import("./backup");

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use("/api", backupRouter);
  return instance;
}

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret";
  vi.clearAllMocks();
  mockDb.select.mockReturnValue(chain([]));
  mockDb.insert.mockReturnValue(chain([]));
  mockDb.update.mockReturnValue(chain([]));
  mockDb.delete.mockReturnValue(chain([]));
});

describe("emergency export security", () => {
  it("denies managers and audits the escalation attempt", async () => {
    const response = await request(app())
      .post("/api/backup/emergency-export")
      .set("Authorization", "Bearer manager")
      .send({ modules: ["ventas"], format: "json" });

    expect(response.status).toBe(403);
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it.each([
    ["employee_pins"],
    ["revoked_tokens"],
    ["missing_table"],
    ["ventas; DROP TABLE employees; --"],
  ])("rejects forbidden, missing and injected module names", async (module) => {
    const response = await request(app())
      .post("/api/backup/emergency-export")
      .set("Authorization", "Bearer admin")
      .send({ modules: [module], format: "json" });

    expect(response.status).toBe(422);
    expect(mockDb.execute).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("exports an allowlisted module without dynamic SQL", async () => {
    mockDb.select.mockReturnValueOnce(chain([{ id: "ticket-1", total: "10.00" }]));

    const response = await request(app())
      .post("/api/backup/emergency-export")
      .set("Authorization", "Bearer admin")
      .send({ modules: ["ventas"], format: "json" });

    expect(response.status).toBe(200);
    expect(response.body.tables.ventas).toHaveLength(1);
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("strips client QR credentials from exported CRM rows", async () => {
    mockDb.select.mockReturnValueOnce(chain([{ id: "client-1", nombre: "Ana", qrToken: "secret-token" }]));
    const response = await request(app())
      .post("/api/backup/emergency-export")
      .set("Authorization", "Bearer admin")
      .send({ modules: ["clientes"], format: "json" });
    expect(response.status).toBe(200);
    expect(response.body.tables.clientes[0]).not.toHaveProperty("qrToken");
  });

  it("does not deliver an export when mandatory auditing fails", async () => {
    mockDb.select.mockReturnValueOnce(chain([{ id: "ticket-1" }]));
    mockDb.insert.mockImplementationOnce(() => {
      throw new Error("audit unavailable");
    });
    const response = await request(app())
      .post("/api/backup/emergency-export")
      .set("Authorization", "Bearer admin")
      .send({ modules: ["ventas"], format: "json" });
    expect(response.status).toBe(500);
  });
});
