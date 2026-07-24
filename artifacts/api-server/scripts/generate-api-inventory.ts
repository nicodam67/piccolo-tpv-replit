import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const routesDir = path.join(root, "artifacts/api-server/src/routes");
const specPath = path.join(root, "lib/api-spec/openapi.yaml");
const jsonPath = path.join(root, "artifacts/api-endpoint-inventory.json");
const markdownPath = path.join(root, "docs/API-ENDPOINT-INVENTORY.md");
const methods = ["get", "post", "put", "patch", "delete", "all"] as const;

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function normalizeRoute(route: string): string {
  return route.replace(/:[A-Za-z0-9_]+/g, "{}").replace(/\{[^}]+\}/g, "{}");
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

const specOperations = new Map<string, string>();
let specPathValue = "";
for (const line of fs.readFileSync(specPath, "utf8").split(/\r?\n/)) {
  const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
  if (pathMatch) {
    specPathValue = pathMatch[1]!;
    continue;
  }
  const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/);
  if (methodMatch && specPathValue) {
    specOperations.set(`${methodMatch[1]!.toUpperCase()} ${normalizeRoute(specPathValue)}`, "");
    continue;
  }
  const operationMatch = line.match(/^      operationId:\s*(\S+)\s*$/);
  if (operationMatch && specPathValue) {
    const last = [...specOperations.keys()].at(-1);
    if (last) specOperations.set(last, operationMatch[1]!);
  }
}

const consumerFiles = walk(path.join(root, "artifacts"))
  .filter((file) => /\.(?:ts|tsx|js)$/.test(file) && !file.includes("/generated/") && !file.includes("/api-server/src/routes/"));
const consumerSources = consumerFiles.map((file) => ({
  file: path.relative(root, file),
  source: fs.readFileSync(file, "utf8"),
}));

interface Endpoint {
  method: string;
  route: string;
  normalizedRoute: string;
  implementation: { file: string; line: number };
  module: string;
  auth: { type: string; roles: string[]; permissions: string[]; evidence: string[] };
  parameters: { path: string[]; query: string[]; headers: string[] };
  bodyFields: string[];
  responseCodes: number[];
  openapi: { documented: boolean; operationId: string | null };
  consumers: string[];
  classification: string;
  status: "active" | "obsolete" | "duplicate" | "doubtful";
}

const endpoints: Endpoint[] = [];
for (const file of fs.readdirSync(routesDir).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
  const source = fs.readFileSync(path.join(routesDir, file), "utf8");
  const matcher = new RegExp(`router\\.(${methods.join("|")})\\(\\s*["'\`]([^"'\`]+)["'\`]`, "g");
  for (const match of source.matchAll(matcher)) {
    const method = match[1]!.toUpperCase();
    const route = match[2]!;
    const normalizedRoute = normalizeRoute(route);
    const snippet = source.slice(match.index!, match.index! + 4_000);
    const roles = [...snippet.matchAll(/requireRole\(([^)]*)\)/g)]
      .flatMap((item) => [...item[1]!.matchAll(/["']([^"']+)["']/g)].map((role) => role[1]!));
    const permissions = [...snippet.matchAll(/requirePermission\(["']([^"']+)["']/g)].map((item) => item[1]!);
    const evidence: string[] = [];
    if (/requireAuth/.test(snippet)) evidence.push("requireAuth");
    if (roles.length) evidence.push(`requireRole(${roles.join(",")})`);
    if (permissions.length) evidence.push(`requirePermission(${permissions.join(",")})`);
    const specialHeaders = [...snippet.matchAll(/headers\[(?:["'])([^"']+)(?:["'])\]/g)].map((item) => item[1]!);
    const authType = /stripe-signature|webhook.*signature/i.test(snippet)
      ? "signed-webhook"
      : /x-device-token|deviceToken/i.test(snippet) && !/requireAuth/.test(snippet)
        ? "device-token"
        : /requireAuth/.test(snippet) ? "session-or-bearer" : "public";
    const pathParameters = [...route.matchAll(/:([A-Za-z0-9_]+)/g)].map((item) => item[1]!);
    const queryFields = [...snippet.matchAll(/req\.query\.([A-Za-z0-9_]+)/g)].map((item) => item[1]!);
    const queryDestructure = snippet.match(/\{([^}]+)\}\s*=\s*req\.query/);
    if (queryDestructure) {
      queryFields.push(...queryDestructure[1]!.split(",").map((field) => field.split(/[:=]/)[0]!.trim()).filter(Boolean));
    }
    const bodyFields: string[] = [];
    const bodyDestructure = snippet.match(/\{([^}]+)\}\s*=\s*req\.body/);
    if (bodyDestructure) {
      bodyFields.push(...bodyDestructure[1]!.split(",").map((field) => field.split(/[:=]/)[0]!.trim()).filter((field) => /^[A-Za-z_]\w*$/.test(field)));
    }
    const responseCodes = [...snippet.matchAll(/res\.status\((\d{3})\)/g)].map((item) => Number(item[1]));
    if (/res\.(?:json|send)\(/.test(snippet) && !responseCodes.includes(200)) responseCodes.push(200);
    const key = `${method} ${normalizedRoute}`;
    const consumers = consumerSources
      .filter(({ source: consumer }) => {
        const stablePrefix = route.split("/:")[0]!;
        return stablePrefix.length > 1 && consumer.includes(stablePrefix);
      })
      .map(({ file: consumer }) => consumer);
    const obsolete = /status\(410\)|\bdeprecated\b|\bobsolete\b/i.test(snippet);
    const development = /demo-data|simulation|simulate|seed/i.test(route);
    const webhook = /webhook/i.test(route);
    const internal = /^\/(?:diagnostics|setup|admin\/system)/.test(route);
    const classification = obsolete ? "obsolete"
      : development ? "development-or-test"
        : webhook ? "webhook-or-external-integration"
          : internal ? "strictly-internal"
            : consumers.length ? "active-and-used" : "active-no-known-consumer";
    endpoints.push({
      method,
      route,
      normalizedRoute,
      implementation: { file: path.relative(root, path.join(routesDir, file)), line: lineAt(source, match.index!) },
      module: file.replace(/\.ts$/, ""),
      auth: { type: authType, roles: [...new Set(roles)], permissions: [...new Set(permissions)], evidence },
      parameters: {
        path: pathParameters,
        query: [...new Set(queryFields)],
        headers: [...new Set(specialHeaders)],
      },
      bodyFields: [...new Set(bodyFields)],
      responseCodes: [...new Set(responseCodes)].sort(),
      openapi: {
        documented: specOperations.has(key),
        operationId: specOperations.get(key) || null,
      },
      consumers,
      classification,
      status: obsolete ? "obsolete" : "active",
    });
  }
}

