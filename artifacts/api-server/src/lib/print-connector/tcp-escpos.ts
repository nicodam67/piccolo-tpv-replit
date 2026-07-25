import net, { type Socket } from "node:net";
import { buildEscPosPayload } from "./escpos-payload";
import type {
  PrintConnector,
  PrintConnectorResult,
  PrintConnectorSendArgs,
  PrinterStatusResult,
} from "./types";

type SocketFactory = (options: net.NetConnectOpts) => Socket;

const RETRYABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
]);

function errorResult(error: unknown, startedAt: number): PrintConnectorResult {
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    simulated: false,
    retryable: RETRYABLE_CODES.has(code) || /timeout/i.test(message),
    error: code ? `${code}: ${message}` : message,
    durationMs: Date.now() - startedAt,
  };
}

export class TcpEscPosConnector implements PrintConnector {
  readonly mode = "tcp" as const;

  constructor(private readonly socketFactory: SocketFactory = net.createConnection) {}

  async send(args: PrintConnectorSendArgs): Promise<PrintConnectorResult> {
    const startedAt = Date.now();
    if (!args.printerIp || args.printerPort < 1 || args.printerPort > 65535) {
      return errorResult(new Error("PRINT_ADDRESS_INVALID"), startedAt);
    }

    let payload: Buffer;
    try {
      payload = buildEscPosPayload({
        content: args.content,
        copies: args.copies,
        codePage: args.codePage,
        cut: args.cutEnabled,
        openDrawer: args.drawerEnabled,
      });
    } catch (error) {
      return errorResult(error, startedAt);
    }

    return new Promise((resolve) => {
      const socket = this.socketFactory({ host: args.printerIp, port: args.printerPort });
      let settled = false;
      const finish = (result: PrintConnectorResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(connectTimer);
        socket.destroy();
        resolve(result);
      };
      const connectTimer = setTimeout(
        () => finish(errorResult(new Error("PRINT_CONNECT_TIMEOUT"), startedAt)),
        args.connectTimeoutMs ?? 5000,
      );

      socket.once("error", (error) => finish(errorResult(error, startedAt)));
      socket.once("connect", () => {
        clearTimeout(connectTimer);
        socket.setTimeout(args.writeTimeoutMs ?? 10000, () => {
          finish(errorResult(new Error("PRINT_WRITE_TIMEOUT"), startedAt));
        });
        socket.write(payload, (error) => {
          if (error) {
            finish(errorResult(error, startedAt));
            return;
          }
          socket.end(() => finish({
            ok: true,
            simulated: false,
            retryable: false,
            bytesSent: payload.byteLength,
            durationMs: Date.now() - startedAt,
          }));
        });
      });
    });
  }

  async status(args: Pick<
    PrintConnectorSendArgs,
    "printerId" | "printerIp" | "printerPort" | "connectTimeoutMs"
  >): Promise<PrinterStatusResult> {
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const socket = this.socketFactory({ host: args.printerIp, port: args.printerPort });
      let settled = false;
      const finish = (result: PrinterStatusResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(result);
      };
      const timer = setTimeout(() => finish({
        status: "unknown",
        simulated: false,
        error: "PRINT_STATUS_TIMEOUT",
      }), args.connectTimeoutMs ?? 3000);
      socket.once("error", (error) => finish({
        status: "offline",
        simulated: false,
        error: error.message,
      }));
      socket.once("connect", () => finish({
        status: "online",
        simulated: false,
        latencyMs: Date.now() - startedAt,
      }));
    });
  }
}
