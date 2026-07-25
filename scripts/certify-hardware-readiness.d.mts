export interface HardwareReadinessEvidence {
  globalStatus: "PENDING_PHYSICAL_CERTIFICATION";
  sevenClientReadProbe: { clients: unknown[] };
}

export function collectHardwareReadiness(options: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  concurrentClients?: number;
}): Promise<HardwareReadinessEvidence>;
