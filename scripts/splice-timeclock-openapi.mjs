import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const specPath = path.join(root, "lib/api-spec/openapi.yaml");
const pathsFragment = fs.readFileSync(path.join(root, "lib/api-spec/timeclock-openapi-section.yaml"), "utf8")
  .split("\n")
  .filter((line) => !line.startsWith("#"))
  .join("\n")
  .replace(/\n+$/, "");
const schemasFragment = fs.readFileSync(path.join(root, "lib/api-spec/timeclock-openapi-schemas.yaml"), "utf8")
  .split("\n")
  .filter((line) => !line.startsWith("#"))
  .join("\n")
  .replace(/\n+$/, "");

let spec = fs.readFileSync(specPath, "utf8");

if (spec.includes("phase56-timeclock")) {
  console.log("Timeclock OpenAPI section already present — skipping splice.");
  process.exit(0);
}

spec = spec.replace(
  "  - name: phase54-delivery\n    description: Entrega 54 — delivery domain contract scope\n\npaths:",
  "  - name: phase54-delivery\n    description: Entrega 54 — delivery domain contract scope\n  - name: timeclock\n    description: Employee timeclock (fichaje), tablet kiosk, PIN and NFC\n  - name: phase56-timeclock\n    description: Entrega 56 — fichaje domain contract scope\n\npaths:",
);

spec = spec.replace(
  "    cookieAuth:\n      type: apiKey\n      in: cookie\n      name: piccolo_session",
  "    cookieAuth:\n      type: apiKey\n      in: cookie\n      name: piccolo_session\n    deviceTokenAuth:\n      type: apiKey\n      in: header\n      name: x-device-token\n      description: Tablet device credential issued at registration",
);

spec = spec.replace(
  "components:",
  `${pathsFragment}\n\ncomponents:`,
);

spec = spec.replace(
  /    SettleCourierResult:\n      type: object\n      properties:\n        settlement: \{ \$ref: "#\/components\/schemas\/CourierSettlement" \}\n      required: \[settlement\]\n?$/,
  (match) => `${match}\n${schemasFragment}\n`,
);

fs.writeFileSync(specPath, spec);
console.log("Spliced timeclock paths and schemas into openapi.yaml");
