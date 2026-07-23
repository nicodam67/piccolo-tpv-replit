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
    "update", "set", "delete", "orderBy", "leftJoin", "innerJoin", "catch",
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
  execute: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});

vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn(() => ({ id: "admin-1", name: "Admin", role: "admin" })),
  },
}));

vi.mock("../lib/print-connector-sim", () => ({
  getPrinterStatus: vi.fn(),
  sendToPrinter: vi.fn(),
}));

const [{ default: printersRouter }, { default: tablesRouter }, { default: shiftsRouter }] =
  await Promise.all([
    import("./printers"),
    import("./tables"),
    import("./service-shifts"),
  ]);

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use("/api", printersRouter);
  instance.use("/api", tablesRouter);
  instance.use("/api", shiftsRouter);
  return instance;
}

const AUTH = { Authorization: "Bearer admin" };

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret";
  vi.clearAllMocks();
  mockDb.select.mockImplementation(() => makeChain([]));
  mockDb.insert.mockImplementation(() => makeChain([]));
  mockDb.update.mockImplementation(() => makeChain([]));
  mockDb.delete.mockImplementation(() => makeChain([]));
});

describe("configuration reference constraints", () => {
  it("rejects a missing fallback printer", async () => {
    const response = await request(app())
      .post("/api/admin/printers")
      .set(AUTH)
      .send({
        name: "Cocina",
        fallbackPrinterId: "11111111-1111-4111-8111-111111111111",
      });

    expect(response.status).toBe(422);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("rejects print routes that reference missing printers", async () => {
    const response = await request(app())
      .put("/api/admin/print-routing/category/22222222-2222-4222-8222-222222222222")
      .set(AUTH)
      .send({ printerIds: ["11111111-1111-4111-8111-111111111111"] });

    expect(response.status).toBe(422);
    expect(response.body.error).toContain("inexistentes");
  });

  it("does not deactivate a printer that is still referenced", async () => {
    mockDb.select
      .mockImplementationOnce(() => makeChain([{ id: "fallback", name: "Respaldo" }]))
      .mockImplementationOnce(() => makeChain([]))
      .mockImplementationOnce(() => makeChain([]));

    const response = await request(app())
      .delete("/api/admin/printers/11111111-1111-4111-8111-111111111111")
      .set(AUTH);

    expect(response.status).toBe(409);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("does not silently overwrite canonical identity from print settings", async () => {
    mockDb.select.mockImplementation(() => makeChain([{
      id: "business-1",
      nombreComercial: "Piccolo",
      razonSocial: "Piccolo SL",
      nif: "B12345678",
      direccionFiscal: "C/ Major 1",
      logoUrl: "",
      printTemplateConfig: null,
    }]));

    const response = await request(app())
      .patch("/api/admin/print-config")
      .set(AUTH)
      .send({
        printTemplateConfig: {
          nombreComercial: "Otro nombre",
          datosFiscales: "Piccolo SL · B12345678 · C/ Major 1",
          logoUrl: "",
        },
      });

    expect(response.status).toBe(422);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("rejects duplicate table names in the same room and layout", async () => {
    mockDb.select.mockImplementation(() => makeChain([{ id: "existing-table" }]));

    const response = await request(app())
      .post("/api/zones/33333333-3333-4333-8333-333333333333/tables")
      .set(AUTH)
      .send({ name: "Mesa 1", layout: "normal" });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("Ya existe una mesa");
  });

  it("rejects incoherent reservation shifts before writing", async () => {
    const response = await request(app())
      .post("/api/service-shifts")
      .set(AUTH)
      .send({ nombre: "Comida", horaInicio: "10:00", horaFin: "09:00" });

    expect(response.status).toBe(422);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
