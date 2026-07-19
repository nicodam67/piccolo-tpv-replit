#!/usr/bin/env tsx
/**
 * import-data.ts — Importa categorías, productos y branding desde un backup.
 *
 * Uso:
 *   CONVEX_URL=https://xxx.convex.cloud \
 *   CONVEX_IMPORT_SECRET=your-secret \
 *   npx tsx scripts/import-data.ts --input ./import_piccolo_qr
 *
 * Opciones:
 *   --input <dir>   Directorio raíz del backup (obligatorio)
 *   --batch <n>     Tamaño de lote (por defecto: 25)
 *   --force         Re-importa aunque ya existan registros en importLog
 *
 * Reanudable: los registros ya presentes en importLog se saltan
 *             automáticamente (a menos que se use --force).
 * El mapa de IDs se guarda en <input>/.id-map.json.
 */

import * as fs from "fs";
import * as path from "path";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { ConvexHttpClient } from "convex/browser";

// ── Arg parsing ────────────────────────────────────────────────────────────────
function parseArgs(): { input: string; batch: number; force: boolean; check: boolean; selfTest: boolean } {
  const argv = process.argv.slice(2);
  let input = "";
  let batch = 25;
  let force = false;
  let check = false;
  let selfTest = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input" && argv[i + 1]) { input = argv[++i]; }
    else if (argv[i] === "--batch" && argv[i + 1]) { batch = parseInt(argv[++i], 10); }
    else if (argv[i] === "--force") { force = true; }
    else if (argv[i] === "--check") { check = true; }
    else if (argv[i] === "--self-test") { selfTest = true; }
  }
  // --self-test and --check don't need --input
  if (!selfTest && !check) {
    if (!input) { console.error("Error: --input <dir> is required"); process.exit(1); }
    if (!fs.existsSync(input)) { console.error(`Error: input directory not found: ${input}`); process.exit(1); }
  }
  return { input: input ? path.resolve(input) : "", batch, force, check, selfTest };
}

// ── Pre-import structural validation ──────────────────────────────────────────
// Validates the backup's category hierarchy WITHOUT contacting Convex.
// Exits non-zero if any sub-category references a parentId that does not exist
// in the same JSONL file — confirming the script would fail, not silently flatten.
interface RawCatForCheck { _id: string; name: string; order: number; parentId?: string; }

