import { describe, expect, it } from "vitest";
import type { Request } from "express";
import {
  configuredQrMenuApiToken,
  qrMenuBearerToken,
  qrMenuTokenMatches,
} from "./qr-menu-api-auth";

describe("QR Menu M2M token", () => {
  it("reads only a Bearer header", () => {
    const req = {
      headers: { authorization: "Bearer dedicated-token" },
      query: { token: "must-not-be-used" },
    } as unknown as Request;
    expect(qrMenuBearerToken(req)).toBe("dedicated-token");
  });

  it("compares values in constant-time compatible form", () => {
    expect(qrMenuTokenMatches("same", "same")).toBe(true);
    expect(qrMenuTokenMatches("wrong", "same")).toBe(false);
    expect(qrMenuTokenMatches("short", "a-much-longer-value")).toBe(false);
  });

  it("is disabled for missing or short configuration", () => {
    const previous = process.env["PICCOLO_QR_MENU_API_TOKEN"];
    delete process.env["PICCOLO_QR_MENU_API_TOKEN"];
    expect(configuredQrMenuApiToken()).toBeNull();
    process.env["PICCOLO_QR_MENU_API_TOKEN"] = "short";
    expect(configuredQrMenuApiToken()).toBeNull();
    if (previous === undefined) delete process.env["PICCOLO_QR_MENU_API_TOKEN"];
    else process.env["PICCOLO_QR_MENU_API_TOKEN"] = previous;
  });
});
