import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const legacyPath = path.join(root, "lib/api-client-react/src/generated/api.ts");
const legacySchemasPath = path.join(root, "lib/api-client-react/src/generated/api.schemas.ts");
const generatedPath = path.join(root, "lib/api-client-react/src/crm-generated/api.ts");
const generatedSchemasPath = path.join(root, "lib/api-client-react/src/crm-generated/api.schemas.ts");
const compatPath = path.join(root, "lib/api-client-react/src/crm-compat.ts");

const allowedOperations = [
  "getCrmClientHistory",
  "getCrmLoyaltyConfig",
  "updateCrmLoyaltyConfig",
  "validateCrmPromotion",
  "createCrmPromotion",
  "getCrmPromotions",
  "rechargeCrmGiftCard",
  "payWithCrmGiftCard",
  "createCrmGiftCard",
  "getCrmGiftCards",
  "redeemCrmPoints",
  "issueCrmPoints",
  "updateCrmClient",
  "createCrmClient",
  "getCrmClients",
  "getCrmClient",
  "getCrmReports",
];

const legacySchemaNames = new Set([
  "CrmClient",
  "CreateCrmClientInput",
  "UpdateCrmClientInput",
  "CrmLoyaltyConfig",
  "UpdateCrmLoyaltyConfigInput",
  "CrmLoyaltyPoint",
  "IssueCrmPointsInput",
  "RedeemCrmPointsInput",
  "CrmGiftCard",
  "CreateCrmGiftCardInput",
  "RechargeCrmGiftCardInput",
  "PayWithCrmGiftCardInput",
  "CrmPromotion",
  "CreateCrmPromotionInput",
  "ValidateCrmPromotionInput",
  "ValidateCrmPromotionResult",
  "CrmClientHistory",
  "CrmReports",
  "GetCrmClientsParams",
  "GetCrmGiftCardsParams",
]);

