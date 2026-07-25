import net from "node:net";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { getPrintConnector } from "./index";
import { TcpEscPosConnector } from "./tcp-escpos";

const originalNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

async function listen(server: net.Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as net.AddressInfo).port;
}

describe("TCP ESC/POS connector software transport", () => {
  it("writes a marked ESC/POS buffer to a real TCP socket", async () => {
    const chunks: Buffer[] = [];
    const server = net.createServer((socket) => {
      socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    });
    const port = await listen(server);
    try {
      const result = await new TcpEscPosConnector().send({
        printerId: "printer-1",
        printerIp: "127.0.0.1",
        printerPort: port,
        content: "*** REIMPRESIÓN ***\nCafé 10€",
        copies: 1,
        codePage: "cp858",
        cutEnabled: true,
        drawerEnabled: false,
        connectTimeoutMs: 1000,
        writeTimeoutMs: 1000,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(result.ok).toBe(true);
      expect(result.simulated).toBe(false);
      expect(result.bytesSent).toBeGreaterThan(20);
      expect(Buffer.concat(chunks).subarray(0, 2)).toEqual(Buffer.from([0x1b, 0x40]));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("reports connection refusal as retryable without claiming print success", async () => {
    const server = net.createServer();
    const port = await listen(server);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const result = await new TcpEscPosConnector().send({
      printerId: "printer-1",
      printerIp: "127.0.0.1",
      printerPort: port,
      content: "Ticket",
      copies: 1,
      connectTimeoutMs: 250,
      writeTimeoutMs: 250,
    });
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
  });

  it("times out a stalled connection and destroys the socket", async () => {
    const fake = new EventEmitter() as EventEmitter & {
      destroyed: boolean;
      destroy: () => void;
      setTimeout: () => void;
      write: () => boolean;
      end: () => void;
    };
    fake.destroyed = false;
    fake.destroy = () => { fake.destroyed = true; };
    fake.setTimeout = () => undefined;
    fake.write = () => true;
    fake.end = () => undefined;
    const connector = new TcpEscPosConnector(() => fake as unknown as net.Socket);
    const result = await connector.send({
      printerId: "printer-1",
      printerIp: "127.0.0.1",
      printerPort: 9100,
      content: "Ticket",
      copies: 1,
      connectTimeoutMs: 20,
      writeTimeoutMs: 20,
    });
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toContain("PRINT_CONNECT_TIMEOUT");
    expect(fake.destroyed).toBe(true);
  });

  it("keeps simulator fail-closed in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => getPrintConnector("simulator"))
      .toThrow("PRINT_CONNECTOR_NOT_CONFIGURED");
    expect(getPrintConnector("tcp").mode).toBe("tcp");
  });
});