function validateCategoryHierarchy(cats: RawCatForCheck[]): { ok: boolean; errors: string[] } {
  const allIds = new Set(cats.map((c) => c._id));
  const errors: string[] = [];

  // ── Check 1: missing parent references ──────────────────────────────────────
  for (const cat of cats) {
    if (cat.parentId && !allIds.has(cat.parentId)) {
      errors.push(`"${cat.name}" (${cat._id}) references unknown parentId "${cat.parentId}"`);
    }
  }

  // ── Check 2: cycle detection via 3-state DFS over ALL nodes ─────────────────
  // Following parentId edges (child → parent). Starting DFS from every unvisited
  // node ensures rootless cycles (A→B→C→A with no external root) are caught,
  // not only cycles reachable from top-level entries.
  // States: 0 = unvisited, 1 = currently on path (GRAY), 2 = fully explored (BLACK)
  const UNVISITED = 0, VISITING = 1, VISITED = 2;
  const state: Record<string, number> = {};
  for (const cat of cats) state[cat._id] = UNVISITED;

  // Only follow parentId edges that resolve within this backup (missing-parent
  // errors are reported above; here we only traverse known edges to avoid noise).
  const parentOf: Record<string, string | undefined> = {};
  for (const cat of cats) {
    parentOf[cat._id] = cat.parentId && allIds.has(cat.parentId) ? cat.parentId : undefined;
  }

  function dfs(id: string): string | null {
    if (state[id] === VISITING) return id;   // back-edge → cycle
    if (state[id] === VISITED)  return null;  // already confirmed clean

    state[id] = VISITING;
    const pid = parentOf[id];
    if (pid !== undefined) {
      const cycleNode = dfs(pid);
      if (cycleNode !== null) return cycleNode;
    }
    state[id] = VISITED;
    return null;
  }

  for (const cat of cats) {
    if (state[cat._id] === UNVISITED) {
      const cycleId = dfs(cat._id);
      if (cycleId !== null) {
        const cycleCat = cats.find((c) => c._id === cycleId);
        errors.push(`Cycle detected involving "${cycleCat?.name ?? cycleId}" (${cycleId})`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// ── Self-test: verifies validateCategoryHierarchy rejects all corrupt cases ───
// Run with: npx tsx scripts/import-data.ts --self-test
function runSelfTest(): void {
  const pass = (label: string) => console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  const fail = (label: string, detail: string) => { console.error(`  \x1b[31m✗\x1b[0m ${label}: ${detail}`); process.exitCode = 1; };

  // Fixture helpers
  const cat = (id: string, name: string, parentId?: string): RawCatForCheck => ({ _id: id, name, order: 1, parentId });

  // (a) Valid hierarchy — must pass
  {
    const cats = [cat("A", "Root A"), cat("B", "Sub B", "A"), cat("C", "Root C")];
    const { ok } = validateCategoryHierarchy(cats);
    ok ? pass("valid tree passes") : fail("valid tree passes", "unexpectedly reported errors");
  }

  // (b) Missing parent — must fail
  {
    const cats = [cat("A", "Root"), cat("B", "Child", "MISSING")];
    const { ok, errors } = validateCategoryHierarchy(cats);
    !ok && errors.some((e) => e.includes("MISSING"))
      ? pass("missing parent detected")
      : fail("missing parent detected", `ok=${ok} errors=${JSON.stringify(errors)}`);
  }

  // (c) Rooted cycle: Root→A, A→B, B→Root (B's parentId = Root)
  {
    const cats = [cat("Root", "Root"), cat("A", "A", "Root"), cat("B", "B", "A"), cat("C", "C (extra)", "Root")];
    // Introduce cycle: Root.parentId = B
    cats[0] = { ...cats[0], parentId: "B" };
    const { ok, errors } = validateCategoryHierarchy(cats);
    !ok && errors.some((e) => e.includes("Cycle"))
      ? pass("rooted cycle detected")
      : fail("rooted cycle detected", `ok=${ok} errors=${JSON.stringify(errors)}`);
  }

  // (d) Rootless cycle: A→B→C→A (none have an external parent)
  {
    const cats = [cat("A", "A", "C"), cat("B", "B", "A"), cat("C", "C", "B")];
    const { ok, errors } = validateCategoryHierarchy(cats);
    !ok && errors.some((e) => e.includes("Cycle"))
      ? pass("rootless cycle detected")
      : fail("rootless cycle detected", `ok=${ok} errors=${JSON.stringify(errors)}`);
  }

  // (e) Mixed: valid nodes + one rootless cycle component
  {
    const cats = [
      cat("Good1", "Valid root"),
      cat("Good2", "Valid sub", "Good1"),
      cat("X", "X", "Z"),   // rootless cycle X→Z→Y→X
      cat("Y", "Y", "X"),
      cat("Z", "Z", "Y"),
    ];
    const { ok, errors } = validateCategoryHierarchy(cats);
    !ok && errors.some((e) => e.includes("Cycle"))
      ? pass("rootless cycle in mixed graph detected")
      : fail("rootless cycle in mixed graph detected", `ok=${ok} errors=${JSON.stringify(errors)}`);
  }

  if (process.exitCode === 1) {
    console.error("\nSelf-test FAILED — fix validateCategoryHierarchy before running import.");
  } else {
    console.log("\n\x1b[32mAll self-test cases passed.\x1b[0m");
  }
}

// ── Client ─────────────────────────────────────────────────────────────────────
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

// ── JSONL reader ───────────────────────────────────────────────────────────────
async function readJsonl<T>(filePath: string): Promise<T[]> {
  const results: T[] = [];
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (t) results.push(JSON.parse(t) as T);
  }
  return results;
}

function tryJsonl<T>(dir: string, name: string): string | null {
  // Supports both <dir>/<name>/documents.jsonl and <dir>/<name>.jsonl
  const nested = path.join(dir, name, "documents.jsonl");
  if (fs.existsSync(nested)) return nested;
  const flat = path.join(dir, `${name}.jsonl`);
  if (fs.existsSync(flat)) return flat;
  return null;
}

// ── ID map ─────────────────────────────────────────────────────────────────────
interface IdMap { categories: Record<string,string>; menuItems: Record<string,string>; branding: Record<string,string>; storage: Record<string,string>; }
function loadIdMap(dir: string): IdMap {
  const p = path.join(dir, ".id-map.json");
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8")) as IdMap;
  return { categories: {}, menuItems: {}, branding: {}, storage: {} };
}
function saveIdMap(dir: string, map: IdMap): void {
  fs.writeFileSync(path.join(dir, ".id-map.json"), JSON.stringify(map, null, 2));
}

// ── Logging ────────────────────────────────────────────────────────────────────
const C = { reset:"\x1b[0m", green:"\x1b[32m", yellow:"\x1b[33m", red:"\x1b[31m", cyan:"\x1b[36m", bold:"\x1b[1m" };
const log = {
  info:    (m: string) => console.log(`${C.cyan}ℹ${C.reset} ${m}`),
  ok:      (m: string) => console.log(`${C.green}✓${C.reset} ${m}`),
  skip:    (m: string) => console.log(`${C.yellow}↷${C.reset} ${m}`),
  error:   (m: string) => console.error(`${C.red}✗${C.reset} ${m}`),
  section: (m: string) => console.log(`\n${C.bold}${m}${C.reset}`),
};

// ── Function references ────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn: Record<string, any> = {
  importBatch:      "importSupport:importBatch",
  getImportLog:     "importSupport:getImportLog",
  getImportSummary: "importSupport:getImportSummary",
};

type LogEntry = { externalId: string; convexId: string };

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const { input, batch: BATCH, force, check, selfTest } = parseArgs();

  // ── --self-test mode: unit-test validateCategoryHierarchy in-process ─────────
  if (selfTest) {
    log.section("🧪 Self-test — validateCategoryHierarchy");
    runSelfTest();
    return;
  }

  // ── --check mode: validate backup structure without importing ────────────────
  // Confirms the script will FAIL (not silently flatten) when parents are missing.
  if (check) {
    log.section("🔍 Backup structure check (--check, no import)");
    const catFile = tryJsonl(input, "categories");
    if (!catFile) { log.error("categories/documents.jsonl not found"); process.exit(1); }
    const rawCats = await readJsonl<RawCatForCheck>(catFile);
    log.info(`${rawCats.length} categories found`);
    const { ok, errors } = validateCategoryHierarchy(rawCats);
    if (ok) {
      log.ok("Category hierarchy is valid — all parentId refs resolve within the backup.");
      const topCount = rawCats.filter((c) => !c.parentId).length;
      const subCount = rawCats.filter((c) => !!c.parentId).length;
      log.info(`  Top-level: ${topCount}, Sub-categories: ${subCount}`);
    } else {
      log.error(`Category hierarchy has ${errors.length} error(s):`);
      for (const e of errors) log.error(`  ${e}`);
      log.error("Fix the backup before importing. The script would exit(1) on these.");
      process.exit(1);
    }
    log.info("Run without --check to start the actual import.");
    return;
  }

  const client = getClient();
  const secret = getSecret();
  const idMap = loadIdMap(input);

  log.section("🗂  Piccolo QR — import-data.ts");
  log.info(`Input: ${input}`);
  log.info(`Batch: ${BATCH}   Force: ${force}`);

  // ── 1. Categories ────────────────────────────────────────────────────────────
  const catFile = tryJsonl(input, "categories");
  if (!catFile) { log.error("categories/documents.jsonl not found — skipping"); }
  else {
    log.section("① Categories");
    interface RawCat { _id: string; _creationTime: number; name: string; order: number; description?: string; parentId?: string; available?: boolean; translations?: Record<string, { name?: string; description?: string }>; }
    const rawCats = await readJsonl<RawCat>(catFile);
    const catLog: LogEntry[] = force ? [] : await client.query(fn.getImportLog, { table: "categories", secret });
    const imported = new Set(catLog.map((e) => e.externalId));
    catLog.forEach((e) => { idMap.categories[e.externalId] = e.convexId; });

    // Pass 1: top-level categories (no parentId)
    const topLevel = rawCats.filter((c) => !c.parentId);
    const subLevel = rawCats.filter((c) => !!c.parentId);

    for (const cat of topLevel) {
      if (imported.has(cat._id)) {
        const e = catLog.find((l) => l.externalId === cat._id);
        if (e) idMap.categories[cat._id] = e.convexId;
        log.skip(`  "${cat.name}" already imported`);
        continue;
      }
      const { _id, _creationTime, parentId: _unused, ...rest } = cat;
      const results: LogEntry[] = await client.mutation(fn.importBatch, {
        table: "categories", records: [{ _id, _creationTime, ...rest }], secret,
      });
      idMap.categories[_id] = results[0].convexId;
      log.ok(`  ${cat.name}`);
    }
    saveIdMap(input, idMap);

    // Pass 2: sub-categories — STRICT parent validation; never insert without mapped parentId
    let catErrors = 0;
    for (const cat of subLevel) {
      if (imported.has(cat._id)) {
        const e = catLog.find((l) => l.externalId === cat._id);
        if (e) idMap.categories[cat._id] = e.convexId;
        log.skip(`  "${cat.name}" (sub) already imported`);
        continue;
      }
      const mappedParent = idMap.categories[cat.parentId!];
      if (!mappedParent) {
        // Strict: never insert a sub-category without a resolved parent — doing
        // so would silently promote it to top-level, corrupting the hierarchy.
        log.error(`  SKIP "${cat.name}" — parentId ${cat.parentId} not in idMap (import parent first)`);
        catErrors++;
        continue;
      }
      const { _id, _creationTime, parentId: _old, ...rest } = cat;
      const results: LogEntry[] = await client.mutation(fn.importBatch, {
        table: "categories",
        records: [{ _id, _creationTime, ...rest, parentId: mappedParent }],
        secret,
      });
      idMap.categories[_id] = results[0].convexId;
      log.ok(`  ${cat.name} (sub)`);
    }
    saveIdMap(input, idMap);

    if (catErrors > 0) {
      log.error(`${catErrors} sub-categor${catErrors === 1 ? "y" : "ies"} skipped due to unmapped parentId.`);
      log.error("Fix: ensure the parent categories are imported first, then re-run.");
      process.exit(1);
    }

    // ── Post-category integrity check ─────────────────────────────────────────
    // Verify that every sub-category in the backup has a resolved entry in idMap.
    // This prevents silent hierarchy corruption before we move on to menu items.
    const unmappedSubs = subLevel.filter((c) => !idMap.categories[c._id]);
    if (unmappedSubs.length > 0) {
      log.error(`Integrity check FAILED: ${unmappedSubs.length} sub-categories not mapped after import.`);
      for (const c of unmappedSubs.slice(0, 10)) {
        log.error(`  Missing: "${c.name}" (${c._id}), parent: ${c.parentId}`);
      }
      process.exit(1);
    }
    log.ok(`Post-import integrity check passed — all ${rawCats.length} categories mapped.`);
    log.ok(`Categories: ${Object.keys(idMap.categories).length} mapped`);
  }

  // ── 2. Menu items ─────────────────────────────────────────────────────────────
  const itemFile = tryJsonl(input, "menuItems");
  if (!itemFile) { log.error("menuItems/documents.jsonl not found — skipping"); }
  else {
    log.section("② Menu items");
    interface RawItem { _id: string; _creationTime: number; categoryId: string; name: string; price: number; available: boolean; order: number; description?: string; imageUrl?: string; imageStorageId?: string; videoStorageId?: string; quantity?: string; tags?: string[]; halfPortionPrice?: number; allergens?: string[]; translations?: Record<string, { name?: string; description?: string }>; }
    const rawItems = await readJsonl<RawItem>(itemFile);
    const itemLog: LogEntry[] = force ? [] : await client.query(fn.getImportLog, { table: "menuItems", secret });
    const imported = new Set(itemLog.map((e) => e.externalId));
    itemLog.forEach((e) => { idMap.menuItems[e.externalId] = e.convexId; });

    let done = 0, skipped = 0;
    for (let i = 0; i < rawItems.length; i += BATCH) {
      const batch = rawItems.slice(i, i + BATCH);
      const toImport = batch.filter((item) => {
        if (imported.has(item._id)) { skipped++; const e = itemLog.find((l) => l.externalId === item._id); if (e) idMap.menuItems[item._id] = e.convexId; return false; }
        return true;
      });
      if (!toImport.length) continue;

      const remapped = toImport.map(({ imageStorageId, videoStorageId, ...item }) => ({
        ...item,
        categoryId: idMap.categories[item.categoryId] ?? item.categoryId,
        // imageStorageId / videoStorageId patched by import-images.ts after upload
      }));
      const results: LogEntry[] = await client.mutation(fn.importBatch, { table: "menuItems", records: remapped, secret });
      toImport.forEach((item, idx) => { idMap.menuItems[item._id] = results[idx].convexId; });
      done += toImport.length;
      log.ok(`  ${Math.min(i + BATCH, rawItems.length)}/${rawItems.length}`);
    }
    saveIdMap(input, idMap);
    log.ok(`Menu items: ${done} imported, ${skipped} skipped`);
  }

  // ── 3. Branding ───────────────────────────────────────────────────────────────
  const brandFile = tryJsonl(input, "branding");
  if (!brandFile) { log.error("branding/documents.jsonl not found — skipping"); }
  else {
    log.section("③ Branding");
    interface RawBrand { _id: string; _creationTime: number; heroImageStorageId?: string; heroVideoStorageId?: string; [k: string]: unknown; }
    const rawBranding = await readJsonl<RawBrand>(brandFile);
    const brandLog: LogEntry[] = force ? [] : await client.query(fn.getImportLog, { table: "branding", secret });
    const imported = new Set(brandLog.map((e) => e.externalId));
    brandLog.forEach((e) => { idMap.branding[e.externalId] = e.convexId; });

    for (const brand of rawBranding) {
      if (imported.has(brand._id)) { log.skip("  Branding already imported"); const e = brandLog.find((l) => l.externalId === brand._id); if (e) idMap.branding[brand._id] = e.convexId; continue; }
      const { heroImageStorageId, heroVideoStorageId, ...rest } = brand;
      const results: LogEntry[] = await client.mutation(fn.importBatch, { table: "branding", records: [rest], secret });
      idMap.branding[brand._id] = results[0].convexId;
      log.ok(`  Branding → ${results[0].convexId}`);
    }
    saveIdMap(input, idMap);
  }

  // ── Summary ───────────────────────────────────────────────────────────────────
  log.section("✅ import-data complete");
  const summary = await client.query(fn.getImportSummary, { secret });
  console.log(JSON.stringify(summary, null, 2));
  log.info("Next step: npx tsx scripts/import-images.ts --input " + input);
}

main().catch((err) => { console.error(err); process.exit(1); });
