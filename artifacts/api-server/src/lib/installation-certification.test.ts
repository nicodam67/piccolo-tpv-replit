import { describe, expect, it } from "vitest";
import {
  PHYSICAL_CERTIFICATION_CASES,
  certificationSummary,
  mergeCertificationCases,
  renderCertificationHtml,
  sanitizeCertificationData,
  sanitizeCertificationText,
} from "./installation-certification";

describe("installation physical certification", () => {
  it("loads the canonical 39-case catalog without changing its physical boundary", () => {
    expect(PHYSICAL_CERTIFICATION_CASES).toHaveLength(39);
    expect(PHYSICAL_CERTIFICATION_CASES.every((entry) =>
      entry.status === "PENDING_PHYSICAL_CERTIFICATION")).toBe(true);
  });

  it("uses the newest append-only event and defaults absent cases to pending", () => {
    const now = new Date();
    const cases = mergeCertificationCases([
      {
        id: "new",
        testType: "entrega67:PRINT-LONG",
        result: "passed",
        notes: "Salida completa",
        performedBy: "Admin",
        performedAt: now,
        metadata: { evidence: ["photo-ref"] },
      },
      {
        id: "old",
        testType: "entrega67:PRINT-LONG",
        result: "failed",
        notes: "Viejo",
        performedBy: "Admin",
        performedAt: new Date(0),
        metadata: null,
      },
    ]);
    expect(cases.find((entry) => entry.caseId === "PRINT-LONG")).toMatchObject({
      status: "passed",
      notes: "Salida completa",
      performedAt: now.toISOString(),
    });
    expect(cases.find((entry) => entry.caseId === "KDS-FSM")?.status).toBe("pending");
    expect(certificationSummary(cases).status).toBe("pending");
  });

  it("redacts credentials, bearer tokens, IPs and MACs from evidence", () => {
    const scrubbed = sanitizeCertificationData({
      token: "raw-token",
      note: "Bearer abc.def 192.168.1.20 aa:bb:cc:dd:ee:ff password=hunter2",
      nested: { secretAccessKey: "secret" },
    });
    const serialized = JSON.stringify(scrubbed);
    expect(serialized).not.toContain("raw-token");
    expect(serialized).not.toContain("abc.def");
    expect(serialized).not.toContain("192.168.1.20");
    expect(serialized).not.toContain("aa:bb:cc:dd:ee:ff");
    expect(serialized).not.toContain("hunter2");
    expect(sanitizeCertificationText("<script>192.168.1.2</script>")).not.toContain("192.168.1.2");
  });

  it("renders a self-contained printable report and escapes operator notes", () => {
    const html = renderCertificationHtml({
      generatedAt: "2026-07-25T15:00:00.000Z",
      version: "1.2.0",
      configuration: { restaurantName: "Piccolo", nif: "B00000000" },
      devices: {
        mainComputers: 1,
        printers: 2,
        kds: 2,
        tablets: 7,
        connectedTablets: 7,
        storageTypes: ["nas"],
        details: [],
      },
      steps: [{
        label: "Impresoras",
        status: "warning",
        configured: ["TCP"],
        missing: [],
        errors: [],
      }],
      certification: {
        summary: { total: 1, status: "pending" },
        cases: [{
          caseId: "PRINT-LONG",
          area: "printing",
          status: "failed",
          performedBy: "Admin",
          performedAt: "2026-07-25",
          notes: "<script>alert(1)</script>",
        }],
      },
      incidents: [],
    }, true);
    expect(html).toContain("Informe de instalación y certificación física");
    expect(html).toContain("window.print()");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
