#!/usr/bin/env node
/**
 * Entrega 53 — deterministic OpenAPI pending-domain inventory.
 * Read-only analysis; does not modify contracts or clients.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const OUT_JSON = path.join(root, "docs/openapi-entrega53-inventory.json");
const OUT_CSV = path.join(root, "docs/openapi-entrega53-inventory.csv");

const CONSOLIDATED = new Set([
  "orders",
  "tables-rooms-kds",
  "documents",
  "reservations",
  "branding",
  "crm-hooks",
  "wallet-gift-cards",
]);

const DOMAIN_RULES = [
  { domain: "orders", patterns: [/^\/orders/, /^\/tables/, /^\/zones/, /^\/kds/, /^\/rooms/, /^\/canvas/, /^\/notifications/, /^\/dashboard/], consolidated: "orders" },
  { domain: "documents", patterns: [/^\/documents/, /^\/admin\/invoices/, /^\/admin\/tickets/, /^\/prefactura/, /^\/tickets/], consolidated: "documents" },
  { domain: "reservations", patterns: [/^\/reservations/, /^\/waiting-list/, /^\/service-shifts/], consolidated: "reservations" },
  { domain: "branding", patterns: [/^\/public\/branding/, /^\/admin\/branding/, /^\/admin\/qr-branding/], consolidated: "branding" },
  { domain: "wallet-gift-cards", patterns: [/^\/crm\/gift-cards/, /^\/crm\/clients\/[^/]+\/wallet/], consolidated: "wallet-gift-cards" },
  { domain: "crm-extended", patterns: [/^\/crm/, /^\/admin\/crm/], consolidated: "crm-hooks" },
  { domain: "cash-payments", patterns: [/^\/cash/, /^\/payments/, /^\/sessions/, /^\/admin\/cash-machine/] },
  { domain: "catalog-admin", patterns: [/^\/admin\/products/, /^\/admin\/categories/, /^\/admin\/subcategories/, /^\/admin\/modifiers/, /^\/admin\/modifier-groups/, /^\/categories/, /^\/products/] },
  { domain: "inventory-purchasing", patterns: [/^\/admin\/ingredients/, /^\/admin\/goods-receipts/, /^\/admin\/suppliers/, /^\/admin\/purchase/, /^\/admin\/supplier/, /^\/admin\/storage/, /^\/admin\/ingredient/, /^\/admin\/cost/, /^\/admin\/recipe/, /^\/admin\/subrecipe/, /^\/admin\/product-availability/, /^\/admin\/allergens/] },
  { domain: "delivery", patterns: [/^\/delivery/, /^\/admin\/couriers/, /^\/admin\/delivery-zones/, /^\/admin\/courier-settlements/, /^\/driver/] },
  { domain: "online-orders", patterns: [/^\/online/, /^\/admin\/online/] },
  { domain: "fiscal-verifactu", patterns: [/^\/verifactu/, /^\/fiscal/, /^\/admin\/verifactu/, /^\/admin\/fiscal/] },
  { domain: "hr", patterns: [/^\/hr/] },
  { domain: "fichaje", patterns: [/^\/fichaje/] },
  { domain: "director", patterns: [/^\/director/] },
  { domain: "backup", patterns: [/^\/backup/] },
  { domain: "config-permissions", patterns: [/^\/admin\/config/, /^\/admin\/permissions/, /^\/admin\/installation/, /^\/admin\/printers/, /^\/admin\/print-queue/, /^\/config/, /^\/business-config/, /^\/payment-methods/] },
  { domain: "auth-employees", patterns: [/^\/auth/, /^\/employees/, /^\/healthz/] },
  { domain: "tablet-setup", patterns: [/^\/tablet/, /^\/setup/] },
];

function classifyRoute(route) {
  const normalized = route.replace(/^\/api/, "").split("?")[0];
  for (const rule of DOMAIN_RULES) {
    if (rule.patterns.some((p) => p.test(normalized))) return rule;
  }
  return { domain: "other", patterns: [], consolidated: null };
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

function parseOpenApiPaths(specText) {
  const paths = new Map();
  let currentPath = "";
  let currentMethod = "";
  const tags = [];
  for (const line of specText.split("\n")) {
    const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/);
    if (methodMatch && currentPath) {
      currentMethod = methodMatch[1].toUpperCase();
      tags.length = 0;
      continue;
    }
    const tagMatch = line.match(/^      tags: \[(.*)\]\s*$/);
    if (tagMatch && currentMethod) {
      const key = `${currentMethod} ${currentPath}`;
      paths.set(key, { method: currentMethod, path: currentPath, tags: tagMatch[1].split(",").map((t) => t.trim()) });
      currentMethod = "";
    }
  }
  return paths;
}

function parseManualHooks(apiSource) {
  const hooks = [];
  const fnRegex = /export const (\w+) = async[\s\S]*?customFetch[\s\S]*?`(\/api[^`]+)`/g;
  const fnRegex2 = /export const (\w+) = async[\s\S]*?`(\/api[^`]+)`[\s\S]*?customFetch/g;
  let m;
  while ((m = fnRegex.exec(apiSource))) {
    hooks.push({ functionName: m[1], routeTemplate: m[2] });
  }
  const hookRegex = /export (?:const|function) (use\w+)/g;
  const hookNames = [...apiSource.matchAll(hookRegex)].map((x) => x[1]);
  const routeByFn = new Map(hooks.map((h) => [h.functionName, h.routeTemplate]));
  return hookNames.map((hook) => {
    const base = hook.replace(/^use/, "");
    const baseLower = base.charAt(0).toLowerCase() + base.slice(1);
    const route = routeByFn.get(baseLower) ?? routeByFn.get(base) ?? "";
    const rule = classifyRoute(route || `/${baseLower}`);
    return {
      kind: "manual-hook",
      hook,
      functionName: baseLower,
      method: inferMethod(hook, apiSource),
      routeTemplate: route,
      domain: rule.domain,
      consolidated: rule.consolidated,
      openapiStatus: route ? openapiStatusFor(route) : "unknown",
      consumerFile: "lib/api-client-react/src/generated/api.ts",
      classification: rule.consolidated ? "consolidated-hook-legacy" : "manual-hook-pending-contract",
      recommendation: rule.consolidated ? "exclude" : "contract-candidate",
    };
  });
}

function inferMethod(hook, source) {
  const fn = hook.replace(/^use/, "");
  const fnLower = fn.charAt(0).toLowerCase() + fn.slice(1);
  const block = source.match(new RegExp(`export const ${fnLower}[\\s\\S]{0,400}`));
  if (!block) return "GET";
  if (block[0].includes("method: 'POST'")) return "POST";
  if (block[0].includes("method: 'PATCH'")) return "PATCH";
  if (block[0].includes("method: 'PUT'")) return "PUT";
  if (block[0].includes("method: 'DELETE'")) return "DELETE";
  return "GET";
}

let openApiPaths;

function normalizePathForCompare(routeTemplate) {
  return routeTemplate
    .replace(/^\/api/, "")
    .replace(/\$\{[^}]+\}/g, "{}")
    .replace(/\/+$/, "")
    .split("?")[0];
}

function openapiStatusFor(routeTemplate) {
  const normalized = normalizePathForCompare(routeTemplate);
  for (const val of openApiPaths.values()) {
    const specPath = val.path.replace(/\{[^}]+\}/g, "{}").replace(/\/+$/, "");
    if (specPath === normalized) return "documented";
  }
  const prefix = normalized.split("/").filter(Boolean).slice(0, 2).join("/");
  const hasRelated = [...openApiPaths.values()].some((val) => {
    const specPrefix = val.path.replace(/^\//, "").split("/").slice(0, 2).join("/");
    return prefix && specPrefix === prefix;
  });
  return hasRelated ? "partial" : "missing";
}

function parseCompatExports() {
  const compatFiles = fs.readdirSync(path.join(root, "lib/api-client-react/src"))
    .filter((f) => f.endsWith("-compat.ts"));
  const exports = [];
  for (const file of compatFiles) {
    const domain = file.replace("-compat.ts", "");
    const text = fs.readFileSync(path.join(root, "lib/api-client-react/src", file), "utf8");
    for (const m of text.matchAll(/^\s{2}(use\w+),/gm)) {
      exports.push({ hook: m[1], compatLayer: file, domain });
    }
  }
  return exports;
}

function parseGeneratedNotCompat() {
  const compatHooks = new Set(parseCompatExports().map((e) => e.hook));
  const generatedDirs = fs.readdirSync(path.join(root, "lib/api-client-react/src"))
    .filter((d) => d.endsWith("-generated") && fs.statSync(path.join(root, "lib/api-client-react/src", d)).isDirectory());
  const rows = [];
  for (const dir of generatedDirs) {
    const apiPath = path.join(root, "lib/api-client-react/src", dir, "api.ts");
    if (!fs.existsSync(apiPath)) continue;
    const text = fs.readFileSync(apiPath, "utf8");
    const client = dir.replace("-generated", "");
    for (const m of text.matchAll(/export (?:const|function) (use\w+)/g)) {
      if (compatHooks.has(m[1])) continue;
      const rule = classifyRoute(`/${client}`);
      rows.push({
        kind: "generated-not-migrated",
        hook: m[1],
        method: "",
        routeTemplate: "",
        domain: client === "crm" ? "crm-extended" : client === "wallet" ? "wallet-gift-cards" : client,
        consolidated: client === "wallet" ? "wallet-gift-cards" : client === "crm" ? "crm-hooks" : client,
        openapiStatus: "documented",
        consumerFile: `lib/api-client-react/src/${dir}/api.ts`,
        classification: "generated-hook-not-migrated",
        recommendation: client === "wallet" || client === "crm" ? "migrate-hooks-e54+" : "exclude",
      });
    }
  }
  return rows;
}

function scanAppHttp() {
  const appDir = path.join(root, "artifacts/piccolo-tpv/src");
  const files = walk(appDir);
  const rows = [];
  const patterns = [
    /api\.(get|post|patch|put|delete)(?:<[^>]*>)?\(\s*[`'"]([^`'"]+)[`'"]/g,
    /api\.(get|post|patch|put|delete)(?:<[^>]*>)?\(\s*`([^`]+)`/g,
    /customFetch(?:<[^>]*>)?\(\s*[`'"]([^`'"]+)[`'"]/g,
    /customFetch(?:<[^>]*>)?\(\s*`([^`]+)`/g,
    /fetch\(\s*[`'"](\/api[^`'"]+)[`'"]/g,
  ];
  for (const file of files) {
    const rel = path.relative(root, file);
    const text = fs.readFileSync(file, "utf8");
    for (const re of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        const method = m[1]?.toUpperCase?.() ?? "GET";
        const route = m[2] ?? m[1];
        if (!route?.startsWith("/api") && !route?.startsWith("`/api")) continue;
        const routeClean = route.replace(/^\/api/, "/api").split("${")[0].replace(/\?.*$/, "");
        const rule = classifyRoute(routeClean);
        rows.push({
          kind: re.source.includes("customFetch") ? "direct-customFetch" : re.source.includes("fetch") ? "direct-fetch" : "direct-api-client",
          hook: "",
          method: method.length <= 6 ? method : "GET",
          routeTemplate: routeClean,
          domain: rule.domain,
          consolidated: rule.consolidated,
          openapiStatus: openapiStatusFor(routeClean),
          consumerFile: rel,
          classification: rule.consolidated ? "consolidated-domain-http-debt" : "app-http-pending-contract",
          recommendation: rule.consolidated ? "migrate-hooks-not-contract" : "contract-candidate",
        });
      }
    }
  }
  return rows;
}

function dedupe(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    const key = [r.kind, r.hook, r.method, r.routeTemplate, r.consumerFile].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => `${a.domain}|${a.routeTemplate}|${a.hook}`.localeCompare(`${b.domain}|${b.routeTemplate}|${b.hook}`));
}

function summarize(rows) {
  const byDomain = new Map();
  for (const row of rows) {
    if (!byDomain.has(row.domain)) {
      byDomain.set(row.domain, {
        domain: row.domain,
        manualHooks: 0,
        directHttp: 0,
        generatedNotMigrated: 0,
        pendingContract: 0,
        consolidated: row.consolidated,
        consumers: new Set(),
        routes: new Set(),
      });
    }
    const d = byDomain.get(row.domain);
    if (row.kind === "manual-hook" && row.classification === "manual-hook-pending-contract") d.manualHooks++;
    if (row.kind.startsWith("direct-")) d.directHttp++;
    if (row.classification === "generated-hook-not-migrated") d.generatedNotMigrated++;
    if (row.recommendation === "contract-candidate") d.pendingContract++;
    if (row.consumerFile) d.consumers.add(row.consumerFile);
    if (row.routeTemplate) d.routes.add(row.routeTemplate);
  }
  return [...byDomain.values()].map((d) => ({
    ...d,
    consumers: [...d.consumers].sort(),
    routes: [...d.routes].sort(),
    consumerCount: d.consumers.size,
    routeCount: d.routes.size,
  })).sort((a, b) => b.pendingContract - a.pendingContract || b.manualHooks - a.manualHooks);
}

const NON_ACTIONABLE_DOMAINS = new Set(["other", "crm-extended"]);

function scoreDomain(d) {
  const touchpoints = d.manualHooks + d.directHttp;
  let score = 0;
  let risk = "medium";
  let size = "medium";

  // Prioritize bounded, abordable domains over raw pending volume.
  if (d.routeCount <= 8 && d.consumerCount <= 3) { score += 28; size = "small"; risk = "low"; }
  else if (d.routeCount <= 15 && d.consumerCount <= 5) { score += 18; size = "small-medium"; risk = "low"; }
  else if (d.routeCount <= 22) { score += 8; }
  else { score -= 12; size = "large"; risk = "high"; }

  if (d.routeCount > 30 || d.manualHooks > 30) { score -= 25; size = "very-large"; risk = "high"; }
  else if (d.routeCount > 25 || d.manualHooks > 20) { score -= 12; size = "large"; risk = "high"; }

  score += Math.min(touchpoints, 12);

  // Evidence-backed domain signals (routes, consumers, backend tests).
  if (d.domain === "delivery") { score += 20; risk = "low"; size = "small-medium"; }
  if (d.domain === "online-orders") { score += 6; size = "small"; }
  if (d.domain === "fiscal-verifactu") { score += 4; risk = "medium"; size = "small"; }
  if (d.domain === "backup") { score += 2; risk = "low"; size = "small"; }

  if (d.domain === "inventory-purchasing") { score -= 30; risk = "high"; size = "very-large"; }
  if (d.domain === "catalog-admin") { score -= 18; risk = "high"; size = "large"; }
  if (d.domain === "fichaje") { score -= 14; risk = "medium-high"; size = "large"; }
  if (d.domain === "director") { score -= 16; risk = "medium-high"; size = "large"; }
  if (d.domain === "cash-payments") { score -= 10; risk = "medium-high"; }
  if (d.domain === "hr") { score -= 8; risk = "medium"; }

  return { ...d, score, risk, size };
}

function recommend(domains) {
  const candidates = domains.filter(
    (d) => !d.consolidated && d.pendingContract > 0 && !NON_ACTIONABLE_DOMAINS.has(d.domain),
  );
  const scored = candidates.map(scoreDomain).sort((a, b) => b.score - a.score || a.consumerCount - b.consumerCount);
  return scored[0] ?? null;
}

function candidatesScored(domains) {
  return domains
    .filter((d) => !d.consolidated && d.pendingContract > 0 && !NON_ACTIONABLE_DOMAINS.has(d.domain))
    .map(scoreDomain)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ domain, score, pendingContract, routeCount, consumerCount, risk, size }) => ({
      domain, score, pendingContract, routeCount, consumerCount, risk, size,
    }));
}

function toCsv(rows) {
  const header = "domain,hook,method,route,consumerFile,openapiStatus,classification,recommendation,kind";
  const lines = rows.map((r) => [
    r.domain,
    r.hook,
    r.method,
    `"${(r.routeTemplate || "").replace(/"/g, '""')}"`,
    r.consumerFile,
    r.openapiStatus,
    r.classification,
    r.recommendation,
    r.kind,
  ].join(","));
  return [header, ...lines].join("\n");
}

function main() {
  const specText = fs.readFileSync(path.join(root, "lib/api-spec/openapi.yaml"), "utf8");
  openApiPaths = parseOpenApiPaths(specText);
  const apiSource = fs.readFileSync(path.join(root, "lib/api-client-react/src/generated/api.ts"), "utf8");

  const rows = dedupe([
    ...parseManualHooks(apiSource),
    ...parseGeneratedNotCompat(),
    ...scanAppHttp(),
  ]);

  const manualHooks = rows.filter((r) => r.kind === "manual-hook");
  const pendingManualHooks = manualHooks.filter((r) => r.classification === "manual-hook-pending-contract");
  const directHttp = rows.filter((r) => r.kind.startsWith("direct-"));
  const domainSummary = summarize(rows);
  const top = recommend(domainSummary);

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      manualHooksAll: manualHooks.length,
      manualHooksPendingContract: pendingManualHooks.length,
      directHttpCalls: directHttp.length,
      inventoryRows: rows.length,
      openapiOperations: openApiPaths.size,
    },
    consolidatedDomainsExcluded: [...CONSOLIDATED],
    domainSummary,
    recommendedNextDomain: top ? {
      domain: top.domain,
      score: top.score,
      estimatedSize: top.size,
      migrationRisk: top.risk,
      manualHooks: top.manualHooks,
      directHttp: top.directHttp,
      routeCount: top.routeCount,
      consumerCount: top.consumerCount,
      mainConsumers: top.consumers.slice(0, 8),
      routes: top.routes.slice(0, 20),
    } : null,
    recommendationCandidates: candidatesScored(domainSummary),
    rows,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(OUT_CSV, `${toCsv(rows)}\n`);
  console.log(JSON.stringify({
    manualHooksAll: report.totals.manualHooksAll,
    manualHooksPendingContract: report.totals.manualHooksPendingContract,
    directHttpCalls: report.totals.directHttpCalls,
    recommended: report.recommendedNextDomain?.domain,
    sha256: hash(JSON.stringify(report.rows)),
  }, null, 2));
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

main();
