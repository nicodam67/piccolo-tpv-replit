import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const specPath = path.join(root, "lib/api-spec/openapi.yaml");

function fragment(name) {
  return fs.readFileSync(path.join(root, "lib/api-spec", name), "utf8")
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

const pathsFragment = fragment("cash-payments-openapi-section.yaml");
const schemasFragment = fragment("cash-payments-openapi-schemas.yaml");
let spec = fs.readFileSync(specPath, "utf8");
const refresh = process.argv.includes("--refresh");

if (spec.includes("phase61-cash-payments") && !refresh) {
  console.log("Cash & Payments OpenAPI section already present — skipping splice.");
  process.exit(0);
}

const existingPaths = [
  "/cash-sessions/open",
  "/cash-sessions/current",
  "/cash-sessions/{id}/movements",
  "/cash-sessions/{id}/close",
  "/cash-sessions/{id}/summary",
  "/orders/{orderId}/payment-summary",
  "/orders/{orderId}/payments",
  "/orders/{orderId}/ticket",
];

if (refresh) {
  spec = spec.replace(
    /  - name: cash-payments\n    description: [^\n]+\n  - name: phase61-cash-payments\n    description: [^\n]+\n/,
    "",
  );
  const contractedPaths = [...pathsFragment.matchAll(/^  (\/[^:]+):$/gm)].map((match) => match[1]);
  for (const pathname of contractedPaths) {
    const block = new RegExp(
      `\\n  ${escapeRegExp(pathname)}:\\n[\\s\\S]*?(?=\\n  \\/|\\ncomponents:)`,
    );
    spec = spec.replace(block, "");
  }
  spec = spec.replace(/\n    CashPaymentsMethod:\n[\s\S]*$/, "\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const pathname of refresh ? [] : existingPaths) {
  const block = new RegExp(
    `\\n  ${escapeRegExp(pathname)}:\\n[\\s\\S]*?(?=\\n  \\/|\\ncomponents:)`,
  );
  if (!block.test(spec)) {
    throw new Error(`Expected existing OpenAPI path was not found: ${pathname}`);
  }
  spec = spec.replace(block, "");
}

spec = spec.replace(
  "\npaths:",
  "\n  - name: cash-payments\n"
    + "    description: Cash sessions, order payments, split bills, tips and fail-closed cash-machine operations\n"
    + "  - name: phase61-cash-payments\n"
    + "    description: Entrega 61 — Cash & Payments domain contract scope\n\npaths:",
);

spec = spec.replace("\ncomponents:", `\n${pathsFragment}\n\ncomponents:`);
spec = `${spec.replace(/\s+$/, "")}\n${schemasFragment}\n`;

fs.writeFileSync(specPath, spec);
console.log(`Spliced Cash & Payments contract; replaced ${existingPaths.length} existing path blocks.`);
