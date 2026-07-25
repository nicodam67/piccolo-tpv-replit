import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const legacyPath = path.join(root, "lib/api-client-react/src/generated/api.ts");
const legacySchemasPath = path.join(root, "lib/api-client-react/src/generated/api.schemas.ts");
const generatedPath = path.join(root, "lib/api-client-react/src/catalog-admin-generated/api.ts");
const compatPath = path.join(root, "lib/api-client-react/src/catalog-admin-compat.ts");

const operationIds = [
  "getCategories", "getCategoryProducts", "getProductModifiers", "getProductFormats",
  "getAdminCategories", "createAdminCategory", "updateAdminCategory", "deleteAdminCategory",
  "createSubcategory", "updateSubcategory", "deleteSubcategory",
  "getAdminProducts", "createAdminProduct", "updateAdminProduct", "deleteAdminProduct",
  "createProductFormat", "createProductFormatFull", "updateProductFormat", "updateProductFormatFull",
  "deleteProductFormat", "assignProductModifierGroups",
  "getAdminModifierGroups", "createAdminModifierGroup", "updateAdminModifierGroup", "deleteAdminModifierGroup",
  "createAdminModifier", "updateAdminModifier", "deleteAdminModifier",
  "importProducts", "downloadProductExport", "updateAdminProductTaxRate", "updateProductFormatTaxRate",
  "searchCatalogProducts",
];

const legacySchemaNames = new Set([
  "Category", "Product", "ProductFormat", "ModifierGroup", "ModifierOption",
  "AdminProduct", "AdminCategory", "Subcategory", "AdminModifierGroup", "AdminModifier",
  "CreateCategoryInput", "UpdateCategoryInput", "CreateSubcategoryInput", "UpdateSubcategoryInput",
  "CreateProductInput", "UpdateProductInput", "CreateProductFormatInput", "UpdateProductFormatInput",
  "CreateProductFormatFullInput", "UpdateProductFormatFullInput",
  "CreateModifierGroupInput", "UpdateModifierGroupInput", "CreateModifierInput", "UpdateModifierInput",
  "UpdateProductTaxRateInput", "ImportResult",
]);

const compatSymbols = [
  "useGetCategories", "useGetCategoryProducts", "useGetProductModifiers", "useGetProductFormats",
  "useGetAdminCategories", "useCreateAdminCategory", "useUpdateAdminCategory", "useDeleteAdminCategory",
  "useCreateSubcategory", "useUpdateSubcategory", "useDeleteSubcategory",
  "useGetAdminProducts", "useCreateAdminProduct", "useUpdateAdminProduct", "useDeleteAdminProduct",
  "useCreateProductFormatFull", "useUpdateProductFormatFull", "useDeleteProductFormat",
  "useAssignProductModifierGroups", "useGetAdminModifierGroups",
  "useCreateAdminModifierGroup", "useUpdateAdminModifierGroup", "useDeleteAdminModifierGroup",
  "useCreateAdminModifier", "useUpdateAdminModifier", "useDeleteAdminModifier",
  "useImportProducts", "useUpdateAdminProductTaxRate", "useUpdateProductFormatTaxRate",
  "downloadProductExport", "getGetAdminCategoriesQueryKey", "getGetAdminProductsQueryKey",
  "getGetAdminModifierGroupsQueryKey", "getGetCategoryProductsQueryKey", "getGetProductModifiersQueryKey",
  "recalculateAndFetchProductAllergens", "allergenCodesForLegacyTextField", "patchProductSoldout",
  "searchCatalogProducts",
];

function declarations(statement) {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations
      .map((declaration) => ts.isIdentifier(declaration.name) ? declaration.name.text : "")
      .filter(Boolean);
  }
  if (
    ts.isFunctionDeclaration(statement) || ts.isTypeAliasDeclaration(statement)
    || ts.isInterfaceDeclaration(statement) || ts.isModuleDeclaration(statement)
  ) return statement.name ? [statement.name.text] : [];
  return [];
}

function belongs(name) {
  const normalized = name.toLowerCase();
  return operationIds.some((operation) => normalized.includes(operation.toLowerCase()));
}

function pruneLegacySchemas(sourcePath, names) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
  const removable = file.statements.filter((statement) =>
    (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement))
    && names.has(statement.name.text));
  let migrated = source;
  for (const statement of removable.sort((a, b) => b.getFullStart() - a.getFullStart())) {
    migrated = migrated.slice(0, statement.getFullStart()) + migrated.slice(statement.end);
  }
  fs.writeFileSync(sourcePath, migrated.replace(/\n{4,}/g, "\n\n\n"));
  return removable.length;
}

const generatedSource = fs.readFileSync(generatedPath, "utf8");
const generatedFile = ts.createSourceFile(generatedPath, generatedSource, ts.ScriptTarget.Latest, true);
const generatedExports = generatedFile.statements.flatMap(declarations).filter(belongs).sort();

const legacySource = fs.readFileSync(legacyPath, "utf8");
const legacyFile = ts.createSourceFile(legacyPath, legacySource, ts.ScriptTarget.Latest, true);
const removable = legacyFile.statements.filter((statement) =>
  declarations(statement).some((name) => belongs(name) || compatSymbols.includes(name)));
let migrated = legacySource;
for (const statement of removable.sort((a, b) => b.getFullStart() - a.getFullStart())) {
  migrated = migrated.slice(0, statement.getFullStart()) + migrated.slice(statement.end);
}
fs.writeFileSync(legacyPath, migrated.replace(/\n{4,}/g, "\n\n\n"));

const removedSchemas = pruneLegacySchemas(legacySchemasPath, legacySchemaNames);

const compatBody = fs.readFileSync(compatPath, "utf8");
if (!compatBody.includes("Entrega 60")) {
  throw new Error("catalog-admin-compat.ts must exist before running migration script");
}

console.log(
  `Removed ${removable.length} duplicate Catalog Admin API declarations, ${removedSchemas} legacy schemas; `
  + `generated catalog exports retained: ${generatedExports.length}.`,
);
