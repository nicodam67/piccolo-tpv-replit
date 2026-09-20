/**
 * print-connector-sim.ts
 * Simulated local print connector.
 *
 * In production this module will be replaced by an HTTP call to the
 * Windows/Linux local print service (running as a system tray process).
 * For now, it simulates latency and random failures to allow full testing
 * of the queue, retry, and fallback logic.
 *
 * API:
 *   sendToPrinter({ printerId, printerIp, printerPort, content, copies })
 *   → Promise<{ ok: boolean; simulated: true; error?: string }>
 *
 * getPrinterStatus(printerId)
 *   → Promise<PrinterStatusResult>
 */

export type PrinterStatusCode =
  | "online"
  | "offline"
  | "paper_out"
  | "cover_open"
  | "error"
  | "unknown";

export interface PrinterStatusResult {
  status: PrinterStatusCode;
  simulated: true;
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

export async function sendToPrinter(args: SendToPrinterArgs): Promise<{
  ok: boolean;
  simulated: true;
  error?: string;
}> {
  if (process.env["NODE_ENV"] === "production") {
    return {
      ok: false,
      simulated: true,
      error: "Conector de impresión no configurado",
    };
  }
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

export async function getPrinterStatus(printerId: string): Promise<PrinterStatusResult> {
  if (process.env["NODE_ENV"] === "production") {
    return { status: "unknown", simulated: true };
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
