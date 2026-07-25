import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../../..");
const legacy = fs.readFileSync(path.join(root, "lib/api-client-react/src/generated/api.ts"), "utf8");
const generated = fs.readFileSync(path.join(root, "lib/api-client-react/src/documents-generated/api.ts"), "utf8");
const compatibility = fs.readFileSync(path.join(root, "lib/api-client-react/src/documents-compat.ts"), "utf8");
const hooks = [
  "useGetDocumentTemplates", "useCreateDocumentTemplate", "useUpdateDocumentTemplate",
  "useDeleteDocumentTemplate", "useActivateDocumentTemplate", "useDuplicateDocumentTemplate",
  "useGetPrinterConfigs", "useCreatePrinterConfig", "useUpdatePrinterConfig",
  "useDeletePrinterConfig", "useCreateInvoice", "useGetInvoice", "useRectifyInvoice",
  "useGetClients", "useCreateClient", "useUpdateClient", "useCreateReprint",
  "useGetDocumentAuditLog",
];

describe("Documents generated client compatibility", () => {
  it("replaces all 18 manual hooks with generated compatibility exports", () => {
    for (const hook of hooks) {
      expect(legacy).not.toMatch(new RegExp(`export (?:const|function) ${hook}\\b`));
      expect(generated).toMatch(new RegExp(`export (?:const|function) ${hook}\\b`));
      expect(compatibility).toMatch(new RegExp(`\\b${hook},`));
    }
  });

  it("keeps unrelated manual domains intact", () => {
    expect(legacy).toContain("NEW ENDPOINTS ADDED MANUALLY");
    expect(legacy).toContain("useGetBusinessConfig");
  });
});
