import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const roots = [
  path.join(root, "artifacts/piccolo-tpv/src"),
  path.join(root, "artifacts/qr-menu/src"),
];

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const files = roots.flatMap(walk).filter((file) => /\.(?:ts|tsx|js)$/.test(file));
const phase1Consumers = files.flatMap((file) => {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("@workspace/api-client-react/phase1")) return [];
  const imports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]@workspace\/api-client-react\/phase1['"]/g)]
    .flatMap((match) => match[1]!.split(",").map((name) => name.trim()))
    .filter((name) => /^use[A-Z]/.test(name));
  return [{ file: path.relative(root, file), hooks: imports }];
});
const rows = files.flatMap((file) => {
  const source = fs.readFileSync(file, "utf8");
  const mechanisms = {
    fetch: [...source.matchAll(/\bfetch\s*\(/g)].length,
    customFetch: [...source.matchAll(/\bcustomFetch\s*\(/g)].length,
    apiWrapper: [...source.matchAll(/\bapi\.(?:get|post|put|patch|delete)\s*[<(]/g)].length,
    generatedHooks: [...source.matchAll(/\buse[A-Z]\w+\s*\(/g)].length,
    convex: [...source.matchAll(/\buse(?:Query|Mutation)\s*\(/g)].length,
  };
  if (!Object.values(mechanisms).some(Boolean)) return [];
  const relative = path.relative(root, file);
  const legitimateAdapter = /lib\/(?:api-client|offline-queue)\.ts$/.test(relative)
    || /hooks\/useNetworkStatus\.ts$/.test(relative)
    || /fichaje\/tablet/.test(relative)
    || /artifacts\/qr-menu/.test(relative) && mechanisms.convex > 0;
  const generatedOnly = mechanisms.generatedHooks > 0
    && mechanisms.fetch + mechanisms.customFetch + mechanisms.apiWrapper === 0;
  const classification = generatedOnly ? "generated-client"
    : legitimateAdapter ? "justified-adapter"
      : "manual-http-to-migrate";
  return [{ file: relative, mechanisms, classification }];
});

const generatedSource = fs.readFileSync(path.join(root, "lib/api-client-react/src/generated/api.ts"), "utf8");
const generatedHookExports = new Set(
  [...generatedSource.matchAll(/export (?:const|function) (use[A-Z]\w+)/g)].map((match) => match[1]!),
);
const manualMarker = generatedSource.indexOf("NEW ENDPOINTS ADDED MANUALLY");
const manualGeneratedHooks = manualMarker < 0
  ? []
  : [...generatedSource.slice(manualMarker).matchAll(/export (?:const|function) (use[A-Z]\w+)/g)].map((match) => match[1]!);
const specSource = fs.readFileSync(path.join(root, "lib/api-spec/openapi.yaml"), "utf8");
const contractedHooks = new Set(
  [...specSource.matchAll(/^\s+operationId:\s*(\w+)/gm)]
    .map((match) => `use${match[1]![0]!.toUpperCase()}${match[1]!.slice(1)}`),
);
const uncontractedManualHooks = manualGeneratedHooks.filter((hook) => !contractedHooks.has(hook));

const totals = {
  filesWithHttp: rows.length,
  generatedHookExports: generatedHookExports.size,
  historicalManualHooks: manualGeneratedHooks.length,
  uncontractedManualHooks: uncontractedManualHooks.length,
  fetchCalls: rows.reduce((sum, row) => sum + row.mechanisms.fetch, 0),
  customFetchCalls: rows.reduce((sum, row) => sum + row.mechanisms.customFetch, 0),
  apiWrapperCalls: rows.reduce((sum, row) => sum + row.mechanisms.apiWrapper, 0),
  convexCalls: rows.reduce((sum, row) => sum + row.mechanisms.convex, 0),
  manualFilesPending: rows.filter((row) => row.classification === "manual-http-to-migrate").length,
  justifiedAdapterFiles: rows.filter((row) => row.classification === "justified-adapter").length,
  phase1ConsumerFiles: phase1Consumers.length,
  phase1MigratedHooks: new Set(phase1Consumers.flatMap((row) => row.hooks)).size,
};
const report = {
  totals,
  historicalManualHooks: manualGeneratedHooks.sort(),
  uncontractedManualHooks: uncontractedManualHooks.sort(),
  consumers: rows,
  phase1Consumers,
};
fs.writeFileSync(
  path.join(root, "artifacts/api-client-inventory.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

const pending = rows.filter((row) => row.classification === "manual-http-to-migrate")
  .map((row) => `| \`${row.file}\` | ${row.mechanisms.fetch} | ${row.mechanisms.customFetch} | ${row.mechanisms.apiWrapper} |`)
  .join("\n");
const adapters = rows.filter((row) => row.classification === "justified-adapter")
  .map((row) => `- \`${row.file}\`: transporte, offline, tablet o integración Convex.`)
  .join("\n");
fs.writeFileSync(path.join(root, "docs/API-CLIENT-MIGRATION.md"), `# Migración de clientes API

Inventario automático acumulado de clientes API.

## Totales iniciales

- Hooks exportados por el cliente actual: ${totals.generatedHookExports}
- Hooks históricos añadidos manualmente: ${totals.historicalManualHooks}
- Hooks manuales sin operación equivalente en OpenAPI: ${totals.uncontractedManualHooks}
- Llamadas \`fetch\`: ${totals.fetchCalls}
- Llamadas \`customFetch\` directas: ${totals.customFetchCalls}
- Llamadas mediante wrapper \`api\`: ${totals.apiWrapperCalls}
- Llamadas Convex: ${totals.convexCalls}
- Archivos manuales pendientes: ${totals.manualFilesPending}

## Estado de migración

- Hooks migrados al cliente parcial de Entrega 41: ${totals.phase1MigratedHooks}
- Archivos consumidores migrados: ${totals.phase1ConsumerFiles}
- Eliminados por evidencia de obsolescencia: 0
- Adaptadores conservados: ${totals.justifiedAdapterFiles}
- Pendientes: ${totals.manualFilesPending}

No se migran llamadas hasta que su operación y tipos estén respaldados por OpenAPI; hacerlo antes
solo trasladaría URLs sin crear un contrato fiable.

## Adaptadores conservados

${adapters}

## Accesos manuales pendientes

| Archivo | fetch | customFetch | api wrapper |
|---|---:|---:|---:|
${pending}
`);
console.log(JSON.stringify(totals, null, 2));
