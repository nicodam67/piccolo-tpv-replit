import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function chain(value: unknown) {
  const result: Record<string, unknown> & {
    then: (resolve: (value: unknown) => unknown) => Promise<unknown>;
  } = { then: (resolve) => Promise.resolve(value).then(resolve) };
  for (const method of ["from", "where", "limit", "orderBy", "groupBy"]) {
    result[method] = vi.fn(() => result);
  }
  return result;
}

const mockDb = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});
vi.mock("../lib/document-audit", () => ({ logDocumentAction: vi.fn() }));

const [{ default: categoriesRouter }, { default: configRouter }] = await Promise.all([
  import("./categories"),
  import("./config"),
]);

function app() {
  const instance = express();
  instance.use("/api", categoriesRouter);
  instance.use("/api", configRouter);
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnValue(chain([]));
});
afterEach(() => {
  process.env.NODE_ENV = "test";
});

describe("integrated QR fail-closed behavior", () => {
  it("returns a controlled 503 in production when business configuration is absent", async () => {
    process.env.NODE_ENV = "production";
    const menu = await request(app()).get("/api/public/menu");
    const branding = await request(app()).get("/api/public/branding");
    expect(menu.status).toBe(503);
    expect(branding.status).toBe(503);
    expect(menu.body.code).toBe("QR_NOT_CONFIGURED");
  });

  it("returns a controlled 503 when production has no menu categories", async () => {
    process.env.NODE_ENV = "production";
    mockDb.select
      .mockReturnValueOnce(chain([{ nombreComercial: "Piccolo", active: true }]))
      .mockReturnValueOnce(chain([]));
    const response = await request(app()).get("/api/public/menu");
    expect(response.status).toBe(503);
  });

  it("keeps empty development installations available without demo seeding", async () => {
    process.env.NODE_ENV = "development";
    const response = await request(app()).get("/api/public/menu");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});
