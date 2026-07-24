import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "artifacts/api-server/package.json"));
const { parse } = require("yaml");
const spec = parse(fs.readFileSync(path.join(root, "lib/api-spec/openapi.yaml"), "utf8"));

const routerFor = (pathname) => {
  if (pathname.startsWith("/cash-machine") || pathname.startsWith("/admin/cash-machine")
    || pathname.endsWith("/cash-machine-summary")) return "cash-machine.ts";
  if (pathname.includes("/splits")) return "splits.ts";
  if (pathname.includes("/tip")) return "tips.ts";
  if (pathname.startsWith("/reports/")) return "reports.ts";
  if (pathname.startsWith("/orders/")) return "payments.ts";
  return "cash.ts";
};

const operations = [];
for (const [pathname, pathItem] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!operation?.tags?.includes("phase61-cash-payments")) continue;
    const idempotency = operation["x-idempotency"] ?? "none";
    operations.push({
      decision: "include",
      method: method.toUpperCase(),
      path: pathname,
      router: routerFor(pathname),
      operationId: operation.operationId,
      authentication: "bearer-or-cookie",
      rbac: (operation["x-roles"] ?? []).join("|"),
      idempotency,
      providerStatus: operation["x-provider-status"] ?? "not-applicable",
      responses: Object.keys(operation.responses).sort().join("|"),
      consumerMigration: "deferred-to-entrega-62",
      reason: "active runtime operation in phase61-cash-payments scope",
    });
  }
}

const exclusions = [
  ["ALL", "/reports/voids", "reports.ts", "Mixed discounts and payment void report; payment void command is contracted separately"],
  ["GET", "/reports/summary", "reports.ts", "General financial KPI report"],
  ["GET", "/reports/sales-trend", "reports.ts", "General sales analytics outside operational payments"],
  ["GET", "/reports/by-waiter", "reports.ts", "Staff performance analytics excluded"],
  ["GET", "/reports/by-zone", "reports.ts", "Sales analytics by room zone excluded"],
  ["GET", "/reports/by-product", "reports.ts", "Product sales analytics excluded"],
  ["GET", "/reports/vat", "reports.ts", "Fiscal reporting excluded"],
  ["GET", "/reports/peak-hours", "reports.ts", "General sales analytics excluded"],
  ["GET", "/reports/top-products", "reports.ts", "Product sales analytics excluded"],
  ["GET", "/reports/export/excel", "reports.ts", "Cross-domain financial report export excluded"],
  ["GET", "/director/cash", "director.ts", "Director financial reporting excluded"],
  ["POST", "/online-orders/{id}/payment-simulate", "online-orders.ts", "Explicit simulation already owned by Delivery"],
  ["POST", "/public/payment/intent", "online-orders-v2.ts", "Public online provider flow outside in-store Cash & Payments"],
  ["POST", "/public/payment/webhook", "online-orders-v2.ts", "Public online provider flow outside in-store Cash & Payments"],
  ["POST", "/offline/sync cash_payment", "offline.ts", "Acknowledgement-only stub; no payment is persisted"],
  ["ALL", "/online-orders legacy", "online-orders.ts", "Legacy/sentinel routes"],
  ["ALL", "Wallet/Gift Cards", "wallet routes", "Already contracted by Wallet domain"],
  ["ALL", "Reservations/deposits", "reservations routes", "Reservations domain exclusion"],
  ["ALL", "Delivery settlements", "delivery routes", "Delivery domain exclusion"],
  ["ALL", "Verifactu/invoices/documents", "fiscal/document routes", "Fiscal and Documents domains excluded"],
  ["ALL", "payment-method CRUD", "none", "No active runtime endpoint exists; methods are seeded"],
  ["ALL", "real cash-machine hardware", "cash-machine/registry.ts", "No production hardware adapter is implemented; simulator fails closed in production"],
].map(([method, pathname, router, reason]) => ({
  decision: "exclude",
  method,
  path: pathname,
  router,
  operationId: "",
  authentication: "",
  rbac: "",
  idempotency: "",
  providerStatus: pathname.includes("cash-machine") ? "simulator-only-fail-closed" : "",
  responses: "",
  consumerMigration: "not-applicable",
  reason,
}));

const inventory = [...operations, ...exclusions].sort((a, b) =>
  `${a.decision}:${a.path}:${a.method}`.localeCompare(`${b.decision}:${b.path}:${b.method}`));

const jsonPath = path.join(root, "docs/openapi-entrega61-inventory.json");
fs.writeFileSync(jsonPath, `${JSON.stringify({
  delivery: 61,
  tag: "phase61-cash-payments",
  generatedAt: "reproducible-from-openapi",
  includedOperationCount: operations.length,
  manualHookCount: 23,
  activeConsumerCount: 10,
  directHttpConsumerFiles: 6,
  inventory,
}, null, 2)}\n`);

const columns = Object.keys(inventory[0]);
const csv = [
  columns.join(","),
  ...inventory.map((row) => columns.map((column) =>
    `"${String(row[column]).replaceAll('"', '""')}"`).join(",")),
].join("\n");
fs.writeFileSync(path.join(root, "docs/openapi-entrega61-inventory.csv"), `${csv}\n`);

console.log(`Cash & Payments inventory: ${operations.length} included, ${exclusions.length} excluded/classified.`);
