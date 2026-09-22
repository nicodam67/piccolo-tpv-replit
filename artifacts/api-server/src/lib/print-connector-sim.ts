/**
 * Printer transport adapters.
 *
 * `tcp` confirms only that the operating system accepted an ESC/POS socket
 * write. `windows_agent` delegates to a local agent and reports the explicit
 * confirmation level returned by it. Neither path claims physical printing
 * without device/operator acknowledgement.
 */
import net from "node:net";

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
  confirmationLevel: "simulated" | "reachable" | "agent";
  checkedAt: string;
  detail?: string;
}

export interface SendToPrinterArgs {
  printerId: string;
  printerIp: string;
  printerPort: number;
  content: string;
  copies: number;
  connectionType?: "simulation" | "tcp" | "windows_agent";
  agentUrl?: string | null;
  characterSet?: string;
  autoCut?: boolean;
  openCashDrawer?: boolean;
  dedupeKey?: string | null;
}

export interface PrinterSendResult {
  ok: boolean;
  simulated: boolean;
  confirmationLevel: "simulated" | "transport" | "spooler" | "device";
  error?: string;
}

const SPECIAL_BYTES: Record<string, number> = {
  "á": 160, "é": 130, "í": 161, "ó": 162, "ú": 163,
  "ñ": 164, "Ñ": 165, "ü": 129, "Ü": 154,
  "¿": 168, "¡": 173, "€": 213,
};

export function encodeEscPos(input: {
  content: string;
  characterSet?: string;
  autoCut?: boolean;
  openCashDrawer?: boolean;
}): Buffer {
  const codePage = input.characterSet === "cp437"
    ? 0
    : input.characterSet === "cp850" ? 2 : 19;
  const bytes: number[] = [0x1b, 0x40, 0x1b, 0x74, codePage];
  for (const char of `${input.content}\n\n`) {
    const point = char.codePointAt(0) ?? 63;
    bytes.push(point <= 127 ? point : SPECIAL_BYTES[char] ?? 63);
  }
  if (input.openCashDrawer) bytes.push(0x1b, 0x70, 0x00, 0x19, 0xfa);
  if (input.autoCut !== false) bytes.push(0x1d, 0x56, 0x00);
  return Buffer.from(bytes);
}

function sendTcp(
  args: SendToPrinterArgs,
  payload: Buffer,
): Promise<PrinterSendResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (result: PrinterSendResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(5_000);
    socket.once("timeout", () => finish({
      ok: false,
      simulated: false,
      confirmationLevel: "transport",
      error: "Tiempo de conexión agotado",
    }));
    socket.once("error", (error) => finish({
      ok: false,
      simulated: false,
      confirmationLevel: "transport",
      error: error.message,
    }));
    socket.connect(args.printerPort, args.printerIp, () => {
      const copies = Math.max(1, Math.min(10, args.copies || 1));
      socket.write(Buffer.concat(Array.from({ length: copies }, () => payload)), (error) => {
        if (error) {
          finish({
            ok: false,
            simulated: false,
            confirmationLevel: "transport",
            error: error.message,
          });
          return;
        }
        socket.end(() => finish({
          ok: true,
          simulated: false,
          confirmationLevel: "transport",
        }));
      });
    });
  });
}

async function sendToWindowsAgent(
  args: SendToPrinterArgs,
  payload: Buffer,
): Promise<PrinterSendResult> {
  if (!args.agentUrl) {
    return {
      ok: false,
      simulated: false,
      confirmationLevel: "spooler",
      error: "URL del agente no configurada",
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${args.agentUrl.replace(/\/$/, "")}/v1/print`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(process.env["PRINT_AGENT_TOKEN"]
          ? { Authorization: `Bearer ${process.env["PRINT_AGENT_TOKEN"]}` }
          : {}),
        ...(args.dedupeKey ? { "Idempotency-Key": args.dedupeKey } : {}),
      },
      body: JSON.stringify({
        printerId: args.printerId,
        payloadBase64: payload.toString("base64"),
        copies: Math.max(1, Math.min(10, args.copies || 1)),
      }),
    });
    const body = await response.json().catch(() => ({})) as {
      accepted?: boolean;
      confirmationLevel?: "spooler" | "device";
      error?: string;
    };
    if (!response.ok || !body.accepted) {
      return {
        ok: false,
        simulated: false,
        confirmationLevel: "spooler",
        error: body.error ?? `Agente HTTP ${response.status}`,
      };
    }
    return {
      ok: true,
      simulated: false,
      confirmationLevel: body.confirmationLevel === "device" ? "device" : "spooler",
    };
  } catch (error) {
    return {
      ok: false,
      simulated: false,
      confirmationLevel: "spooler",
      error: error instanceof Error ? error.message : "Agente no disponible",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendToPrinter(args: SendToPrinterArgs): Promise<PrinterSendResult> {
  const connectionType = args.connectionType ?? "simulation";
  if (connectionType === "simulation") {
    await new Promise(resolve => setTimeout(resolve, 10));
    return { ok: true, simulated: true, confirmationLevel: "simulated" };
  }
  const payload = encodeEscPos(args);
  if (connectionType === "windows_agent") return sendToWindowsAgent(args, payload);
  if (!args.printerIp) {
    return {
      ok: false,
      simulated: false,
      confirmationLevel: "transport",
      error: "IP no configurada",
    };
  }
  return sendTcp(args, payload);
}

export async function getPrinterStatus(
  printer: Pick<
    SendToPrinterArgs,
    "printerId" | "printerIp" | "printerPort" | "connectionType" | "agentUrl"
  >,
): Promise<PrinterStatusResult> {
  const checkedAt = new Date().toISOString();
  if ((printer.connectionType ?? "simulation") === "simulation") {
    return {
      status: "unknown",
      simulated: true,
      confirmationLevel: "simulated",
      checkedAt,
      detail: "Simulador: no representa estado físico",
    };
  }
  if (printer.connectionType === "windows_agent") {
    if (!printer.agentUrl) {
      return {
        status: "unknown",
        simulated: false,
        confirmationLevel: "agent",
        checkedAt,
        detail: "Agente no configurado",
      };
    }
    try {
      const response = await fetch(`${printer.agentUrl.replace(/\/$/, "")}/health`, {
        headers: process.env["PRINT_AGENT_TOKEN"]
          ? { Authorization: `Bearer ${process.env["PRINT_AGENT_TOKEN"]}` }
          : {},
        signal: AbortSignal.timeout(3_000),
      });
      return {
        status: response.ok ? "online" : "offline",
        simulated: false,
        confirmationLevel: "agent",
        checkedAt,
        detail: response.ok
          ? "Agente accesible; estado físico no confirmado"
          : `Agente HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        status: "offline",
        simulated: false,
        confirmationLevel: "agent",
        checkedAt,
        detail: error instanceof Error ? error.message : "Agente no disponible",
      };
    }
  }
  const probe = await sendTcp(
    {
      printerId: printer.printerId,
      printerIp: printer.printerIp,
      printerPort: printer.printerPort,
      content: "",
      copies: 1,
    },
    Buffer.alloc(0),
  );
  return {
    status: probe.ok ? "online" : "offline",
    simulated: false,
    confirmationLevel: "reachable",
    checkedAt,
    detail: probe.ok
      ? "Puerto accesible; papel impreso no confirmado"
      : probe.error,
  };
}
