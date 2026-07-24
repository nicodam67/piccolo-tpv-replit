import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const legacyApiPath = path.join(root, "lib/api-client-react/src/generated/api.ts");
const legacySchemasPath = path.join(root, "lib/api-client-react/src/generated/api.schemas.ts");

const operationNames = [
  "getPaymentMethods", "openCashSession", "getCurrentCashSession", "addCashMovement",
  "closeCashSession", "getCashSessionSummary", "getCashSessionReport", "getCashSessionXReport",
  "reopenCashSession", "voidPayment", "getCashSessionHistory", "getOrderPaymentSummary",
  "addPayment", "getOrderTicket", "getOrderSplits", "createOrderSplits",
  "markSplitGroupPaid", "addTip", "getCashMachineConfig", "updateCashMachineConfig",
  "testCashMachineConnection", "getCashMachineStatus", "getCashMachineCashLevels",
  "startCashMachinePayment", "getCashMachinePayment", "cancelCashMachinePayment",
  "createCashMachineRefund", "getCashMachineSessionSummary",
];

const schemaNames = new Set([
  "PaymentMethod", "CashSession", "CashSessionWithEmployee",
  "CashMovementMovementType", "CashMovement", "CashSessionSummarySalesByMethodItem",
  "CashSessionSummary", "OpenCashSessionInput", "AddCashMovementInputMovementType",
  "AddCashMovementInput", "CloseCashSessionInput", "XReport", "PaymentSummaryOrder",
  "PaymentSummaryItemsItem", "PaymentSummaryPaymentsItem", "PaymentSummary",
  "AddPaymentInputMethodCode", "AddPaymentInput", "PaymentResultPayment",
  "PaymentResultTicket", "PaymentResult", "TicketDataTicket", "TicketDataOrder",
  "TicketDataItemsItem", "TicketDataPaymentsItem", "TicketData", "TipMethod", "Tip",
  "AddTipInput", "SplitGroupItemDetail", "SplitGroupWithItems",
  "CreateSplitGroupsInputGroupItem", "CreateSplitGroupsInputGroup",
  "CreateSplitGroupsInput", "MarkSplitGroupPaidInput", "ZReportSalesByMethodItem",
  "ZReportMovementItem", "ZReportTipItem", "ZReportVoidItem", "ZReport",
  "VoidPaymentInput", "CashMachineConfig", "UpdateCashMachineConfigInput",
  "TestCashMachineConnectionInput", "TestCashMachineConnectionResult",
  "CashMachineDeviceStatus", "CashMachineCashLevel", "StartCashMachinePaymentInput",
  "CashMachineTransaction", "CashMachinePaymentResult", "CashMachineRefundInput",
  "CashMachineSessionSummary", "CashSessionHistoryItem",
]);

function declarationNames(statement) {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations
      .map((declaration) => ts.isIdentifier(declaration.name) ? declaration.name.text : "")
      .filter(Boolean);
  }
  if (
    ts.isFunctionDeclaration(statement)
    || ts.isTypeAliasDeclaration(statement)
    || ts.isInterfaceDeclaration(statement)
  ) {
    return statement.name ? [statement.name.text] : [];
  }
  return [];
}

function isCashPaymentDeclaration(name) {
  const normalized = name.toLowerCase();
  return operationNames.some((operation) => normalized.includes(operation.toLowerCase()));
}

function removeStatements(sourcePath, predicate) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
  const removable = file.statements.filter(predicate);
  let migrated = source;
  for (const statement of removable.sort((a, b) => b.getFullStart() - a.getFullStart())) {
    migrated = migrated.slice(0, statement.getFullStart()) + migrated.slice(statement.end);
  }
  fs.writeFileSync(sourcePath, migrated.replace(/\n{4,}/g, "\n\n\n"));
  return removable.length;
}

const removedApi = removeStatements(
  legacyApiPath,
  (statement) => declarationNames(statement).some(isCashPaymentDeclaration),
);

const removedSchemas = removeStatements(
  legacySchemasPath,
  (statement) => declarationNames(statement).some((name) => schemaNames.has(name)),
);

const apiSource = fs.readFileSync(legacyApiPath, "utf8");
const apiFile = ts.createSourceFile(legacyApiPath, apiSource, ts.ScriptTarget.Latest, true);
const schemaImport = apiFile.statements.find((statement) =>
  ts.isImportDeclaration(statement)
  && ts.isStringLiteral(statement.moduleSpecifier)
  && statement.moduleSpecifier.text === "./api.schemas");

if (schemaImport && ts.isImportDeclaration(schemaImport)) {
  const clause = schemaImport.importClause;
  const bindings = clause?.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) {
    const kept = bindings.elements.filter((element) =>
      !schemaNames.has((element.propertyName ?? element.name).text));
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    const updated = ts.factory.updateImportDeclaration(
      schemaImport,
      schemaImport.modifiers,
      ts.factory.updateImportClause(
        clause,
        clause.isTypeOnly,
        clause.name,
        ts.factory.updateNamedImports(bindings, kept),
      ),
      schemaImport.moduleSpecifier,
      schemaImport.attributes,
    );
    const replacement = printer.printNode(ts.EmitHint.Unspecified, updated, apiFile);
    fs.writeFileSync(
      legacyApiPath,
      apiSource.slice(0, schemaImport.getStart()) + replacement + apiSource.slice(schemaImport.end),
    );
  }
}

console.log(
  `Removed ${removedApi} Cash & Payments API declarations and ${removedSchemas} legacy schemas.`,
);
