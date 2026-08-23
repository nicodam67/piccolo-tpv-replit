/**
 * print-connector-sim.ts
 * ESC/POS connector with an explicit simulator fallback.
 *
 * `PICCOLO_PRINT_CONNECTOR=network` enables raw TCP printing (normally port
 * 9100). Any other value keeps development/simulator behaviour.
 *
 * API:
 *   sendToPrinter({ printerId, printerIp, printerPort, content, copies })
 *   → Promise<{ ok: boolean; simulated: true; error?: string }>
 *
 * getPrinterStatus(printerId)
 *   → Promise<PrinterStatusResult>
 */
import net from "node:net";
import iconv from "iconv-lite";

export type PrinterStatusCode =
  | "online"
  | "offline"
  | "paper_out"
  | "cover_open"
  | "error"
  | "unknown";

export interface PrinterStatusResult {
  status: PrinterStatusCode;
  simulated: boolean;
  error?: string;
}

export interface SendToPrinterArgs {
  printerId: string;
  printerIp: string;
  printerPort: number;
  content: string;
  copies: number;
}

// Simulate a random latency between min and max ms
function randomDelay(min: number, max: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, min + Math.random() * (max - min)));
}

// Simulated per-printer "health state" — rotates over time to enable testing
// failure and recovery scenarios without any real hardware.
const FAILURE_RATE = 0.12; // 12% chance of failure per send attempt
const NETWORK_TIMEOUT_MS = 4_000;

function networkMode(): boolean {
  return process.env["PICCOLO_PRINT_CONNECTOR"] === "network";
}

function escPosPayload(content: string, copies: number): Buffer {
  const initialize = Buffer.from([0x1b, 0x40]);
  const selectCp858 = Buffer.from([0x1b, 0x74, 0x13]);
  const cut = Buffer.from([0x1d, 0x56, 0x00]);
  const encoded = iconv.encode(`${content}\n\n\n`, "cp858");
  const copy = Buffer.concat([initialize, selectCp858, encoded, cut]);
  return Buffer.concat(Array.from(
    { length: Math.max(1, Math.min(5, copies)) },
    () => copy,
  ));
}

function sendNetwork(args: SendToPrinterArgs): Promise<{
  ok: boolean;
  simulated: false;
  error?: string;
}> {
  if (!args.printerIp) {
    return Promise.resolve({
      ok: false,
      simulated: false,
      error: "IP de impresora no configurada",
    });
  }
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: args.printerIp,
      port: args.printerPort || 9100,
    });
    let settled = false;
    const finish = (result: { ok: boolean; simulated: false; error?: string }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(NETWORK_TIMEOUT_MS);
    socket.once("connect", () => {
      socket.end(escPosPayload(args.content, args.copies), () => {
        finish({ ok: true, simulated: false });
      });
    });
    socket.once("timeout", () => finish({
      ok: false,
      simulated: false,
      error: `Timeout conectando con ${args.printerIp}:${args.printerPort}`,
    }));
    socket.once("error", (error) => finish({
      ok: false,
      simulated: false,
      error: error.message,
    }));
  });
}

export async function sendToPrinter(args: SendToPrinterArgs): Promise<{
  ok: boolean;
  simulated: boolean;
  error?: string;
}> {
  if (networkMode()) return sendNetwork(args);

  // Simulate network round-trip latency (200–800 ms)
  await randomDelay(200, 800);

  // Simulate random failures
  if (Math.random() < FAILURE_RATE) {
    const errors = [
      "Connection refused",
      "Printer offline",
      "Paper out",
      "Buffer overflow",
    ];
    return {
      ok: false,
      simulated: true,
      error: errors[Math.floor(Math.random() * errors.length)],
    };
  }

  return { ok: true, simulated: true };
}

export async function getPrinterStatus(
  printerId: string,
  network?: { ip: string; port: number },
): Promise<PrinterStatusResult> {
  if (networkMode()) {
    if (!network?.ip) {
      return { status: "unknown", simulated: false, error: "IP no configurada" };
    }
    return new Promise((resolve) => {
      const socket = net.createConnection({ host: network.ip, port: network.port || 9100 });
      let settled = false;
      const finish = (result: PrinterStatusResult) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(NETWORK_TIMEOUT_MS);
      socket.once("connect", () => finish({ status: "online", simulated: false }));
      socket.once("timeout", () => finish({
        status: "offline",
        simulated: false,
        error: "Timeout",
      }));
      socket.once("error", (error) => finish({
        status: "offline",
        simulated: false,
        error: error.message,
      }));
    });
  }

  await randomDelay(50, 200);

  // 85% chance: online; 15% chance: other status
  const roll = Math.random();
  let status: PrinterStatusCode;
  if (roll < 0.85)      status = "online";
  else if (roll < 0.90) status = "offline";
  else if (roll < 0.93) status = "paper_out";
  else if (roll < 0.96) status = "cover_open";
  else if (roll < 0.98) status = "error";
  else                  status = "unknown";

  // Suppress unused-variable lint — printerId used for future real connector
  void printerId;

  return { status, simulated: true };
}