const schemaExportNames = new Set([
  "CrmClient",
  "CrmClientConflictError",
  "CrmClientConflictErrorClienteExistente",
  "CreateCrmClientInput",
  "UpdateCrmClientInput",
  "CrmClientHistory",
  "CrmClientHistoryOrderSummary",
  "CrmClientHistoryStats",
  "CrmLoyaltyConfig",
  "UpdateCrmLoyaltyConfigInput",
  "CrmLoyaltyPoint",
  "IssueCrmPointsInput",
  "RedeemCrmPointsInput",
  "RedeemCrmPointsResult",
  "CrmGiftCard",
  "CreateCrmGiftCardInput",
  "RechargeCrmGiftCardInput",
  "PayWithCrmGiftCardInput",
  "PayWithCrmGiftCardResult",
  "CrmPromotion",
  "CreateCrmPromotionInput",
  "ValidateCrmPromotionInput",
  "ValidateCrmPromotionResult",
  "CrmReports",
  "GetCrmClientsParams",
  "GetCrmGiftCardsParams",
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
  for (const operation of allowedOperations) {
    const op = operation.toLowerCase();
    if (!normalized.includes(op)) continue;
    if (operation === "getCrmClient") {
      if (normalized.includes("getcrmclients")) continue;
      if (normalized.includes("getcrmclienthistory")) continue;
      if (normalized.includes("crmclientpoints")) continue;
      if (normalized.includes("crmclientwallet")) continue;
      if (normalized.includes("crmclientconsents")) continue;
    }
    if (operation === "getCrmGiftCards") {
      if (/getcrmgiftcard[^s]/i.test(normalized)) continue;
      if (normalized.includes("lookupcrmgiftcard")) continue;
      if (normalized.includes("blockcrmgiftcard")) continue;
    }
    return true;
  }
  return false;
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
const adapters = new Set(["useIssueCrmPoints", "useRedeemCrmPoints", "issueCrmPoints", "redeemCrmPoints"]);
if (!generatedExports.length) throw new Error("No CRM exports were generated");

const legacySource = fs.readFileSync(legacyPath, "utf8");
const legacyFile = ts.createSourceFile(legacyPath, legacySource, ts.ScriptTarget.Latest, true);
const removable = legacyFile.statements.filter((statement) =>
  declarations(statement).some((name) => generatedExports.includes(name) || adapters.has(name)));
let migrated = legacySource;
for (const statement of removable.sort((a, b) => b.getFullStart() - a.getFullStart())) {
  migrated = migrated.slice(0, statement.getFullStart()) + migrated.slice(statement.end);
}
fs.writeFileSync(legacyPath, migrated.replace(/\n{4,}/g, "\n\n\n").replace(/\/\/ ─── CRM hooks[\s\S]*$/m, "").trimEnd() + "\n");

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

const valueExports = generatedExports.filter((name) => !generatedTypes.has(name) && !adapters.has(name));
const typeExports = generatedExports.filter((name) => generatedTypes.has(name));

fs.writeFileSync(
  compatPath,
  `// Generated compatibility exports. Do not edit manually.\n`
  + `export {\n${valueExports.map((name) => `  ${name},`).join("\n")}\n} from "./crm-generated/api";\n`
  + `export type {\n${typeExports.map((name) => `  ${name},`).join("\n")}\n} from "./crm-generated/api";\n`
  + `export type {\n${schemaExports.map((name) => `  ${name},`).join("\n")}\n} from "./crm-generated/api.schemas";\n`
  + `import {\n`
  + `  issueCrmPoints as generatedIssueCrmPoints,\n`
  + `  redeemCrmPoints as generatedRedeemCrmPoints,\n`
  + `  useIssueCrmPoints as useGeneratedIssueCrmPoints,\n`
  + `  useRedeemCrmPoints as useGeneratedRedeemCrmPoints,\n`
  + `} from "./crm-generated/api";\n`
  + `import type { IssueCrmPointsInput, RedeemCrmPointsInput } from "./crm-generated/api.schemas";\n`
  + `import type { BodyType } from "./custom-fetch";\n\n`
  + `export function issueCrmPoints(\n`
  + `  clientId: string,\n`
  + `  data: BodyType<IssueCrmPointsInput>,\n`
  + `  options?: RequestInit,\n`
  + `) {\n`
  + `  return generatedIssueCrmPoints(clientId, data, options);\n`
  + `}\n\n`
  + `export function redeemCrmPoints(\n`
  + `  clientId: string,\n`
  + `  data: BodyType<RedeemCrmPointsInput>,\n`
  + `  options?: RequestInit,\n`
  + `) {\n`
  + `  return generatedRedeemCrmPoints(clientId, data, options);\n`
  + `}\n\n`
  + `export interface LegacyIssueCrmPointsVariables {\n`
  + `  clientId: string;\n`
  + `  data: BodyType<IssueCrmPointsInput>;\n`
  + `}\n\n`
  + `export interface LegacyRedeemCrmPointsVariables {\n`
  + `  clientId: string;\n`
  + `  data: BodyType<RedeemCrmPointsInput>;\n`
  + `}\n\n`
  + `type GeneratedIssueMutation = ReturnType<typeof useGeneratedIssueCrmPoints>;\n`
  + `type GeneratedRedeemMutation = ReturnType<typeof useGeneratedRedeemCrmPoints>;\n\n`
  + `export function useIssueCrmPoints(\n`
  + `  options?: Parameters<typeof useGeneratedIssueCrmPoints>[0],\n`
  + `): Omit<GeneratedIssueMutation, "mutate" | "mutateAsync"> & {\n`
  + `  mutate: (variables: LegacyIssueCrmPointsVariables, options?: Parameters<GeneratedIssueMutation["mutate"]>[1]) => void;\n`
  + `  mutateAsync: (variables: LegacyIssueCrmPointsVariables, options?: Parameters<GeneratedIssueMutation["mutateAsync"]>[1]) => ReturnType<GeneratedIssueMutation["mutateAsync"]>;\n`
  + `} {\n`
  + `  const generated = useGeneratedIssueCrmPoints(options);\n`
  + `  const map = ({ clientId, data }: LegacyIssueCrmPointsVariables) => ({ id: clientId, data });\n`
  + `  return {\n`
  + `    ...generated,\n`
  + `    mutate: (variables, mutationOptions) => generated.mutate(map(variables), mutationOptions),\n`
  + `    mutateAsync: (variables, mutationOptions) => generated.mutateAsync(map(variables), mutationOptions),\n`
  + `  };\n`
  + `}\n\n`
  + `export function useRedeemCrmPoints(\n`
  + `  options?: Parameters<typeof useGeneratedRedeemCrmPoints>[0],\n`
  + `): Omit<GeneratedRedeemMutation, "mutate" | "mutateAsync"> & {\n`
  + `  mutate: (variables: LegacyRedeemCrmPointsVariables, options?: Parameters<GeneratedRedeemMutation["mutate"]>[1]) => void;\n`
  + `  mutateAsync: (variables: LegacyRedeemCrmPointsVariables, options?: Parameters<GeneratedRedeemMutation["mutateAsync"]>[1]) => ReturnType<GeneratedRedeemMutation["mutateAsync"]>;\n`
  + `} {\n`
  + `  const generated = useGeneratedRedeemCrmPoints(options);\n`
  + `  const map = ({ clientId, data }: LegacyRedeemCrmPointsVariables) => ({ id: clientId, data });\n`
  + `  return {\n`
  + `    ...generated,\n`
  + `    mutate: (variables, mutationOptions) => generated.mutate(map(variables), mutationOptions),\n`
  + `    mutateAsync: (variables, mutationOptions) => generated.mutateAsync(map(variables), mutationOptions),\n`
  + `  };\n`
  + `}\n`,
);
console.log(
  `Removed ${removable.length} duplicate API declarations, ${removedSchemas} legacy schemas; `
  + `exported ${generatedExports.length} CRM symbols with 2 adapters.`,
);
