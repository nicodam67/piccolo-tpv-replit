import { beforeEach, describe, expect, it } from "vitest";
import {
  restaurantVersion,
  signTableQr,
  tableVersion,
  verifyTableQr,
} from "./table-qr";

beforeEach(() => {
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "x".repeat(32);
});

describe("signed table QR tickets", () => {
  const table = { id: "table-1", zoneId: "zone-1", name: "Mesa 1", active: true };

  it("signs and verifies a ticket bound to restaurant and table versions", () => {
    const payload = {
      rid: "restaurant-1",
      tid: table.id,
      zid: table.zoneId,
      tv: tableVersion(table),
      rv: restaurantVersion(new Date("2026-01-01T00:00:00Z")),
      exp: Math.floor(Date.now() / 1000) + 600,
    };
    expect(verifyTableQr(signTableQr(payload))).toEqual(payload);
  });

  it("rejects tampering and expiration", () => {
    const ticket = signTableQr({
      rid: "restaurant-1",
      tid: table.id,
      zid: table.zoneId,
      tv: tableVersion(table),
      rv: "version",
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    expect(() => verifyTableQr(`${ticket}tampered`)).toThrow();
    const expired = signTableQr({
      rid: "restaurant-1", tid: table.id, zid: table.zoneId,
      tv: tableVersion(table), rv: "version", exp: 1,
    });
    expect(() => verifyTableQr(expired)).toThrow("QR_EXPIRED");
  });

  it("changes the table fingerprint when identity changes", () => {
    expect(tableVersion(table)).not.toBe(tableVersion({ ...table, name: "Mesa nueva" }));
    expect(tableVersion(table)).not.toBe(tableVersion({ ...table, active: false }));
  });
});
