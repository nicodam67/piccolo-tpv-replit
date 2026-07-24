import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const generatedPath = path.join(root, "lib/api-client-react/src/wallet-generated/api.ts");
const generatedSchemasPath = path.join(root, "lib/api-client-react/src/wallet-generated/api.schemas.ts");
const compatPath = path.join(root, "lib/api-client-react/src/wallet-compat.ts");
const crmCompatPath = path.join(root, "lib/api-client-react/src/crm-compat.ts");

const allowedOperations = [
  "getCrmClientWallet",
  "addCrmWalletBalance",
  "payWithCrmWallet",
  "adjustCrmWallet",
  "lookupCrmGiftCard",
  "blockCrmGiftCard",
  "getCrmGiftCard",
  "rechargeCrmGiftCard",
  "payWithCrmGiftCard",
  "createCrmGiftCard",
  "getCrmGiftCards",
];

const schemaExportNames = new Set([
  "CrmGiftCard",
  "CrmGiftCardTransaction",
  "CrmGiftCardDetail",
  "CreateCrmGiftCardInput",
  "RechargeCrmGiftCardInput",
  "PayWithCrmGiftCardInput",
  "PayWithCrmGiftCardResult",
  "LookupCrmGiftCardParams",
  "GetCrmGiftCardsParams",
  "CrmWallet",
  "CrmWalletTransaction",
  "CrmWalletDetail",
  "WalletAddInput",
  "WalletPayInput",
  "WalletPayResult",
  "WalletAdjustInput",
]);

const giftCardSymbols = new Set([
  "createCrmGiftCard",
  "getCreateCrmGiftCardMutationOptions",
  "getCreateCrmGiftCardUrl",
  "getCrmGiftCards",
  "getGetCrmGiftCardsQueryKey",
  "getGetCrmGiftCardsQueryOptions",
  "getGetCrmGiftCardsUrl",
  "getPayWithCrmGiftCardMutationOptions",
  "getPayWithCrmGiftCardUrl",
  "getRechargeCrmGiftCardMutationOptions",
  "getRechargeCrmGiftCardUrl",
  "payWithCrmGiftCard",
  "rechargeCrmGiftCard",
  "useCreateCrmGiftCard",
  "useGetCrmGiftCards",
  "usePayWithCrmGiftCard",
  "useRechargeCrmGiftCard",
  "CreateCrmGiftCardMutationBody",
  "CreateCrmGiftCardMutationError",
  "CreateCrmGiftCardMutationResult",
  "GetCrmGiftCardsQueryError",
  "GetCrmGiftCardsQueryResult",
  "PayWithCrmGiftCardMutationBody",
  "PayWithCrmGiftCardMutationError",
  "PayWithCrmGiftCardMutationResult",
  "RechargeCrmGiftCardMutationBody",
  "RechargeCrmGiftCardMutationError",
  "RechargeCrmGiftCardMutationResult",
  "CreateCrmGiftCardInput",
  "CrmGiftCard",
  "GetCrmGiftCardsParams",
  "PayWithCrmGiftCardInput",
  "PayWithCrmGiftCardResult",
  "RechargeCrmGiftCardInput",
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
    if (operation === "getCrmGiftCard") {
      if (normalized.includes("getcrmgiftcards")) continue;
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

const generatedSource = fs.readFileSync(generatedPath, "utf8");
const generatedFile = ts.createSourceFile(generatedPath, generatedSource, ts.ScriptTarget.Latest, true);
const generatedExports = generatedFile.statements.flatMap(declarations).filter(belongs).sort();
const generatedTypes = new Set(
  generatedFile.statements
    .filter((statement) => ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement))
    .flatMap(declarations)
    .filter(belongs),
);
if (!generatedExports.length) throw new Error("No Wallet exports were generated");

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
  + `export {\n${generatedExports.filter((name) => !generatedTypes.has(name)).map((name) => `  ${name},`).join("\n")}\n} from "./wallet-generated/api";\n`
  + `export type {\n${generatedExports.filter((name) => generatedTypes.has(name)).map((name) => `  ${name},`).join("\n")}\n} from "./wallet-generated/api";\n`
  + `export type {\n${schemaExports.map((name) => `  ${name},`).join("\n")}\n} from "./wallet-generated/api.schemas";\n`,
);

if (fs.existsSync(crmCompatPath)) {
  const crmCompat = fs.readFileSync(crmCompatPath, "utf8");
  const pruneLine = (line) => {
    const match = line.match(/^\s{2}([A-Za-z0-9_]+),?\s*$/);
    if (!match) return line;
    return giftCardSymbols.has(match[1]) ? null : line;
  };
  const pruned = crmCompat
    .split("\n")
    .map(pruneLine)
    .filter((line) => line !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  fs.writeFileSync(crmCompatPath, pruned);
}

const pendingHooks = [
  "useLookupCrmGiftCard",
  "useGetCrmGiftCard",
  "useBlockCrmGiftCard",
  "useGetCrmClientWallet",
  "useAddCrmWalletBalance",
  "usePayWithCrmWallet",
  "useAdjustCrmWallet",
];
const exportedHooks = pendingHooks.filter((hook) => generatedExports.includes(hook));
console.log(
  `Exported ${generatedExports.length} Wallet symbols; migrated ${exportedHooks.length}/7 pending hooks.`,
);
