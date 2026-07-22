import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const TEST_TOKEN = "qr-menu-test-token-at-least-32-characters";
const catalog = {
  contractVersion: "v1",
  catalogVersion: "a".repeat(64),
  generatedAt: "2026-07-22T00:00:00.000Z",
  catalogUpdatedAt: null,
  defaultLocale: "es",
  availableLocales: ["en", "es"],
  currency: "EUR",
  categories: [],
};

vi.mock("../lib/qr-menu-catalog", () => ({
  loadQrMenuCatalogV1: vi.fn().mockResolvedValue(catalog),
}));

const { default: router } = await import("./qr-menu-v1");
const app = express();
app.use(express.json());
app.use("/api", router);

beforeEach(() => {
  process.env["PICCOLO_QR_MENU_API_TOKEN"] = TEST_TOKEN;
  process.env["RESTAURANT_ID"] = "restaurant-test";
});

afterAll(() => {
  delete process.env["PICCOLO_QR_MENU_API_TOKEN"];
  delete process.env["RESTAURANT_ID"];
});

describe("QR Menu API v1", () => {
  it("returns 503 when integration is disabled", async () => {
    delete process.env["PICCOLO_QR_MENU_API_TOKEN"];
    const res = await request(app).get("/api/v1/qr-menu/status");
    expect(res.status).toBe(503);
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/v1/qr-menu/status");
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain(TEST_TOKEN);
  });

  it("returns 401 for an incorrect or staff token", async () => {
    const res = await request(app)
      .get("/api/v1/qr-menu/catalog")
      .set("Authorization", "Bearer employee-jwt");
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain("employee-jwt");
  });

  it("allows a valid dedicated token", async () => {
    const res = await request(app)
      .get("/api/v1/qr-menu/status")
      .set("Authorization", `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      contractVersion: "v1",
      status: "ready",
      restaurantId: "restaurant-test",
      catalogVersion: "a".repeat(64),
    });
    expect(JSON.stringify(res.body)).not.toContain(TEST_TOKEN);
  });

  it("returns the safe catalog with a valid token", async () => {
    const res = await request(app)
      .get("/api/v1/qr-menu/catalog")
      .set("Authorization", `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(catalog);
  });

  it("rate limits repeated requests", async () => {
    let blocked = false;
    for (let attempt = 0; attempt < 70; attempt += 1) {
      const res = await request(app)
        .get("/api/v1/qr-menu/catalog")
        .set("Authorization", `Bearer ${TEST_TOKEN}`);
      if (res.status === 429) {
        blocked = true;
        expect(JSON.stringify(res.body)).not.toContain(TEST_TOKEN);
        break;
      }
    }
    expect(blocked).toBe(true);
  });
});
