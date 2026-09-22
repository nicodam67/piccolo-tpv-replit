import { describe, expect, it } from "vitest";
import { encodeEscPos } from "./print-connector-sim";
import {
  buildPrintDedupeKey,
  nextPrintRetryAt,
  resolvePrinterTargets,
} from "./print-resilience";

const printers = [
  { id: "kitchen", type: "legacy", departmentCode: "cocina", active: true, isPrimary: true },
  { id: "dessert", type: "legacy", departmentCode: "postres", active: true, isPrimary: true },
  { id: "disabled", type: "postres", departmentCode: "postres", active: false, isPrimary: true },
  { id: "secondary", type: "postres", departmentCode: "postres", active: true, isPrimary: false },
];

describe("durable printer routing", () => {
  it("routes a new department without a hardcoded name", () => {
    expect(resolvePrinterTargets("product", "category", "postres", printers, new Map()))
      .toEqual([printers[1]]);
  });

  it("applies product override before category and department fallbacks", () => {
    const routing = new Map([
      ["product:product", ["dessert"]],
      ["category:category", ["kitchen"]],
    ]);
    expect(resolvePrinterTargets("product", "category", "cocina", printers, routing))
      .toEqual([printers[1]]);
  });

  it("does not route inactive explicit targets", () => {
    const routing = new Map([["product:product", ["disabled"]]]);
    expect(resolvePrinterTargets("product", "category", "postres", printers, routing)).toEqual([]);
  });
});

describe("idempotency and retries", () => {
  it("builds the same destination key regardless of item order", () => {
    const base = { documentType: "kitchen_ticket", orderId: "order", printerId: "printer" };
    expect(buildPrintDedupeKey({ ...base, operationIds: ["b", "a"] }))
      .toBe(buildPrintDedupeKey({ ...base, operationIds: ["a", "b"] }));
  });

  it("uses deterministic exponential backoff", () => {
    const now = new Date("2026-09-22T12:00:00.000Z");
    expect(nextPrintRetryAt(now, 1).toISOString()).toBe("2026-09-22T12:00:05.000Z");
    expect(nextPrintRetryAt(now, 3).toISOString()).toBe("2026-09-22T12:00:20.000Z");
  });
});

describe("ESC/POS encoding", () => {
  it("emits init, configured code page, drawer pulse and cut commands", () => {
    const payload = encodeEscPos({
      content: "MESA 12\n2 x Pizza\nSIN CEBOLLA\ná é í ó ú ñ ç €",
      characterSet: "cp858",
      openCashDrawer: true,
      autoCut: true,
    });
    expect([...payload.subarray(0, 5)]).toEqual([0x1b, 0x40, 0x1b, 0x74, 19]);
    expect(payload.includes(Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]))).toBe(true);
    expect([...payload.subarray(-3)]).toEqual([0x1d, 0x56, 0x00]);
    expect(payload.includes(135)).toBe(true);
    expect(payload.includes(213)).toBe(true);
  });

  it("does not emit cut or drawer commands when disabled", () => {
    const payload = encodeEscPos({ content: "TEST", autoCut: false, openCashDrawer: false });
    expect(payload.includes(Buffer.from([0x1d, 0x56]))).toBe(false);
    expect(payload.includes(Buffer.from([0x1b, 0x70]))).toBe(false);
  });
});
