import { describe, expect, it } from "vitest";
import {
  resolveEffectiveChannels,
  transitionsForDepartment,
} from "./production-departments";

const department = (outputMode: "none" | "kds" | "printer" | "both", workflowProfile = "standard") => ({
  outputMode,
  workflowProfile: workflowProfile as any,
});

describe("production department channel resolution", () => {
  it.each([
    ["both", "both", true, true],
    ["both", "kds", true, false],
    ["both", "printer", false, true],
    ["both", "none", false, false],
    ["kds_only", "both", true, false],
    ["kds_only", "printer", false, false],
    ["printers_only", "both", false, true],
    ["printers_only", "kds", false, false],
  ] as const)(
    "global %s and department %s resolve to kds=%s printer=%s",
    (globalMode, outputMode, kds, printer) => {
      expect(resolveEffectiveChannels(department(outputMode), globalMode))
        .toEqual({ kds, printer });
    },
  );

  it("never creates KDS work for the none workflow profile", () => {
    expect(resolveEffectiveChannels(department("both", "none"), "both"))
      .toEqual({ kds: false, printer: true });
  });

  it("uses workflow profiles instead of hardcoded department names", () => {
    expect(transitionsForDepartment({ workflowProfile: "pizza" }).preparing)
      .toContain("in_oven");
    expect(transitionsForDepartment({ workflowProfile: "bar" }).ready)
      .toEqual(["collected"]);
    expect(transitionsForDepartment({ workflowProfile: "standard" }).preparing)
      .toEqual(["ready", "cancelled"]);
  });
});
