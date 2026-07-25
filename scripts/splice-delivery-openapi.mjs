import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const specPath = path.join(root, "lib/api-spec/openapi.yaml");
const pathsFragment = fs.readFileSync(path.join(root, "lib/api-spec/delivery-openapi-section.yaml"), "utf8")
  .split("\n")
  .filter((line) => !line.startsWith("#"))
  .join("\n")
  .replace(/\n+$/, "");
const schemasFragment = fs.readFileSync(path.join(root, "lib/api-spec/delivery-openapi-schemas.yaml"), "utf8")
  .split("\n")
  .filter((line) => !line.startsWith("#"))
  .join("\n")
  .replace(/\n+$/, "");

let spec = fs.readFileSync(specPath, "utf8");

if (spec.includes("phase54-delivery")) {
  console.log("Delivery OpenAPI section already present — skipping splice.");
  process.exit(0);
}

spec = spec.replace(
  "  - name: phase51-wallet\n    description: Client wallet (monedero) and gift cards (tarjetas regalo)\n\npaths:",
  "  - name: phase51-wallet\n    description: Client wallet (monedero) and gift cards (tarjetas regalo)\n  - name: delivery\n    description: Delivery orders, couriers, zones and online TPV inbox\n  - name: phase54-delivery\n    description: Entrega 54 — delivery domain contract scope\n\npaths:",
);

spec = spec.replace(
  "components:",
  `${pathsFragment}\n\ncomponents:`,
);

spec = spec.replace(
  /    CrmAuditLog:\n([\s\S]*?)      required:\n        - id\n        - accion\n        - entidadTipo\n        - empleadoNombre\n        - terminal\n        - createdAt\n$/,
  (match) => `${match}\n${schemasFragment}\n`,
);

fs.writeFileSync(specPath, spec);
console.log("Spliced delivery paths and schemas into openapi.yaml");
