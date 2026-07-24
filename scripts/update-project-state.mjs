import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const statePath = path.join(root, "project-state.json");
const outputPath = path.join(root, "PROJECT_STATE.md");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function metrics() {
  const openapi = fs.readFileSync(path.join(root, "lib/api-spec/openapi.yaml"), "utf8");
  const endpoints = readJson(path.join(root, "artifacts/api-endpoint-inventory.json"));
  const clients = readJson(path.join(root, "artifacts/api-client-inventory.json"));
  return {
    openapiOperations: [...openapi.matchAll(/^\s+operationId:\s*\S+/gm)].length,
    documentedEndpoints: endpoints.totals.documented,
    totalEndpoints: endpoints.totals.endpoints,
    historicalManualHooks: clients.totals.historicalManualHooks,
    uncontractedManualHooks: clients.totals.uncontractedManualHooks,
    migratedManualHooks: 160 - clients.totals.historicalManualHooks,
  };
}

function table(rows) {
  return rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function render(state) {
  const current = metrics();
  const domains = state.domains.map((domain) => [
    domain.name, domain.status, domain.contracts, String(domain.hooksMigrated), domain.notes,
  ]);
  const decisions = state.architecturalDecisions.map((decision) => `- ${decision}`).join("\n");
  const pending = state.pending.map((item) => `- ${item}`).join("\n");
  const migratedHooks = state.domains
    .map((domain) => `- ${domain.name}: ${domain.hooksMigrated} hooks manuales migrados.`)
    .join("\n");
  const validations = Object.entries(state.validationPolicy)
    .map(([profile, description]) => `| \`${profile}\` | ${description} |`);
  const deliveries = [...state.deliveries].sort((a, b) => Number(b.number) - Number(a.number))
    .slice(0, 8)
    .map((delivery) => `- Entrega ${delivery.number}: ${delivery.summary}`)
    .join("\n");

  return `# PROJECT_STATE

Fuente resumida para agentes y desarrolladores. Leer este archivo antes de explorar el repositorio.
La fuente editable es \`project-state.json\`; regenerar con \`pnpm state:update\`.

## Estado actual

- Última entrega: ${state.lastDelivery}
- Resumen: ${state.lastSummary}
- Endpoints detectados: ${current.totalEndpoints}
- Operaciones OpenAPI: ${current.openapiOperations}
- Endpoints marcados como documentados: ${current.documentedEndpoints}
- Hooks manuales migrados: ${current.migratedManualHooks}
- Hooks históricos restantes: ${current.historicalManualHooks}
- Hooks sin contrato: ${current.uncontractedManualHooks}

## Dominios consolidados o contratados

| Dominio | Estado | Contratos | Hooks manuales migrados | Notas |
|---|---|---:|---:|---|
${table(domains)}

## Hooks migrados

${migratedHooks}

## Decisiones arquitectónicas

${decisions}

## Política de exploración

1. Revisar únicamente los archivos del dominio afectado.
2. No reauditar dominios \`consolidated\` salvo dependencia demostrable en código o fallo.
3. Consultar inventarios JSON antes de búsquedas amplias.
4. No ejecutar suites globales durante iteraciones locales.

## Perfiles de validación

| Perfil | Uso |
|---|---|
${validations.join("\n")}

Seleccionar el perfil con \`pnpm validate:change -- --profile <perfil>\`.
Las validaciones completas quedan reservadas para cierres de fase, cambios compartidos o riesgo real.

## Pendientes

${pending}

## Entregas recientes

${deliveries}
`;
}

const expected = render(readJson(statePath));
if (process.argv.includes("--check")) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (current !== expected) {
    console.error("PROJECT_STATE.md is stale. Run: pnpm state:update");
    process.exit(1);
  }
  console.log("PROJECT_STATE.md is up to date.");
} else {
  fs.writeFileSync(outputPath, expected);
  console.log("PROJECT_STATE.md updated.");
}
