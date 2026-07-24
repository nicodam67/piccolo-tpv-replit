import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function chain(value: unknown) {
  const result: Record<string, unknown> & {
    then: (resolve: (value: unknown) => unknown) => Promise<unknown>;
  } = { then: (resolve) => Promise.resolve(value).then(resolve) };
  for (const method of ["from", "where", "limit", "orderBy", "values", "returning", "set", "catch"]) {
    result[method] = vi.fn(() => result);
  }
  return result;
}

const mockDb = vi.hoisted(() => ({
  select: vi.fn(() => chain([])),
  insert: vi.fn(() => chain([])),
  update: vi.fn(() => chain([])),
  execute: vi.fn(),
}));
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});
vi.mock("jsonwebtoken", () => ({
  default: { verify: vi.fn(() => ({ id: "admin-1", name: "Admin", role: "admin" })) },
}));

const [
  { sendToPrinter },
  { adapterRegistry },
  { submitRecord },
  { default: onlineV1 },
  { default: onlineV2 },
  { default: fullApp },
] = await Promise.all([
  import("../lib/print-connector-sim"),
  import("../lib/cash-machine/registry"),
  import("./verifactu"),
  import("./online-orders"),
  import("./online-orders-v2"),
  import("../app"),
]);

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use("/api", onlineV1);
  instance.use("/api", onlineV2);
  return instance;
}

beforeEach(() => {
  process.env.NODE_ENV = "production";
  process.env.SESSION_SECRET = "x".repeat(32);
  vi.clearAllMocks();
  adapterRegistry.reset();
});
afterEach(() => {
  process.env.NODE_ENV = "test";
});

describe("production connector gates", () => {
  it("never confirms simulated printing", async () => {
    const result = await sendToPrinter({
      printerId: "printer-1",
      printerIp: "127.0.0.1",
      printerPort: 9100,
      content: "ticket",
      copies: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("never exposes the cash-machine simulator as a production connector", () => {
    expect(() => adapterRegistry.getAdapter()).toThrow(/no configurado/i);
  });

  it("never accepts a VeriFactu simulation in production", async () => {
    const result = await submitRecord({} as never, { entorno: "simulador" } as never);
    expect(result).toMatchObject({
      ok: false,
      estado: "rechazado",
      codigo: "CONNECTOR_NOT_CONFIGURED",
    });
  });

  it("keeps Stripe intents, webhooks, refunds and payment simulation disabled", async () => {
    expect((await request(app()).post("/api/public/payment/intent").send({ orderId: "order-1" })).status).toBe(503);
    expect((await request(app()).post("/api/public/payment/webhook").send({ type: "simulator.payment.confirm" })).status).toBe(503);
    expect((await request(app()).post("/api/admin/online-orders/order-1/refund")
      .set("Authorization", "Bearer admin").send({})).status).toBe(503);
    expect((await request(app()).post("/api/online-orders/order-1/payment-simulate")
      .set("Authorization", "Bearer admin").send({ approve: true })).status).toBe(403);
    expect((await request(fullApp).post("/api/crm/campaigns/campaign-1/send")
      .set("Authorization", "Bearer admin").send({})).status).toBe(503);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("removes demo and simulation endpoints from production", async () => {
    expect((await request(fullApp).post("/api/backup/demo-data")).status).toBe(404);
    expect((await request(fullApp).post("/api/setup/simulation/start")).status).toBe(404);
    expect((await request(fullApp).post("/api/admin/installation-simulation/run")).status).toBe(404);
    expect((await request(fullApp).post("/api/backup/DEMO-DATA")).status).toBe(404);
  });

  it("does not allow enabling simulated fiscal or cash connectors", async () => {
    expect((await request(fullApp).put("/api/admin/verifactu/config")
      .set("Authorization", "Bearer admin")
      .send({ activo: true, entorno: "simulador" })).status).toBe(503);
    expect((await request(fullApp).put("/api/admin/cash-machine/config")
      .set("Authorization", "Bearer admin")
      .send({ enabled: true, manufacturer: "simulator" })).status).toBe(503);
  });
});
