import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const routesDir = path.join(root, "artifacts/api-server/src/routes");
const specPath = path.join(root, "lib/api-spec/openapi.yaml");
const exclusionsPath = path.join(root, "lib/api-spec/endpoint-exclusions.json");
const methods = new Set(["get", "post", "put", "patch", "delete", "all"]);

function canonical(method: string, route: string): string {
  return `${method.toUpperCase()} ${route
    .replace(/:[A-Za-z0-9_]+/g, "{}")
    .replace(/\{[^}]+\}/g, "{}")}`;
}

const express = new Set<string>();
for (const file of fs.readdirSync(routesDir).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
  const source = fs.readFileSync(path.join(routesDir, file), "utf8");
  const matcher = /router\.(get|post|put|patch|delete|all)\(\s*["'`]([^"'`]+)["'`]/g;
  for (const match of source.matchAll(matcher)) express.add(canonical(match[1]!, match[2]!));
}

const openapi = new Set<string>();
const operationIds = new Map<string, number>();
const pathOccurrences = new Map<string, number>();
let currentPath = "";
for (const line of fs.readFileSync(specPath, "utf8").split(/\r?\n/)) {
  const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
  if (pathMatch) {
    currentPath = pathMatch[1]!;
    pathOccurrences.set(currentPath, (pathOccurrences.get(currentPath) ?? 0) + 1);
    continue;
  }
  const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/);
  if (currentPath && methodMatch && methods.has(methodMatch[1]!)) {
    openapi.add(canonical(methodMatch[1]!, currentPath));
  }
  const operationMatch = line.match(/^      operationId:\s*(\S+)\s*$/);
  if (operationMatch) operationIds.set(operationMatch[1]!, (operationIds.get(operationMatch[1]!) ?? 0) + 1);
}

interface Exclusion {
  method: string;
  path: string;
  reason: string;
  owner: string;
  reviewCondition: string;
}
const exclusions = JSON.parse(fs.readFileSync(exclusionsPath, "utf8")) as Exclusion[];
const exclusionKeys = new Set(exclusions.map((item) => canonical(item.method, item.path)));
const invalidExclusions = exclusions.filter((item) =>
  !item.reason || !item.owner || !item.reviewCondition || !express.has(canonical(item.method, item.path)));
const missingInSpec = [...express].filter((route) => !openapi.has(route) && !exclusionKeys.has(route)).sort();
const missingInExpress = [...openapi].filter((route) => !express.has(route)).sort();
const duplicateOperationIds = [...operationIds].filter(([, count]) => count > 1).map(([id]) => id);
const duplicateYamlPaths = [...pathOccurrences].filter(([, count]) => count > 1).map(([route]) => route);
const report = {
  expressEndpoints: express.size,
  openapiEndpoints: openapi.size,
  excludedEndpoints: exclusions.length,
  coveragePercent: Number((((openapi.size + exclusions.length) / express.size) * 100).toFixed(1)),
  missingInSpec,
  missingInExpress,
  duplicateOperationIds,
  duplicateYamlPaths,
  invalidExclusions,
};
console.log(JSON.stringify(report, null, 2));
if (
  process.argv.includes("--strict")
  && (
    missingInSpec.length || missingInExpress.length || duplicateOperationIds.length
    || duplicateYamlPaths.length || invalidExclusions.length
  )
) process.exit(1);
