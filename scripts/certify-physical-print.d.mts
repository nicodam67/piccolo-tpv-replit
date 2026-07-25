export interface PhysicalPrintEvidence {
  globalStatus: "PENDING_PHYSICAL_CERTIFICATION";
  jobs: Array<{
    profile: string;
    queueStatus: string;
    printerRef: string;
  }>;
}

export function collectPhysicalPrintEvidence(options: {
  baseUrl: string;
  token: string;
  printerIds: string[];
  fetchImpl?: typeof fetch;
  pollTimeoutMs?: number;
}): Promise<PhysicalPrintEvidence>;
