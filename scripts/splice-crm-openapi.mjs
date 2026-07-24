import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const specPath = path.join(root, "lib/api-spec/openapi.yaml");
const pathsFragment = fs.readFileSync(path.join(root, "lib/api-spec/crm-openapi-section.yaml"), "utf8")
  .split("\n")
  .filter((line) => !line.startsWith("#"))
  .join("\n")
  .replace(/\n+$/, "");
const schemasFragment = fs.readFileSync(path.join(root, "lib/api-spec/crm-openapi-schemas.yaml"), "utf8")
  .split("\n")
  .filter((line) => !line.startsWith("#"))
  .join("\n")
  .replace(/\n+$/, "");

let spec = fs.readFileSync(specPath, "utf8");

if (spec.includes("phase49-crm")) {
  console.log("CRM OpenAPI section already present — skipping splice.");
  process.exit(0);
}

spec = spec.replace(
  "  - name: branding\n    description: Public and admin branding for QR carta\n\npaths:",
  "  - name: branding\n    description: Public and admin branding for QR carta\n  - name: crm\n    description: CRM clients, loyalty, gift cards, promotions and campaigns\n\npaths:",
);

spec = spec.replace(
  "  /tables/occupation-summary:",
  `${pathsFragment}\n\n  /tables/occupation-summary:`,
);

spec = spec.replace(
  /    QrNotConfiguredError:\n([\s\S]*?)      required: \[error, code\]\n$/,
  (match) => `${match}\n${schemasFragment}\n`,
);

fs.writeFileSync(specPath, spec);
console.log("Spliced CRM paths and schemas into openapi.yaml");
