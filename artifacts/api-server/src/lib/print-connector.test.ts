import net from "node:net";
import iconv from "iconv-lite";
import { afterEach, describe, expect, it } from "vitest";
import { getPrinterStatus, sendToPrinter } from "./print-connector-sim.js";

const originalMode = process.env["PICCOLO_PRINT_CONNECTOR"];

afterEach(() => {
  if (originalMode === undefined) delete process.env["PICCOLO_PRINT_CONNECTOR"];
  else process.env["PICCOLO_PRINT_CONNECTOR"] = originalMode;
});

describe("ESC/POS TCP connector", () => {
  it("sends CP858 Spanish text and automatic cut over TCP", async () => {
    process.env["PICCOLO_PRINT_CONNECTOR"] = "network";
    let resolvePayload!: (payload: Buffer) => void;
    const payloadPromise = new Promise<Buffer>((resolve) => { resolvePayload = resolve; });
    const server = net.createServer((socket) => {
      const chunks: Buffer[] = [];
      socket.on("data", (chunk) => chunks.push(chunk));
      socket.on("end", () => resolvePayload(Buffer.concat(chunks)));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing TCP test address");

    try {
      const result = await sendToPrinter({
        printerId: "test",
        printerIp: "127.0.0.1",
        printerPort: address.port,
        content: "España, niño, pingüino — 12,50 € — áéíóú",
        copies: 1,
      });
      const payload = await payloadPromise;
      expect(result).toEqual({ ok: true, simulated: false });
      expect(payload.subarray(0, 5)).toEqual(Buffer.from([0x1b, 0x40, 0x1b, 0x74, 0x13]));
      expect(payload.subarray(-3)).toEqual(Buffer.from([0x1d, 0x56, 0x00]));
      expect(iconv.decode(payload.subarray(5, -3), "cp858")).toContain("niño");
      expect(iconv.decode(payload.subarray(5, -3), "cp858")).toContain("€");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("reports a reachable printer as online", async () => {
    process.env["PICCOLO_PRINT_CONNECTOR"] = "network";
    const server = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing TCP test address");
    try {
      await expect(getPrinterStatus("test", {
        ip: "127.0.0.1",
        port: address.port,
      })).resolves.toMatchObject({ status: "online", simulated: false });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
