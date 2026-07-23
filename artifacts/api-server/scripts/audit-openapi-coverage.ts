import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const routesDir = path.join(root, "artifacts/api-server/src/routes");
const specPath = path.join(root, "lib/api-spec/openapi.yaml");
const methods = new Set(["get", "post", "put", "patch", "delete"]);

function canonical(method: string, route: string): string {
  return `${method.toUpperCase()} ${route
    .replace(/:[A-Za-z0-9_]+/g, "{}")
    .replace(/\{[^}]+\}/g, "{}")}`;
}

const express = new Set<string>();
for (const file of fs.readdirSync(routesDir).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
  const source = fs.readFileSync(path.join(routesDir, file), "utf8");
  const matcher = /router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
  for (const match of source.matchAll(matcher)) express.add(canonical(match[1]!, match[2]!));
}

const openapi = new Set<string>();
let currentPath = "";
for (const line of fs.readFileSync(specPath, "utf8").split(/\r?\n/)) {
  const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
  if (pathMatch) {
    currentPath = pathMatch[1]!;
    continue;
  }
  const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/);
  if (currentPath && methodMatch && methods.has(methodMatch[1]!)) {
    openapi.add(canonical(methodMatch[1]!, currentPath));
  }
}

const missingInSpec = [...express].filter((route) => !openapi.has(route)).sort();
const missingInExpress = [...openapi].filter((route) => !express.has(route)).sort();
const report = {
  expressEndpoints: express.size,
  openapiEndpoints: openapi.size,
  coveragePercent: Number(((openapi.size / express.size) * 100).toFixed(1)),
  missingInSpec,
  missingInExpress,
};
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--strict") && (missingInSpec.length || missingInExpress.length)) process.exit(1);
