import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(value: unknown) {
  const result: Record<string, unknown> & {
    then: (resolve: (value: unknown) => unknown) => Promise<unknown>;
  } = { then: (resolve) => Promise.resolve(value).then(resolve) };
  for (const method of ["from", "where", "limit", "orderBy", "set", "values", "returning", "catch"]) {
    result[method] = vi.fn(() => result);
  }
  return result;
}

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});
vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn((token: string) => ({
      id: "user-1",
      name: "User",
      role: token,
    })),
  },
}));
vi.mock("express-rate-limit", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const [
  { default: onlineRouter },
  { default: tabletRouter },
  { default: backupRouter },
  { default: onlineV2Router },
  { default: cashMachineRouter },
] = await Promise.all([
  import("./online-orders"),
  import("./tablet"),
  import("./backup"),
  import("./online-orders-v2"),
  import("./cash-machine"),
]);

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use("/api", onlineRouter);
  instance.use("/api", tabletRouter);
  instance.use("/api", backupRouter);
  instance.use("/api", onlineV2Router);
  instance.use("/api", cashMachineRouter);
  return instance;
}

beforeEach(() => {
  process.env.SESSION_SECRET = "x".repeat(32);
  vi.clearAllMocks();
  mockDb.select.mockReturnValue(chain([]));
  mockDb.insert.mockReturnValue(chain([]));
  mockDb.update.mockReturnValue(chain([]));
  mockDb.delete.mockReturnValue(chain([]));
});

describe("API responses never expose credentials", () => {
  it("masks online secrets and strips courier bearer tokens for managers", async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{
        id: "cfg-1",
        stripePublishableKey: "pk_live_public",
        stripeSecretKey: "sk_live_private",
        stripeWebhookSecret: "whsec_private",
      }]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([{ id: "courier-1", name: "Courier", token: "courier-secret" }]));

    const response = await request(app()).get("/api/admin/online-config")
      .set("Authorization", "Bearer manager");
    const serialized = JSON.stringify(response.body);
    expect(response.status).toBe(200);
    expect(serialized).not.toContain("sk_live_private");
    expect(serialized).not.toContain("whsec_private");
    expect(serialized).not.toContain("courier-secret");
    expect(response.body.config.stripePublishableKey).toBe("pk_live_public");
  });

  it("allows only admins to modify online configuration and rejects secret fields", async () => {
    expect((await request(app()).patch("/api/admin/online-config")
      .set("Authorization", "Bearer manager").send({ paused: true })).status).toBe(403);
    expect((await request(app()).patch("/api/admin/online-config")
      .set("Authorization", "Bearer admin").send({ stripeSecretKey: "sk_live_private" })).status).toBe(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("strips tablet device tokens", async () => {
    mockDb.select.mockReturnValueOnce(chain([{ id: "tablet-1", name: "Clock", deviceToken: "device-secret" }]));
    const response = await request(app()).get("/api/tablet/devices")
      .set("Authorization", "Bearer manager");
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain("device-secret");
  });

  it("masks backup destination credentials", async () => {
    mockDb.select.mockReturnValueOnce(chain([{
      id: "destination-1",
      name: "S3",
      config: { accessKeyId: "public-id", secretAccessKey: "s3-secret" },
    }]));
    const response = await request(app()).get("/api/backup/destinations")
      .set("Authorization", "Bearer manager");
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain("s3-secret");
  });

  it("strips QR session tokens and cash-machine credential keys", async () => {
    mockDb.select.mockReturnValueOnce(chain([{ id: "session-1", token: "qr-session-secret" }]));
    const sessions = await request(app()).get("/api/admin/table-sessions")
      .set("Authorization", "Bearer manager");
    expect(JSON.stringify(sessions.body)).not.toContain("qr-session-secret");

    mockDb.select.mockReturnValueOnce(chain([{
      id: "cash-config-1",
      manufacturer: "real",
      credentialKey: "physical-device-secret",
      enabled: false,
    }]));
    const cashConfig = await request(app()).get("/api/admin/cash-machine/config")
      .set("Authorization", "Bearer admin");
    expect(JSON.stringify(cashConfig.body)).not.toContain("physical-device-secret");
    expect(cashConfig.body.hasCredential).toBe(true);
  });
});
