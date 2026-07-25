import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../../..");
const legacy = fs.readFileSync(path.join(root, "lib/api-client-react/src/generated/api.ts"), "utf8");
const compatibility = fs.readFileSync(path.join(root, "lib/api-client-react/src/catalog-admin-compat.ts"), "utf8");

const hooks = [
  "useGetCategories", "useGetCategoryProducts", "useGetProductModifiers", "useGetProductFormats",
  "useGetAdminCategories", "useCreateAdminCategory", "useUpdateAdminCategory", "useDeleteAdminCategory",
  "useCreateSubcategory", "useUpdateSubcategory", "useDeleteSubcategory",
  "useGetAdminProducts", "useCreateAdminProduct", "useUpdateAdminProduct", "useDeleteAdminProduct",
  "useCreateProductFormatFull", "useUpdateProductFormatFull", "useDeleteProductFormat",
  "useAssignProductModifierGroups", "useGetAdminModifierGroups",
  "useCreateAdminModifierGroup", "useUpdateAdminModifierGroup", "useDeleteAdminModifierGroup",
  "useCreateAdminModifier", "useUpdateAdminModifier", "useDeleteAdminModifier",
  "useImportProducts", "useUpdateAdminProductTaxRate", "useUpdateProductFormatTaxRate",
];

describe("catalog-admin generated client compatibility", () => {
  it("replaces manual catalog hooks with compatibility exports", () => {
    for (const hook of hooks) {
      expect(legacy).not.toMatch(new RegExp(`export (?:const|function) ${hook}\\b`));
      expect(compatibility).toMatch(new RegExp(`\\b${hook}\\b`));
    }
  });

  it("keeps unrelated manual domains intact", () => {
    expect(legacy).toContain("useGetBusinessConfig");
    expect(legacy).toContain("useGetProductRecipe");
    expect(legacy).toContain("useGetProductAvailability");
  });
});
