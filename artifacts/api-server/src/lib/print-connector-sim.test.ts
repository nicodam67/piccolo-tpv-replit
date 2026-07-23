import { afterEach, describe, expect, it, vi } from "vitest";
import { sendToPrinter } from "./print-connector-sim";

afterEach(() => vi.restoreAllMocks());

describe("local print connector idempotency", () => {
  it("acknowledges a repeated queue job without printing it twice", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const request = {
      idempotencyKey: crypto.randomUUID(),
      printerId: "printer-1",
      printerIp: "127.0.0.1",
      printerPort: 9100,
      content: "COMANDA",
      copies: 1,
    };

    expect(await sendToPrinter(request)).toMatchObject({ ok: true });
    expect(await sendToPrinter(request)).toEqual({
      ok: true,
      simulated: true,
      duplicate: true,
    });
  });

  it("coalesces concurrent deliveries of the same queue job", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const request = {
      idempotencyKey: crypto.randomUUID(),
      printerId: "printer-1",
      printerIp: "127.0.0.1",
      printerPort: 9100,
      content: "COMANDA",
      copies: 1,
    };

    const [first, second] = await Promise.all([
      sendToPrinter(request),
      sendToPrinter(request),
    ]);

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true, duplicate: true });
  });
});
