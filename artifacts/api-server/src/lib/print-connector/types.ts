export type PrintConnectorMode = "simulator" | "tcp";
export type PrintCodePage = "cp858" | "cp437" | "windows1252";

export interface PrintConnectorSendArgs {
  printerId: string;
  printerIp: string;
  printerPort: number;
  content: string;
  copies: number;
  connectorMode?: PrintConnectorMode;
  codePage?: PrintCodePage;
  cutEnabled?: boolean;
  drawerEnabled?: boolean;
  connectTimeoutMs?: number;
  writeTimeoutMs?: number;
}

export interface PrintConnectorResult {
  ok: boolean;
  simulated: boolean;
  retryable: boolean;
  error?: string;
  bytesSent?: number;
  durationMs?: number;
}

export interface PrinterStatusResult {
  status: "online" | "offline" | "paper_out" | "cover_open" | "error" | "unknown";
  simulated: boolean;
  latencyMs?: number;
  error?: string;
}

export interface PrintConnector {
  readonly mode: PrintConnectorMode;
  send(args: PrintConnectorSendArgs): Promise<PrintConnectorResult>;
  status(args: Pick<
    PrintConnectorSendArgs,
    "printerId" | "printerIp" | "printerPort" | "connectTimeoutMs"
  >): Promise<PrinterStatusResult>;
}
