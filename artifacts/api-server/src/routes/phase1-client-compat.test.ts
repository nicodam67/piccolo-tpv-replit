import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../../..");
const legacy = fs.readFileSync(path.join(root, "lib/api-client-react/src/generated/api.ts"), "utf8");
const generated = fs.readFileSync(path.join(root, "lib/api-client-react/src/phase1-generated/api.ts"), "utf8");
const compatibility = fs.readFileSync(path.join(root, "lib/api-client-react/src/phase1-compat.ts"), "utf8");
const migratedHooks = [
  "useUpdateOrder", "useUpdateOrderItem", "useDuplicateOrderItem", "useGetOrderAudit",
  "useCreatePrefacturaPrint", "useGetPrefacturaStatus", "useGetTableHistory",
  "useGetOccupationSummary", "useGetAlertConfig", "usePatchAlertConfig", "useCleanTable",
  "useBlockTable", "useTransferTable", "useMergeTables", "useSeparateTable", "useMoveItems",
  "useTransferWaiter", "useResendKitchenTask", "useGetKdsHistory",
];

describe("phase-one generated client compatibility", () => {
  it("removes each migrated manual hook and re-exports its generated equivalent", () => {
    for (const hook of migratedHooks) {
      expect(legacy).not.toMatch(new RegExp(`export (?:const|function) ${hook}\\b`));
      expect(generated).toMatch(new RegExp(`export (?:const|function) ${hook}\\b`));
      expect(compatibility).toMatch(
        hook === "useBlockTable" ? /export function useBlockTable\b/ : new RegExp(`\\b${hook},`),
      );
    }
  });

  it("keeps the remaining manual-domain boundary explicit for later phases", () => {
    expect(legacy).toContain("NEW ENDPOINTS ADDED MANUALLY");
    expect(legacy).toContain("useGetBusinessConfig");
  });
});
