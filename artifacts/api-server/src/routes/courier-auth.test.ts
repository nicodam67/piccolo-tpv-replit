import { describe, expect, it } from "vitest";
import type { Request } from "express";
import {
  courierTokenFromHeader,
  courierTokenMatches,
} from "./online-orders";

describe("courier bearer authentication", () => {
  it("reads the bearer credential from a header, never from the query string", () => {
    const request = {
      headers: { authorization: "Bearer header-token" },
      query: { token: "query-token-must-be-ignored" },
    } as unknown as Request;

    expect(courierTokenFromHeader(request)).toBe("header-token");
  });

  it("does not accept a query-only token", () => {
    const request = {
      headers: {},
      query: { token: "query-token-must-be-ignored" },
    } as unknown as Request;

    expect(courierTokenFromHeader(request)).toBe("");
  });

  it("compares courier bearer tokens without direct string equality", () => {
    expect(courierTokenMatches("same-token", "same-token")).toBe(true);
    expect(courierTokenMatches("wrong-token", "same-token")).toBe(false);
    expect(courierTokenMatches("short", "a-much-longer-token")).toBe(false);
  });
});
