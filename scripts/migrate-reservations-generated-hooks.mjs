import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const legacyPath = path.join(root, "lib/api-client-react/src/generated/api.ts");
const generatedPath = path.join(root, "lib/api-client-react/src/reservations-generated/api.ts");
const compatPath = path.join(root, "lib/api-client-react/src/reservations-compat.ts");
const operationIds = [
  "getReservations", "createReservation", "patchReservation", "deleteReservation",
  "arriveReservation",
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

const generatedSource = fs.readFileSync(generatedPath, "utf8");
const generatedFile = ts.createSourceFile(generatedPath, generatedSource, ts.ScriptTarget.Latest, true);
const generatedExports = generatedFile.statements.flatMap(declarations).filter(belongs).sort();
const generatedTypes = new Set(
  generatedFile.statements
    .filter((statement) => ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement))
    .flatMap(declarations)
    .filter(belongs),
);
const adapters = new Set(["useArriveReservation"]);
if (!generatedExports.length) throw new Error("No Reservations exports were generated");

const legacySource = fs.readFileSync(legacyPath, "utf8");
const legacyFile = ts.createSourceFile(legacyPath, legacySource, ts.ScriptTarget.Latest, true);
const removable = legacyFile.statements.filter((statement) =>
  declarations(statement).some((name) => generatedExports.includes(name)));
let migrated = legacySource;
for (const statement of removable.sort((a, b) => b.getFullStart() - a.getFullStart())) {
  migrated = migrated.slice(0, statement.getFullStart()) + migrated.slice(statement.end);
}
fs.writeFileSync(legacyPath, migrated.replace(/\n{4,}/g, "\n\n\n"));
fs.writeFileSync(
  compatPath,
  `// Generated compatibility exports. Do not edit manually.\n`
  + `export {\n${generatedExports.filter((name) => !generatedTypes.has(name) && !adapters.has(name)).map((name) => `  ${name},`).join("\n")}\n} from "./reservations-generated/api";\n`
  + `export type {\n${generatedExports.filter((name) => generatedTypes.has(name)).map((name) => `  ${name},`).join("\n")}\n} from "./reservations-generated/api";\n`
  + `import { useArriveReservation as useGeneratedArriveReservation } from "./reservations-generated/api";\n`
  + `type GeneratedArriveMutation = ReturnType<typeof useGeneratedArriveReservation>;\n`
  + `export interface LegacyArriveReservationVariables { id: string; openTable?: boolean }\n`
  + `export function useArriveReservation(options?: Parameters<typeof useGeneratedArriveReservation>[0]): Omit<GeneratedArriveMutation, "mutate" | "mutateAsync"> & {\n`
  + `  mutate: (variables: LegacyArriveReservationVariables, options?: Parameters<GeneratedArriveMutation["mutate"]>[1]) => void;\n`
  + `  mutateAsync: (variables: LegacyArriveReservationVariables, options?: Parameters<GeneratedArriveMutation["mutateAsync"]>[1]) => ReturnType<GeneratedArriveMutation["mutateAsync"]>;\n`
  + `} {\n`
  + `  const generated = useGeneratedArriveReservation(options);\n`
  + `  const map = ({ id, openTable }: LegacyArriveReservationVariables) => ({ id, data: { openTable } });\n`
  + `  return {\n`
  + `    ...generated,\n`
  + `    mutate: (variables, mutationOptions) => generated.mutate(map(variables), mutationOptions),\n`
  + `    mutateAsync: (variables, mutationOptions) => generated.mutateAsync(map(variables), mutationOptions),\n`
  + `  };\n`
  + `}\n`,
);
console.log(`Removed ${removable.length} duplicate declarations; exported ${generatedExports.length} Reservations symbols.`);
