#!/usr/bin/env tsx
/**
 * Step 1: Import categories, menuItems, and branding into the new Convex project.
 *
 * Run:
 *   CONVEX_URL=https://xxx.convex.cloud \
 *   CONVEX_IMPORT_SECRET=your-secret \
 *   pnpm tsx scripts/import/01-import-tables.ts
 *
 * Reanudable: already-imported records are skipped (checked via importLog in Convex).
 * ID mappings persisted locally to import_piccolo_qr/.id-map.json.
 */

import * as path from "path";
import {
  DATA_DIR, getClient, getSecret, readJsonl,
  loadIdMap, saveIdMap, log, fn, type IdMap,
} from "./_shared.js";

const client = getClient();
const secret = getSecret();

interface RawCategory {
  _id: string;
  _creationTime: number;
  name: string;
  order: number;
  description?: string;
  parentId?: string;
  available?: boolean;
  translations?: Record<string, { name?: string; description?: string }>;
}

interface RawMenuItem {
  _id: string;
  _creationTime: number;
  categoryId: string;
  name: string;
  price: number;
  available: boolean;
  order: number;
  description?: string;
  imageUrl?: string;
  imageStorageId?: string;
  videoStorageId?: string;
  quantity?: string;
  tags?: string[];
  halfPortionPrice?: number;
  allergens?: string[];
  translations?: Record<string, { name?: string; description?: string }>;
}

interface RawBranding {
  _id: string;
  _creationTime: number;
  heroImageStorageId?: string;
  heroVideoStorageId?: string;
  [key: string]: unknown;
}

type LogEntry = { externalId: string; convexId: string };

async function main() {
  const idMap: IdMap = loadIdMap();

  // ── 1. Categories ──────────────────────────────────────────────────────────
  log.section("① Importing categories (26 total)…");
  const rawCats = await readJsonl<RawCategory>(
    path.join(DATA_DIR, "categories/documents.jsonl"),
  );
  const catLog: LogEntry[] = await client.query(fn.getImportLog, { table: "categories", secret });
  const importedCatIds = new Set(catLog.map((e) => e.externalId));

  const topLevel = rawCats.filter((c) => !c.parentId);
  const subLevel = rawCats.filter((c) => c.parentId);

  for (const cat of topLevel) {
    if (importedCatIds.has(cat._id)) {
      const entry = catLog.find((e) => e.externalId === cat._id);
      if (entry) idMap.categories[cat._id] = entry.convexId;
      log.skip(`  "${cat.name}" already imported`);
      continue;
    }
    const { _id, _creationTime, ...data } = cat;
    const results: LogEntry[] = await client.mutation(fn.importBatch, {
      table: "categories",
      records: [{ _id, _creationTime, ...data }],
      secret,
    });
    idMap.categories[_id] = results[0].convexId;
    log.ok(`  ${cat.name}`);
  }

  for (const cat of subLevel) {
    if (importedCatIds.has(cat._id)) {
      const entry = catLog.find((e) => e.externalId === cat._id);
      if (entry) idMap.categories[cat._id] = entry.convexId;
      log.skip(`  "${cat.name}" (sub) already imported`);
      continue;
    }
    const newParentId = idMap.categories[cat.parentId!];
    if (!newParentId) {
      log.error(`  Parent not mapped for "${cat.name}" (${cat.parentId})`);
      continue;
    }
    const results: LogEntry[] = await client.mutation(fn.importBatch, {
      table: "categories",
      records: [{ ...cat, parentId: newParentId }],
      secret,
    });
    idMap.categories[cat._id] = results[0].convexId;
    log.ok(`  ${cat.name} (sub)`);
  }
  saveIdMap(idMap);
  log.ok(`Categories done — ${Object.keys(idMap.categories).length} mapped.`);

  // ── 2. Menu items ──────────────────────────────────────────────────────────
  log.section("② Importing menu items (195 total)…");
  const rawItems = await readJsonl<RawMenuItem>(
    path.join(DATA_DIR, "menuItems/documents.jsonl"),
  );
  const itemLog: LogEntry[] = await client.query(fn.getImportLog, { table: "menuItems", secret });
  const importedItemIds = new Set(itemLog.map((e) => e.externalId));

  let done = 0, skipped = 0;
  const BATCH = 20;

  for (let i = 0; i < rawItems.length; i += BATCH) {
    const batch = rawItems.slice(i, i + BATCH);
    const toImport = batch.filter((item) => {
      if (importedItemIds.has(item._id)) {
        const entry = itemLog.find((e) => e.externalId === item._id);
        if (entry) idMap.menuItems[item._id] = entry.convexId;
        skipped++;
        return false;
      }
      return true;
    });
    if (toImport.length === 0) continue;

    // Remap categoryId; strip old storage IDs (step 2 reads source JSONL + idMap to patch them)
    const remapped = toImport.map((item) => {
      const { imageStorageId, videoStorageId, ...rest } = item;
      return {
        ...rest,
        categoryId: idMap.categories[item.categoryId] ?? item.categoryId,
        // imageStorageId and videoStorageId intentionally omitted —
        // 02-import-storage.ts re-reads the source JSONL and patches them
        // after uploading the actual files to the new Convex storage.
      };
    });

    const results: LogEntry[] = await client.mutation(fn.importBatch, {
      table: "menuItems",
      records: remapped,
      secret,
    });
    toImport.forEach((item, idx) => {
      idMap.menuItems[item._id] = results[idx].convexId;
    });
    done += toImport.length;
    log.ok(`  ${Math.min(i + BATCH, rawItems.length)}/${rawItems.length}`);
  }
  saveIdMap(idMap);
  log.ok(`Menu items done — ${done} imported, ${skipped} skipped.`);

  // ── 3. Branding ────────────────────────────────────────────────────────────
  log.section("③ Importing branding…");
  const rawBranding = await readJsonl<RawBranding>(
    path.join(DATA_DIR, "branding/documents.jsonl"),
  );
  const brandLog: LogEntry[] = await client.query(fn.getImportLog, { table: "branding", secret });
  const importedBrandIds = new Set(brandLog.map((e) => e.externalId));

  for (const brand of rawBranding) {
    if (importedBrandIds.has(brand._id)) {
      const entry = brandLog.find((e) => e.externalId === brand._id);
      if (entry) idMap.branding[brand._id] = entry.convexId;
      log.skip("  Branding already imported");
      continue;
    }
    // Strip old storage IDs — 02-import-storage.ts re-reads source JSONL + idMap to patch them
    const { heroImageStorageId, heroVideoStorageId, ...rest } = brand;
    const record = { ...rest };
    const results: LogEntry[] = await client.mutation(fn.importBatch, {
      table: "branding",
      records: [record],
      secret,
    });
    idMap.branding[brand._id] = results[0].convexId;
    log.ok(`  Branding → ${results[0].convexId}`);
  }
  saveIdMap(idMap);

  // ── Summary ────────────────────────────────────────────────────────────────
  log.section("✅ Step 1 complete");
  const summary = await client.query(fn.getImportSummary, { secret });
  console.log("Import log:\n", JSON.stringify(summary, null, 2));
  log.info("Next: 02-import-storage.ts (once media ZIPs are in import_piccolo_qr/media/)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
