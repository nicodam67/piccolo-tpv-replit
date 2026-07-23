import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const legacyPath = path.join(root, "lib/api-client-react/src/generated/api.ts");
const phasePath = path.join(root, "lib/api-client-react/src/phase1-generated/api.ts");
const compatPath = path.join(root, "lib/api-client-react/src/phase1-compat.ts");
const operationIds = [
  "updateOrder", "updateOrderItem", "duplicateOrderItem", "getOrderAudit",
  "getOccupationSummary", "getTableHistory", "getAlertConfig", "patchAlertConfig",
  "cleanTable", "blockTable", "transferTable", "mergeTables", "separateTable",
  "moveItems", "transferWaiter", "createPrefacturaPrint", "getPrefacturaStatus",
  "getKdsHistory", "resendKitchenTask", "updateKitchenTaskStatus",
  "getKdsStations", "createKdsStation", "updateKdsStation", "deleteKdsStation",
  "pingKdsStation", "getKdsZoneTransitions",
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

function isTypeOnly(statement) {
  return ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement);
}

function belongsToPhase(name) {
  const normalized = name.toLowerCase();
  return operationIds.some((operation) => normalized.includes(operation.toLowerCase()));
}

const phaseSource = fs.readFileSync(phasePath, "utf8");
const phaseFile = ts.createSourceFile(phasePath, phaseSource, ts.ScriptTarget.Latest, true);
const phaseExports = phaseFile.statements.flatMap(declarations).filter(belongsToPhase).sort();
const phaseTypeExports = new Set(
  phaseFile.statements.filter(isTypeOnly).flatMap(declarations).filter(belongsToPhase),
);
if (!phaseExports.length) throw new Error("No phase-one exports were generated");

const legacySource = fs.readFileSync(legacyPath, "utf8");
const legacyFile = ts.createSourceFile(legacyPath, legacySource, ts.ScriptTarget.Latest, true);
const removable = legacyFile.statements.filter((statement) =>
  declarations(statement).some((name) => phaseExports.includes(name)));

let migrated = legacySource;
for (const statement of removable.sort((a, b) => b.getFullStart() - a.getFullStart())) {
  migrated = migrated.slice(0, statement.getFullStart()) + migrated.slice(statement.end);
}
const manualMarker = "// ── NEW ENDPOINTS ADDED MANUALLY ────────────────────────────────────────────";
migrated = migrated.replace(`${manualMarker}\n\n`, "");
migrated = migrated.replace(
  "// getProductFormats — GET /products/:productId/formats",
  `${manualMarker}\n\n// getProductFormats — GET /products/:productId/formats`,
);
fs.writeFileSync(legacyPath, migrated.replace(/\n{4,}/g, "\n\n\n"));
fs.writeFileSync(
  compatPath,
  `// Generated compatibility exports. Do not edit manually.\n`
  + `export {\n${phaseExports.filter((name) => !phaseTypeExports.has(name)).map((name) => `  ${name},`).join("\n")}\n} from "./phase1-generated/api";\n`
  + `export type {\n${phaseExports.filter((name) => phaseTypeExports.has(name)).map((name) => `  ${name},`).join("\n")}\n} from "./phase1-generated/api";\n`,
);
console.log(`Removed ${removable.length} duplicate declarations; exported ${phaseExports.length} generated symbols.`);
