import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../../..");
const inventory = JSON.parse(
  fs.readFileSync(
    path.join(root, "docs/inventories/entrega65-hardware-capabilities.json"),
    "utf8",
  ),
) as {
  allowedStatuses: string[];
  capabilityCount: number;
  capabilities: Array<Record<string, string>>;
};
const playbook = fs.readFileSync(
  path.join(root, "docs/operations/PICCOLO-INCIDENT-PLAYBOOK.md"),
  "utf8",
);
const certificationPlan = fs.readFileSync(
  path.join(root, "docs/PRODUCTION-CERTIFICATION-PLAN.md"),
  "utf8",
);

const requiredFields = [
  "component",
  "fileOrModule",
  "currentFunction",
  "protocol",
  "status",
  "evidence",
  "externalDependency",
  "availableTest",
  "pendingTest",
  "criticality",
  "decision",
];

describe("Entrega 65 hardware capability inventory", () => {
  it("is complete, deterministic and uses only declared statuses", () => {
    expect(inventory.capabilityCount).toBe(inventory.capabilities.length);
    expect(inventory.capabilityCount).toBeGreaterThanOrEqual(60);
    expect(new Set(inventory.capabilities.map((entry) => entry.component)).size)
      .toBe(inventory.capabilities.length);
    for (const entry of inventory.capabilities) {
      for (const field of requiredFields) expect(entry[field], `${entry.component}.${field}`).toBeTruthy();
      expect(inventory.allowedStatuses).toContain(entry.status);
    }
  });

  it("never labels simulators or unavailable connectors as physically validated", () => {
    const nonPhysical = inventory.capabilities.filter((entry) =>
      ["simulated", "fail-closed", "unsupported", "blocked-external"].includes(entry.status));
    expect(nonPhysical.length).toBeGreaterThan(0);
    for (const entry of nonPhysical) {
      expect(entry.decision).not.toMatch(/^(?:certified|production-ready)$/i);
    }
  });

  it("marks every explicitly physical test as pending certification", () => {
    const physical = inventory.capabilities.filter((entry) =>
      entry.pendingTest.startsWith("PENDING_PHYSICAL_CERTIFICATION"));
    expect(physical.length).toBeGreaterThanOrEqual(25);
  });

  it("contains no literal network addresses or embedded credentials", () => {
    const body = JSON.stringify(inventory);
    expect(body).not.toMatch(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    expect(body).not.toMatch(/-----BEGIN (?:CERTIFICATE|PRIVATE KEY)-----/);
    expect(body).not.toMatch(/(?:password|secret|token)\s*[:=]\s*["'][^"']+/i);
  });

  it("keeps all incident and physical-certification procedures explicit", () => {
    expect(playbook.match(/^## \d+\. /gm)).toHaveLength(20);
    for (const journey of ["A", "B", "C", "D", "E", "F"]) {
      expect(certificationPlan).toContain(`Jornada ${journey}`);
    }
    expect(certificationPlan).toContain("PENDING_PHYSICAL_CERTIFICATION");
    expect(certificationPlan).not.toMatch(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  });
});
