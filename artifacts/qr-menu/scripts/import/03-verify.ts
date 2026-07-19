#!/usr/bin/env tsx
/**
 * Step 3: Verify the import — count records, check refs, report missing images.
 *
 * Run:
 *   CONVEX_URL=https://xxx.convex.cloud \
 *   CONVEX_IMPORT_SECRET=your-secret \
 *   pnpm tsx scripts/import/03-verify.ts
 */

import * as path from "path";
import {
  DATA_DIR, getClient, getSecret, readJsonl,
  loadIdMap, log, fn,
} from "./_shared.js";

const client = getClient();
const secret = getSecret();

type LogEntry = { externalId: string; convexId: string };

async function main() {
  const idMap = loadIdMap();
  log.section("🔍 Piccolo QR — Import verification");

  // ── Table counts ─────────────────────────────────────────────────────────────
  log.section("① Table counts");
  const [catCount, itemCount, brandCount] = await Promise.all([
    client.query(fn.countTable, { table: "categories", secret }) as Promise<number>,
    client.query(fn.countTable, { table: "menuItems", secret }) as Promise<number>,
    client.query(fn.countTable, { table: "branding", secret }) as Promise<number>,
  ]);
  const check = (name: string, got: number, want: number) =>
    got === want ? log.ok(`  ${name}: ${got}/${want} ✓`) : log.error(`  ${name}: ${got}/${want} ✗`);
  check("categories", catCount, 26);
  check("menuItems",  itemCount, 195);
  check("branding",   brandCount, 1);

  // ── ID mapping completeness ───────────────────────────────────────────────────
  log.section("② ID map completeness");
  log.info(`  categories: ${Object.keys(idMap.categories).length}/26`);
  log.info(`  menuItems:  ${Object.keys(idMap.menuItems).length}/195`);
  log.info(`  storage:    ${Object.keys(idMap.storage).length}/262`);

  // ── categoryId refs ───────────────────────────────────────────────────────────
  log.section("③ categoryId ref check");
  const rawItems = await readJsonl<{ _id: string; categoryId: string; name: string; imageStorageId?: string }>(
    path.join(DATA_DIR, "menuItems/documents.jsonl"),
  );
  let brokenCats = 0;
  for (const item of rawItems) {
    if (!idMap.categories[item.categoryId]) {
      log.error(`  "${item.name}" → unmapped categoryId ${item.categoryId}`);
      brokenCats++;
    }
  }
  if (brokenCats === 0) log.ok("  All 195 categoryId refs mapped ✓");

  // ── Storage refs ──────────────────────────────────────────────────────────────
  log.section("④ Storage ref check");
  let hasStorage = 0, missingStorage = 0;
  for (const item of rawItems) {
    if (item.imageStorageId) {
      hasStorage++;
      if (!idMap.storage[item.imageStorageId]) missingStorage++;
    }
  }
  if (missingStorage === 0) log.ok(`  All ${hasStorage} imageStorageId refs mapped ✓`);
  else log.error(`  ${missingStorage}/${hasStorage} imageStorageId refs unmapped — run step 2`);

  // ── Import log ────────────────────────────────────────────────────────────────
  log.section("⑤ Import log");
  const summary = await client.query(fn.getImportSummary, { secret });
  for (const [table, counts] of Object.entries(summary)) {
    const total = Object.values(counts as Record<string, number>).reduce((a, b) => a + b, 0);
    log.info(`  ${table}: ${total} (${JSON.stringify(counts)})`);
  }

  const allOk =
    catCount === 26 && itemCount === 195 && brandCount === 1 &&
    brokenCats === 0 && missingStorage === 0;

  log.section(allOk ? "✅ All checks passed" : "⚠️  Some checks failed — see above");
}

main().catch((err) => { console.error(err); process.exit(1); });
