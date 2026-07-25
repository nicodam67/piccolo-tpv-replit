import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";
import {
  MAX_ESC_POS_PAYLOAD_BYTES,
  buildEscPosPayload,
} from "./escpos-payload";

describe("ESC/POS software payload", () => {
  it("adds initialization, CP858, feed and cut commands", () => {
    const payload = buildEscPosPayload({ content: "Niño · café · 12€" });
    expect([...payload.subarray(0, 5)]).toEqual([0x1b, 0x40, 0x1b, 0x74, 19]);
    expect(payload.includes(iconv.encode("Niño · café · 12€", "cp858"))).toBe(true);
    expect([...payload.subarray(-3)]).toEqual([0x1d, 0x56, 0x01]);
  });

  it("adds the drawer pulse only when explicitly enabled", () => {
    const normal = buildEscPosPayload({ content: "Ticket", openDrawer: false });
    const drawer = buildEscPosPayload({ content: "Ticket", openDrawer: true });
    expect(normal.includes(Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]))).toBe(false);
    expect(drawer.includes(Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]))).toBe(true);
  });

  it("selects CP437 and Windows-1252 explicitly without claiming UTF-8 mode", () => {
    const cp437 = buildEscPosPayload({ content: "Català €", codePage: "cp437" });
    const windows = buildEscPosPayload({ content: "Català €", codePage: "windows1252" });
    expect([...cp437.subarray(0, 5)]).toEqual([0x1b, 0x40, 0x1b, 0x74, 0]);
    expect([...windows.subarray(0, 5)]).toEqual([0x1b, 0x40, 0x1b, 0x74, 16]);
    expect(cp437.includes(Buffer.from("?"))).toBe(true);
    expect(windows.includes(iconv.encode("Català €", "windows1252"))).toBe(true);
  });

  it("keeps a realistic 40-line certification ticket under the payload limit", () => {
    const content = Array.from(
      { length: 40 },
      (_, index) => `${index + 1}. Niño · Cafè · Modificador · 10€`,
    ).join("\n");
    const payload = buildEscPosPayload({ content, codePage: "cp858" });
    expect(payload.byteLength).toBeLessThan(MAX_ESC_POS_PAYLOAD_BYTES);
    expect(payload.includes(iconv.encode("Niño", "cp858"))).toBe(true);
  });

  it("repeats a complete marked payload for each configured copy", () => {
    const one = buildEscPosPayload({ content: "REENVIADO", copies: 1 });
    const three = buildEscPosPayload({ content: "REENVIADO", copies: 3 });
    expect(three.byteLength).toBe(one.byteLength * 3);
  });

  it("rejects unsafe copies and oversized jobs before network I/O", () => {
    expect(() => buildEscPosPayload({ content: "x", copies: 0 })).toThrow("PRINT_COPIES_INVALID");
    expect(() => buildEscPosPayload({
      content: "x".repeat(MAX_ESC_POS_PAYLOAD_BYTES + 1),
    })).toThrow("PRINT_PAYLOAD_TOO_LARGE");
  });
});
