#!/usr/bin/env tsx
/**
 * Step 2: Upload media files from the 4 media ZIPs and patch storage ID refs.
 *
 * Prerequisites:
 *   - Step 1 complete (01-import-tables.ts ran successfully).
 *   - Media ZIPs in import_piccolo_qr/media/:
 *       piccolo_qr_media_01.zip  (~111 MB)
 *       piccolo_qr_media_02.zip  (~118 MB)
 *       piccolo_qr_media_03.zip  (~120 MB)
 *       piccolo_qr_media_04.zip  (~116 MB)
 *
 * Run:
 *   CONVEX_URL=https://xxx.convex.cloud \
 *   CONVEX_IMPORT_SECRET=your-secret \
 *   pnpm tsx scripts/import/02-import-storage.ts
 *
 * Reanudable: already-uploaded files are skipped.
 */

import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";
import {
  DATA_DIR, getClient, getSecret, readJsonl,
  loadIdMap, saveIdMap, log, fn,
} from "./_shared.js";

const client = getClient();
const secret = getSecret();
const MEDIA_DIR = path.join(DATA_DIR, "media");

interface StorageEntry {
  _id: string;
  _creationTime: number;
  internalId: string;
  contentType: string;
  size: number;
  sha256: string;
}

interface RawMenuItem {
  _id: string;
  imageStorageId?: string;
  videoStorageId?: string;
  _oldImageStorageId?: string;
  _oldVideoStorageId?: string;
}

interface RawBranding {
  _id: string;
  heroImageStorageId?: string;
  heroVideoStorageId?: string;
}

function findInZips(internalId: string, zips: AdmZip[]): Buffer | null {
  for (const zip of zips) {
    const entry = zip.getEntry(internalId);
    if (entry) return zip.readFile(entry);
  }
  return null;
}

async function uploadToConvex(uploadUrl: string, data: Buffer, contentType: string): Promise<string> {
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: data,
  });
  if (!res.ok) throw new Error(`Upload HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json() as { storageId: string };
  return json.storageId;
}

type LogEntry = { externalId: string; convexId: string };

async function main() {
  const idMap = loadIdMap();

  const storageEntries = await readJsonl<StorageEntry>(
    path.join(DATA_DIR, "_storage/documents.jsonl"),
  );
  log.info(`${storageEntries.length} storage entries`);

  const storageLog: LogEntry[] = await client.query(fn.getImportLog, { table: "_storage", secret });
  const uploadedIds = new Set(storageLog.map((e) => e.externalId));
  log.info(`${uploadedIds.size} already uploaded, ${storageEntries.length - uploadedIds.size} to go`);

  // Restore already-mapped storage IDs
  for (const entry of storageLog) {
    idMap.storage[entry.externalId] = entry.convexId;
  }

  // Open ZIPs
  const zipPaths = ["01","02","03","04"]
    .map((n) => path.join(MEDIA_DIR, `piccolo_qr_media_${n}.zip`))
    .filter((p) => fs.existsSync(p));

  if (zipPaths.length === 0) {
    log.error(`No media ZIPs found in ${MEDIA_DIR}`);
    log.info("Copy the piccolo_qr_media_XX.zip files there and re-run.");
    process.exit(1);
  }
  log.info(`Opened ${zipPaths.length} ZIP(s)`);
  const zips = zipPaths.map((p) => new AdmZip(p));

  // ── Upload ─────────────────────────────────────────────────────────────────
  log.section("① Uploading files…");
  let uploaded = 0, skipped = 0, missing = 0;

  for (const entry of storageEntries) {
    if (uploadedIds.has(entry._id)) { skipped++; continue; }

    const data = findInZips(entry.internalId, zips);
    if (!data) {
      log.error(`  Not found in any ZIP: ${entry.internalId}`);
      missing++;
      continue;
    }

    try {
      const uploadUrl: string = await client.mutation(fn.generateImportUploadUrl, { secret });
      const newId = await uploadToConvex(uploadUrl, data, entry.contentType);
      idMap.storage[entry._id] = newId;
      await client.mutation(fn.markImported, {
        table: "_storage",
        externalId: entry._id,
        convexId: newId,
        status: "ok",
        secret,
      });
      uploaded++;
      if (uploaded % 25 === 0) {
        log.ok(`  ${uploaded + skipped}/${storageEntries.length}`);
        saveIdMap(idMap);
      }
    } catch (err) {
      log.error(`  Failed ${entry.internalId}: ${err}`);
      missing++;
    }
  }
  saveIdMap(idMap);
  log.ok(`Uploads done: ${uploaded} new, ${skipped} skipped, ${missing} missing`);

  // ── Patch menuItems ────────────────────────────────────────────────────────
  log.section("② Patching menu item storage refs…");
  const rawItems = await readJsonl<RawMenuItem>(
    path.join(DATA_DIR, "menuItems/documents.jsonl"),
  );
  let patched = 0;

  for (const item of rawItems) {
    const newItemId = idMap.menuItems[item._id];
    if (!newItemId) continue;

    const fields: Record<string, string> = {};
    if (item.imageStorageId) {
      const nid = idMap.storage[item.imageStorageId];
      if (nid) fields.imageStorageId = nid;
    }
    if (item.videoStorageId) {
      const nid = idMap.storage[item.videoStorageId];
      if (nid) fields.videoStorageId = nid;
    }
    if (Object.keys(fields).length === 0) continue;

    await client.mutation(fn.patchDocument, {
      table: "menuItems",
      convexId: newItemId,
      fields,
      secret,
    });
    patched++;
  }
  log.ok(`Patched ${patched} menu items`);

  // ── Patch branding ─────────────────────────────────────────────────────────
  log.section("③ Patching branding storage refs…");
  const rawBranding = await readJsonl<RawBranding>(
    path.join(DATA_DIR, "branding/documents.jsonl"),
  );
  for (const brand of rawBranding) {
    const newBrandId = idMap.branding[brand._id];
    if (!newBrandId) continue;
    const fields: Record<string, string> = {};
    if (brand.heroImageStorageId) {
      const nid = idMap.storage[brand.heroImageStorageId];
      if (nid) fields.heroImageStorageId = nid;
      else log.error(`  Hero image not mapped: ${brand.heroImageStorageId}`);
    }
    if (brand.heroVideoStorageId) {
      const nid = idMap.storage[brand.heroVideoStorageId];
      if (nid) fields.heroVideoStorageId = nid;
    }
    if (Object.keys(fields).length > 0) {
      await client.mutation(fn.patchDocument, {
        table: "branding",
        convexId: newBrandId,
        fields,
        secret,
      });
      log.ok("  Branding hero image patched");
    }
  }

  saveIdMap(idMap);
  log.section("✅ Step 2 complete");
  log.info("Next: 03-verify.ts");
}

main().catch((err) => { console.error(err); process.exit(1); });
