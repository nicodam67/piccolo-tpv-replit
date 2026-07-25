import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { collectHardwareReadiness } from "../../../../scripts/certify-hardware-readiness.mjs";
import { collectPhysicalPrintEvidence } from "../../../../scripts/certify-physical-print.mjs";

const root = path.resolve(import.meta.dirname, "../../../..");
const inventory = JSON.parse(fs.readFileSync(
  path.join(root, "docs/certification/entrega67-physical-certification.json"),
  "utf8",
));

describe("Entrega 67 physical certification boundary", () => {
  it("keeps every physical case pending until operator evidence exists", () => {
    expect(inventory.caseCount).toBe(inventory.cases.length);
    expect(inventory.caseCount).toBeGreaterThanOrEqual(35);
    expect(inventory.cases.every((entry: { status: string }) =>
      entry.status === "PENDING_PHYSICAL_CERTIFICATION")).toBe(true);
    expect(inventory.cases.filter((entry: { caseId: string }) =>
      /^TABLET-D[1-7]$/.test(entry.caseId))).toHaveLength(7);
  });

  it("collects seven read-only clients without exposing credentials or addresses", async () => {
    const token = "sensitive-certification-token";
    const fetchImpl = vi.fn(async (url: string) => {
      const pathname = new URL(url).pathname;
      const body = pathname.endsWith("/healthz")
        ? { status: "ok" }
        : pathname.endsWith("/production-departments")
          ? [{
            code: "cocina",
            outputMode: "kds",
            workflowProfile: "standard",
            printerIds: [],
            showInKdsNav: true,
          }]
          : pathname.endsWith("/admin/kds-stations")
            ? [{
              id: "station-secret-id",
              zoneType: "cocina",
              active: true,
              displayUrl: "http://private-host",
              lastPingAt: null,
            }]
            : pathname.endsWith("/production/printers")
              ? [{ id: "printer-secret-id", active: true, lastStatus: "online" }]
              : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const evidence = await collectHardwareReadiness({
      baseUrl: "https://cert.local/api",
      token,
      fetchImpl,
      concurrentClients: 7,
    });
    expect(evidence.sevenClientReadProbe.clients).toHaveLength(7);
    expect(evidence.globalStatus).toBe("PENDING_PHYSICAL_CERTIFICATION");
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain("private-host");
    expect(serialized).not.toContain("station-secret-id");
    expect(serialized).not.toContain("printer-secret-id");
  });

  it("requires explicit opt-in in physical print and storage harnesses", () => {
    const printHarness = fs.readFileSync(
      path.join(root, "scripts/certify-physical-print.mjs"),
      "utf8",
    );
    const storageHarness = fs.readFileSync(
      path.join(root, "artifacts/api-server/src/scripts/certify-backup-destinations.ts"),
      "utf8",
    );
    expect(printHarness).toContain("ALLOW_PHYSICAL_PRINT_TEST");
    expect(storageHarness).toContain("ALLOW_EXTERNAL_STORAGE_TEST");
    expect(printHarness).toContain("PENDING_PHYSICAL_CERTIFICATION");
    expect(storageHarness).toContain("PENDING_PHYSICAL_CERTIFICATION");
  });

  it("collects marked print profiles without exposing token or printer id", async () => {
    const token = "physical-print-secret-token";
    const printerId = "physical-printer-id";
    let sequence = 0;
    const createdJobs: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith("/test") && init?.method === "POST") {
        const jobId = `job-${++sequence}`;
        createdJobs.push(jobId);
        return new Response(JSON.stringify({
          ok: true,
          jobId,
          physicalStatus: "PENDING_PHYSICAL_CERTIFICATION",
        }), { status: 200 });
      }
      if (pathname.endsWith("/print-queue")) {
        return new Response(JSON.stringify(createdJobs.map((id) => ({
          id,
          status: "printed",
          attempts: 1,
          lastError: null,
        }))), { status: 200 });
      }
      if (pathname.endsWith("/print-audit")) {
        return new Response(JSON.stringify(createdJobs.map((id) => ({
          printQueueId: id,
          action: "sent",
        }))), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    const evidence = await collectPhysicalPrintEvidence({
      baseUrl: "https://cert.local/api",
      token,
      printerIds: [printerId],
      fetchImpl,
      pollTimeoutMs: 100,
    });
    expect(evidence.jobs).toHaveLength(7);
    expect(evidence.jobs.map((job) => job.profile)).toEqual(expect.arrayContaining([
      "charset",
      "long",
      "drawer",
      "multiple-1",
    ]));
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(printerId);
    expect(evidence.globalStatus).toBe("PENDING_PHYSICAL_CERTIFICATION");
  });
});
