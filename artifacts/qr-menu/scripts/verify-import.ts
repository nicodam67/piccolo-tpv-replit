#!/usr/bin/env tsx
/**
 * verify-import.ts — Compara el backup original con los datos en Convex.
 *
 * Uso:
 *   CONVEX_URL=https://xxx.convex.cloud \
 *   CONVEX_IMPORT_SECRET=your-secret \
 *   npx tsx scripts/verify-import.ts --input ./import_piccolo_qr
 *
 * Opciones:
 *   --input <dir>   Directorio raíz del backup (obligatorio)
 *   --expected-categories <n>   Número esperado de categorías (default: auto)
 *   --expected-items <n>        Número esperado de productos (default: auto)
 *
 * Genera: <input>/verify-report.json
 */

import * as fs from "fs";
import * as path from "path";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { ConvexHttpClient } from "convex/browser";

// ── Arg parsing ────────────────────────────────────────────────────────────────
function parseArgs() {
  const argv = process.argv.slice(2);
  let input = "";
  let expectedCategories = -1;
  let expectedItems = -1;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input"                && argv[i+1]) { input = argv[++i]; }
    else if (argv[i] === "--expected-categories" && argv[i+1]) { expectedCategories = parseInt(argv[++i], 10); }
    else if (argv[i] === "--expected-items"  && argv[i+1]) { expectedItems = parseInt(argv[++i], 10); }
  }
  if (!input) { console.error("Error: --input <dir> is required"); process.exit(1); }
  if (!fs.existsSync(input)) { console.error(`Error: directory not found: ${input}`); process.exit(1); }
  return { input: path.resolve(input), expectedCategories, expectedItems };
}

function getClient(): ConvexHttpClient {
  const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
  if (!url) { console.error("Error: CONVEX_URL must be set"); process.exit(1); }
  return new ConvexHttpClient(url!);
}
function getSecret(): string {
  const s = process.env.CONVEX_IMPORT_SECRET;
  if (!s) { console.error("Error: CONVEX_IMPORT_SECRET must be set"); process.exit(1); }
  return s!;
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  const results: T[] = [];
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) { const t = line.trim(); if (t) results.push(JSON.parse(t) as T); }
  return results;
}

function tryJsonl(dir: string, name: string): string | null {
  const nested = path.join(dir, name, "documents.jsonl");
  if (fs.existsSync(nested)) return nested;
  const flat = path.join(dir, `${name}.jsonl`);
  if (fs.existsSync(flat)) return flat;
  return null;
}

interface IdMap { categories: Record<string,string>; menuItems: Record<string,string>; branding: Record<string,string>; storage: Record<string,string>; }
function loadIdMap(dir: string): IdMap {
  const p = path.join(dir, ".id-map.json");
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8")) as IdMap;
  return { categories: {}, menuItems: {}, branding: {}, storage: {} };
}

