import { SimulatorPrintConnector } from "./simulator";
import { TcpEscPosConnector } from "./tcp-escpos";
import type {
  PrintConnector,
  PrintConnectorMode,
  PrintConnectorSendArgs,
} from "./types";

const connectors: Record<PrintConnectorMode, PrintConnector> = {
  simulator: new SimulatorPrintConnector(),
  tcp: new TcpEscPosConnector(),
};

export function getPrintConnector(mode: PrintConnectorMode): PrintConnector {
  if (process.env.NODE_ENV === "production" && mode === "simulator") {
    throw new Error("PRINT_CONNECTOR_NOT_CONFIGURED");
  }
  return connectors[mode];
}

export async function sendToPrinter(args: PrintConnectorSendArgs) {
  const mode = args.connectorMode
    ?? (process.env.NODE_ENV === "production" ? "tcp" : "simulator");
  try {
    return await getPrintConnector(mode).send(args);
  } catch (error) {
    return {
      ok: false,
      simulated: mode === "simulator",
      retryable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getPrinterStatus(
  args: Pick<
    PrintConnectorSendArgs,
    "printerId" | "printerIp" | "printerPort" | "connectorMode" | "connectTimeoutMs"
  >,
) {
  const mode = args.connectorMode
    ?? (process.env.NODE_ENV === "production" ? "tcp" : "simulator");
  try {
    return await getPrintConnector(mode).status(args);
  } catch (error) {
    return {
      status: "unknown" as const,
      simulated: mode === "simulator",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export * from "./escpos-payload";
export * from "./tcp-escpos";
export type * from "./types";
