import {
  getPrinterStatus as getSimulatedPrinterStatus,
  sendToPrinter as sendSimulated,
} from "../print-connector-sim";
import type { PrintConnector, PrintConnectorSendArgs } from "./types";

export class SimulatorPrintConnector implements PrintConnector {
  readonly mode = "simulator" as const;

  async send(args: PrintConnectorSendArgs) {
    const result = await sendSimulated(args);
    return {
      ...result,
      retryable: !result.ok,
    };
  }

  async status(args: Pick<
    PrintConnectorSendArgs,
    "printerId" | "printerIp" | "printerPort" | "connectTimeoutMs"
  >) {
    return getSimulatedPrinterStatus(args.printerId);
  }
}