const C = { reset:"\x1b[0m", green:"\x1b[32m", yellow:"\x1b[33m", red:"\x1b[31m", cyan:"\x1b[36m", bold:"\x1b[1m" };
const log = {
  info:    (m: string) => console.log(`${C.cyan}ℹ${C.reset} ${m}`),
  ok:      (m: string) => console.log(`${C.green}✓${C.reset} ${m}`),
  warn:    (m: string) => console.log(`${C.yellow}⚠${C.reset} ${m}`),
  error:   (m: string) => console.error(`${C.red}✗${C.reset} ${m}`),
  section: (m: string) => console.log(`\n${C.bold}${m}${C.reset}`),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn: Record<string, any> = {
  countTable:       "importSupport:countTable",
  getImportSummary: "importSupport:getImportSummary",
};

interface VerifyReport {
  generatedAt: string;
  passed: boolean;
  checks: Record<string, { source: number; convex: number; ok: boolean; note?: string }>;
  issues: Array<{ level: "error" | "warning"; message: string }>;
  idMapCompleteness: { categories: string; menuItems: string; storage: string };
  importLogSummary: Record<string, { ok: number; error: number; skipped: number }>;
}

async function main() {
  const { input, expectedCategories, expectedItems } = parseArgs();
  const client = getClient();
  const secret = getSecret();
  const idMap = loadIdMap(input);

  log.section("🔍 Piccolo QR — verify-import.ts");
  log.info(`Input: ${input}`);

  const report: VerifyReport = {
    generatedAt: new Date().toISOString(),
    passed: true,
    checks: {},
    issues: [],
    idMapCompleteness: { categories: "", menuItems: "", storage: "" },
    importLogSummary: {},
  };

  // ── Count source records ────────────────────────────────────────────────────
  let srcCategories = expectedCategories;
  let srcItems = expectedItems;
  let srcBranding = 1;
  let srcStorage = 0;

  const catFile   = tryJsonl(input, "categories");
  const itemFile  = tryJsonl(input, "menuItems");
  const brandFile = tryJsonl(input, "branding");
  const storFile  = tryJsonl(input, "_storage");

  if (catFile  && srcCategories < 0) srcCategories = (await readJsonl(catFile)).length;
  if (itemFile && srcItems < 0)      srcItems       = (await readJsonl(itemFile)).length;
  if (brandFile) srcBranding = (await readJsonl(brandFile)).length;
  if (storFile)  srcStorage  = (await readJsonl(storFile)).length;

  log.section("① Source counts");
  log.info(`  categories: ${srcCategories}, menuItems: ${srcItems}, branding: ${srcBranding}, storage: ${srcStorage}`);

  // ── Convex counts ───────────────────────────────────────────────────────────
  log.section("② Convex counts");
  const [convexCats, convexItems, convexBrand] = await Promise.all([
    client.query(fn.countTable, { table: "categories", secret }) as Promise<number>,
    client.query(fn.countTable, { table: "menuItems",  secret }) as Promise<number>,
    client.query(fn.countTable, { table: "branding",   secret }) as Promise<number>,
  ]);

  function check(name: string, got: number, want: number, note?: string) {
    const ok = got === want;
    report.checks[name] = { source: want, convex: got, ok, note };
    if (ok) { log.ok(`  ${name}: ${got}/${want} ✓`); }
    else { log.error(`  ${name}: ${got}/${want} ✗`); report.issues.push({ level: "error", message: `${name}: expected ${want}, got ${got}` }); report.passed = false; }
  }

  if (srcCategories >= 0) check("categories", convexCats, srcCategories);
  if (srcItems >= 0)      check("menuItems",  convexItems, srcItems);
  check("branding", convexBrand, srcBranding);

  // ── ID map completeness ─────────────────────────────────────────────────────
  log.section("③ ID map completeness");
  const catMapped  = Object.keys(idMap.categories).length;
  const itemMapped = Object.keys(idMap.menuItems).length;
  const storMapped = Object.keys(idMap.storage).length;

  report.idMapCompleteness = {
    categories: srcCategories >= 0 ? `${catMapped}/${srcCategories}` : `${catMapped}`,
    menuItems:  srcItems >= 0      ? `${itemMapped}/${srcItems}`     : `${itemMapped}`,
    storage:    srcStorage > 0     ? `${storMapped}/${srcStorage}`   : `${storMapped}`,
  };

  log.info(`  categories: ${report.idMapCompleteness.categories}`);
  log.info(`  menuItems:  ${report.idMapCompleteness.menuItems}`);
  log.info(`  storage:    ${report.idMapCompleteness.storage}`);

  // ── categoryId ref check ────────────────────────────────────────────────────
  log.section("④ categoryId ref integrity");
  if (itemFile) {
    interface RawItem { _id: string; categoryId: string; name: string; price?: number; imageStorageId?: string; }
    const rawItems = await readJsonl<RawItem>(itemFile);
    let brokenCats = 0, missingPrices = 0, missingImages = 0;
    for (const item of rawItems) {
      if (!idMap.categories[item.categoryId]) { log.error(`  "${item.name}" → unmapped categoryId ${item.categoryId}`); brokenCats++; }
      if (!item.price && item.price !== 0) { missingPrices++; }
      if (!item.imageStorageId) { missingImages++; }
    }
    if (brokenCats === 0) log.ok(`  All ${rawItems.length} categoryId refs mapped ✓`);
    else { report.issues.push({ level: "error", message: `${brokenCats} items with unmapped categoryId` }); report.passed = false; }
    if (missingPrices) { report.issues.push({ level: "warning", message: `${missingPrices} items without price` }); log.warn(`  ${missingPrices} items without price`); }
    if (missingImages) log.info(`  ${missingImages}/${rawItems.length} items without image (normal for some menus)`);
  }

  // ── Storage ref check ───────────────────────────────────────────────────────
  log.section("⑤ Storage ref check");
  if (itemFile) {
    interface RawItem2 { _id: string; imageStorageId?: string; }
    const rawItems = await readJsonl<RawItem2>(itemFile);
    const withImage = rawItems.filter((i) => i.imageStorageId);
    const unmapped  = withImage.filter((i) => !idMap.storage[i.imageStorageId!]);
    if (unmapped.length === 0) log.ok(`  All ${withImage.length} imageStorageId refs mapped ✓`);
    else {
      log.error(`  ${unmapped.length}/${withImage.length} imageStorageId refs unmapped — run import-images.ts`);
      report.issues.push({ level: "error", message: `${unmapped.length} items with unmapped imageStorageId — run import-images.ts` });
      report.passed = false;
    }
  }

  // ── Import log summary ──────────────────────────────────────────────────────
  log.section("⑥ Import log");
  const summary = await client.query(fn.getImportSummary, { secret }) as Record<string, { ok: number; error: number; skipped: number }>;
  report.importLogSummary = summary;
  for (const [table, counts] of Object.entries(summary)) {
    const total = Object.values(counts as Record<string, number>).reduce((a, b) => a + b, 0);
    log.info(`  ${table}: ${total} (ok:${counts.ok} error:${counts.error} skipped:${counts.skipped})`);
    if (counts.error > 0) {
      report.issues.push({ level: "warning", message: `${counts.error} errors in ${table} import log` });
    }
  }

  // ── Save report ─────────────────────────────────────────────────────────────
  const reportPath = path.join(input, "verify-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  log.section(report.passed ? "✅ All checks passed" : "⚠️  Some checks failed — see above and verify-report.json");
  log.ok(`Report: ${reportPath}`);
  log.info("Next: npx tsx scripts/export-import-report.ts --input " + input);

  if (!report.passed) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