const duplicateGroups = new Map<string, Endpoint[]>();
for (const endpoint of endpoints) {
  const key = `${endpoint.method} ${endpoint.normalizedRoute}`;
  duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), endpoint]);
}
for (const group of duplicateGroups.values()) {
  if (group.length > 1) group.forEach((endpoint) => { endpoint.status = "duplicate"; });
}
endpoints.sort((a, b) => `${a.route} ${a.method}`.localeCompare(`${b.route} ${b.method}`));

const report = {
  totals: {
    endpoints: endpoints.length,
    active: endpoints.filter((endpoint) => endpoint.status === "active").length,
    documented: endpoints.filter((endpoint) => endpoint.openapi.documented).length,
    undocumented: endpoints.filter((endpoint) => !endpoint.openapi.documented).length,
    duplicates: endpoints.filter((endpoint) => endpoint.status === "duplicate").length,
    obsolete: endpoints.filter((endpoint) => endpoint.status === "obsolete").length,
    manualConsumerFiles: new Set(endpoints.flatMap((endpoint) => endpoint.consumers)).size,
  },
  endpoints,
};
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const classificationCounts = Object.entries(Object.groupBy(endpoints, (endpoint) => endpoint.classification))
  .map(([classification, rows]) => `| ${classification} | ${rows?.length ?? 0} |`)
  .join("\n");
const missing = endpoints.filter((endpoint) => !endpoint.openapi.documented)
  .map((endpoint) => `| ${endpoint.method} | \`${endpoint.route}\` | ${endpoint.module} | ${endpoint.classification} | ${endpoint.consumers.length} |`)
  .join("\n");
fs.writeFileSync(markdownPath, `# Inventario de endpoints API

Generado automáticamente. No usar la ausencia de consumidores como evidencia de obsolescencia.

## Totales

- Endpoints detectados: ${report.totals.endpoints}
- Documentados: ${report.totals.documented}
- Sin documentar: ${report.totals.undocumented}
- Duplicados: ${report.totals.duplicates}
- Obsoletos explícitos: ${report.totals.obsolete}

## Clasificación

| Clasificación | Total |
|---|---:|
${classificationCounts}

## Endpoints sin OpenAPI

| Método | Ruta | Módulo | Clasificación | Consumidores |
|---|---|---|---|---:|
${missing}
`);

console.log(JSON.stringify(report.totals, null, 2));
