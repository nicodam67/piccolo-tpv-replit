import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const legacyPath = path.join(root, "lib/api-client-react/src/generated/api.ts");
const legacySchemasPath = path.join(root, "lib/api-client-react/src/generated/api.schemas.ts");
const generatedPath = path.join(root, "lib/api-client-react/src/branding-generated/api.ts");
const generatedSchemasPath = path.join(root, "lib/api-client-react/src/branding-generated/api.schemas.ts");
const compatPath = path.join(root, "lib/api-client-react/src/branding-compat.ts");
const operationIds = [
  "getPublicBranding",
  "getAdminBranding",
  "patchAdminBranding",
  "getAdminQrBranding",
  "putAdminQrBranding",
];
const legacySchemaNames = new Set(["PublicBranding", "BrandingInput"]);
const schemaExportNames = new Set([
  "AdminBranding",
  "BrandingCardSettings",
  "BrandingCardSettingsLayout",
  "BrandingInput",
  "BrandingThemeColors",
  "BrandingThemeFonts",
  "OpeningHours",
  "OpeningHoursDay",
  "PublicBrandingResponse",
  "QrBranding",
  "QrBrandingOkResponse",
  "QrDaySchedule",
  "QrNotConfiguredError",
  "QrNotConfiguredErrorCode",
  "QrShift",
  "UpdateQrBrandingInput",
]);

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
    ts.isInterfaceDeclaration(statement) && names.has(statement.name.text));
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
const generatedTypes = new Set(
  generatedFile.statements
    .filter((statement) => ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement))
    .flatMap(declarations)
    .filter(belongs),
);
if (!generatedExports.length) throw new Error("No Branding exports were generated");

const legacySource = fs.readFileSync(legacyPath, "utf8");
const legacyFile = ts.createSourceFile(legacyPath, legacySource, ts.ScriptTarget.Latest, true);
const removable = legacyFile.statements.filter((statement) =>
  declarations(statement).some((name) => generatedExports.includes(name)));
let migrated = legacySource;
for (const statement of removable.sort((a, b) => b.getFullStart() - a.getFullStart())) {
  migrated = migrated.slice(0, statement.getFullStart()) + migrated.slice(statement.end);
}
fs.writeFileSync(legacyPath, migrated.replace(/\n{4,}/g, "\n\n\n"));

const removedSchemas = pruneLegacySchemas(legacySchemasPath, legacySchemaNames);

const generatedSchemaSource = fs.readFileSync(generatedSchemasPath, "utf8");
const generatedSchemaFile = ts.createSourceFile(
  generatedSchemasPath, generatedSchemaSource, ts.ScriptTarget.Latest, true,
);
const schemaExports = [...new Set(generatedSchemaFile.statements
  .flatMap((statement) => {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      return statement.name ? [statement.name.text] : [];
    }
    return [];
  })
  .filter((name) => schemaExportNames.has(name)))].sort();

fs.writeFileSync(
  compatPath,
  `// Generated compatibility exports. Do not edit manually.\n`
  + `export {\n${generatedExports.filter((name) => !generatedTypes.has(name)).map((name) => `  ${name},`).join("\n")}\n} from "./branding-generated/api";\n`
  + `export type {\n${generatedExports.filter((name) => generatedTypes.has(name)).map((name) => `  ${name},`).join("\n")}\n} from "./branding-generated/api";\n`
  + `export type {\n${schemaExports.map((name) => `  ${name},`).join("\n")}\n} from "./branding-generated/api.schemas";\n`,
);
console.log(
  `Removed ${removable.length} duplicate API declarations, ${removedSchemas} legacy schemas; `
  + `exported ${generatedExports.length} Branding symbols.`,
);
