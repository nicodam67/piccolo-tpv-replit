#!/usr/bin/env tsx
/**
 * import-images.ts — Sube imágenes al nuevo Convex Storage y actualiza refs.
 *
 * Uso:
 *   CONVEX_URL=https://xxx.convex.cloud \
 *   CONVEX_IMPORT_SECRET=your-secret \
 *   npx tsx scripts/import-images.ts --input ./import_piccolo_qr
 *
 * Opciones:
 *   --input <dir>   Directorio raíz del backup (obligatorio)
 *   --dry-run       Muestra qué subiría sin hacerlo realmente
 *
 * Estructura esperada en <input>:
 *   _storage/documents.jsonl           — metadatos de archivos
 *   media/piccolo_qr_media_XX.zip      — archivos ZIP con las imágenes
 *   media/*.{jpg,jpeg,png,webp,gif}    — o imágenes sueltas (alternativa)
 *
 * Genera: <input>/images-report.json
 * Reanudable: archivos ya subidos se saltan (verificado vía importLog).
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { ConvexHttpClient } from "convex/browser";
import AdmZip from "adm-zip";

// ── Arg parsing ────────────────────────────────────────────────────────────────
function parseArgs(): { input: string; dryRun: boolean } {
  const argv = process.argv.slice(2);
  let input = "";
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input" && argv[i + 1]) { input = argv[++i]; }
    else if (argv[i] === "--dry-run") { dryRun = true; }
  }
  if (!input) { console.error("Error: --input <dir> is required"); process.exit(1); }
  if (!fs.existsSync(input)) { console.error(`Error: input directory not found: ${input}`); process.exit(1); }
  return { input: path.resolve(input), dryRun };
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

interface IdMap { categories: Record<string,string>; menuItems: Record<string,string>; branding: Record<string,string>; storage: Record<string,string>; }
function loadIdMap(dir: string): IdMap {
  const p = path.join(dir, ".id-map.json");
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8")) as IdMap;
  return { categories: {}, menuItems: {}, branding: {}, storage: {} };
}
function saveIdMap(dir: string, map: IdMap): void {
  fs.writeFileSync(path.join(dir, ".id-map.json"), JSON.stringify(map, null, 2));
}

const C = { reset:"\x1b[0m", green:"\x1b[32m", yellow:"\x1b[33m", red:"\x1b[31m", cyan:"\x1b[36m", bold:"\x1b[1m" };
const log = {
  info:    (m: string) => console.log(`${C.cyan}ℹ${C.reset} ${m}`),
  ok:      (m: string) => console.log(`${C.green}✓${C.reset} ${m}`),
  skip:    (m: string) => console.log(`${C.yellow}↷${C.reset} ${m}`),
  error:   (m: string) => console.error(`${C.red}✗${C.reset} ${m}`),
  section: (m: string) => console.log(`\n${C.bold}${m}${C.reset}`),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn: Record<string, any> = {
  getImportLog:             "importSupport:getImportLog",
  markImported:             "importSupport:markImported",
  generateImportUploadUrl:  "importSupport:generateImportUploadUrl",
  patchDocument:            "importSupport:patchDocument",
};

type LogEntry = { externalId: string; convexId: string };

interface StorageEntry {
  _id: string;
  _creationTime: number;
  internalId: string;
  contentType: string;
  size: number;
  sha256: string;
}

interface ImageReport {
  generatedAt: string;
  summary: { total: number; uploaded: number; skipped: number; missing: number; error: number };
  images: Array<{ storageId: string; internalId: string; status: "ok"|"skipped"|"missing"|"error"; newStorageId?: string; contentType?: string; size?: number; sha256?: string; error?: string; }>;
}

async function uploadToConvex(uploadUrl: string, data: Buffer, contentType: string): Promise<string> {
  const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": contentType }, body: data });
  if (!res.ok) throw new Error(`Upload HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json() as { storageId: string };
  return json.storageId;
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const { input, dryRun } = parseArgs();
  const client = getClient();
  const secret = getSecret();
  const idMap = loadIdMap(input);

  log.section(`🖼  Piccolo QR — import-images.ts${dryRun ? " (DRY RUN)" : ""}`);
  log.info(`Input: ${input}`);

  // ── Load storage metadata ──────────────────────────────────────────────────
  const storageMetaPath = path.join(input, "_storage", "documents.jsonl");
  const storageMetaFlat = path.join(input, "_storage.jsonl");
  const metaPath = fs.existsSync(storageMetaPath) ? storageMetaPath
                 : fs.existsSync(storageMetaFlat) ? storageMetaFlat
                 : null;
  if (!metaPath) { log.error("_storage/documents.jsonl not found — cannot map images"); process.exit(1); }

  const storageEntries = await readJsonl<StorageEntry>(metaPath);
  log.info(`${storageEntries.length} storage entries in backup`);

  // ── Already uploaded ───────────────────────────────────────────────────────
  const storageLog: LogEntry[] = await client.query(fn.getImportLog, { table: "_storage", secret });
  const uploadedIds = new Set(storageLog.map((e) => e.externalId));
  storageLog.forEach((e) => { idMap.storage[e.externalId] = e.convexId; });
  log.info(`${uploadedIds.size} already uploaded, ${storageEntries.length - uploadedIds.size} to go`);

  // ── Open ZIPs (optional) — also support loose files in _storage/ ──────────
  const mediaDir = path.join(input, "media");
  const storageDir = path.join(input, "_storage");
  const zipPaths = fs.existsSync(mediaDir)
    ? fs.readdirSync(mediaDir).filter((f) => f.endsWith(".zip")).sort()
        .map((f) => path.join(mediaDir, f))
    : [];
  const hasLooseFiles = fs.existsSync(storageDir);

  if (zipPaths.length === 0 && !hasLooseFiles) {
    log.error(`No ZIPs found in ${mediaDir} and no _storage/ directory found.`);
    log.info("Copy the piccolo_qr_media_XX.zip files to media/ or place loose files in _storage/.");
    process.exit(1);
  }

  if (zipPaths.length > 0) log.info(`Opening ${zipPaths.length} ZIP archive(s)…`);
  if (hasLooseFiles) log.info(`Also scanning loose files in ${storageDir}`);
  const zips = zipPaths.map((p) => new AdmZip(p));

  // Extension map derived from contentType
  function extFor(contentType: string): string {
    const map: Record<string, string> = {
      "image/jpeg": ".jpeg", "image/jpg": ".jpg", "image/png": ".png",
      "image/webp": ".webp", "image/gif": ".gif", "video/mp4": ".mp4",
    };
    return map[contentType] ?? "";
  }

  function findFile(storageId: string, internalId: string, contentType: string): Buffer | null {
    // 1. Try loose files named by storageId (Convex backup format)
    if (hasLooseFiles) {
      const ext = extFor(contentType);
      const candidates = ext
        ? [path.join(storageDir, storageId + ext)]
        : fs.readdirSync(storageDir)
            .filter((f) => f.startsWith(storageId) && !f.endsWith(".jsonl"))
            .map((f) => path.join(storageDir, f));
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return fs.readFileSync(candidate);
      }
    }
    // 2. Try ZIPs by internalId
    for (const zip of zips) {
      const entry = zip.getEntry(internalId) ?? zip.getEntry(path.basename(internalId));
      if (entry) return zip.readFile(entry);
    }
    return null;
  }

  // ── Upload ─────────────────────────────────────────────────────────────────
  log.section("① Uploading files…");
  const report: ImageReport = {
    generatedAt: new Date().toISOString(),
    summary: { total: storageEntries.length, uploaded: 0, skipped: 0, missing: 0, error: 0 },
    images: [],
  };

  let counter = 0;
  for (const entry of storageEntries) {
    if (uploadedIds.has(entry._id)) {
      report.summary.skipped++;
      report.images.push({ storageId: entry._id, internalId: entry.internalId, status: "skipped", newStorageId: idMap.storage[entry._id] });
      continue;
    }

    const data = findFile(entry._id, entry.internalId, entry.contentType);
    if (!data) {
      log.error(`  Not found: ${entry._id} / ${entry.internalId}`);
      report.summary.missing++;
      report.images.push({ storageId: entry._id, internalId: entry.internalId, status: "missing" });
      continue;
    }

    // Integrity check — backup sha256 may be base64-encoded; normalise both to hex
    const actualHashHex = sha256(data);
    let expectedHashHex = entry.sha256 ?? "";
    if (expectedHashHex && !expectedHashHex.match(/^[0-9a-f]{64}$/i)) {
      // Looks like base64 — convert to hex
      expectedHashHex = Buffer.from(expectedHashHex, "base64").toString("hex");
    }
    if (expectedHashHex && actualHashHex !== expectedHashHex) {
      log.error(`  Hash mismatch: ${entry._id} (expected ${expectedHashHex}, got ${actualHashHex})`);
      report.summary.error++;
      report.images.push({ storageId: entry._id, internalId: entry.internalId, status: "error", error: "sha256 mismatch" });
      continue;
    }

    if (dryRun) {
      log.ok(`  [DRY] Would upload ${entry.internalId} (${entry.contentType}, ${data.length} bytes)`);
      report.summary.uploaded++;
      report.images.push({ storageId: entry._id, internalId: entry.internalId, status: "ok", contentType: entry.contentType, size: data.length });
      continue;
    }

    try {
      const uploadUrl: string = await client.mutation(fn.generateImportUploadUrl, { secret });
      const newId = await uploadToConvex(uploadUrl, data, entry.contentType);
      idMap.storage[entry._id] = newId;
      await client.mutation(fn.markImported, { table: "_storage", externalId: entry._id, convexId: newId, status: "ok", secret });
      report.summary.uploaded++;
      report.images.push({ storageId: entry._id, internalId: entry.internalId, status: "ok", newStorageId: newId, contentType: entry.contentType, size: data.length, sha256: actualHashHex });
      counter++;
      if (counter % 25 === 0) { log.ok(`  ${counter + report.summary.skipped}/${storageEntries.length}`); saveIdMap(input, idMap); }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`  Failed ${entry.internalId}: ${msg}`);
      report.summary.error++;
      report.images.push({ storageId: entry._id, internalId: entry.internalId, status: "error", error: msg });
    }
  }
  saveIdMap(input, idMap);
  log.ok(`Uploads: ${report.summary.uploaded} new, ${report.summary.skipped} skipped, ${report.summary.missing} missing, ${report.summary.error} errors`);

  // ── Patch menuItems storage refs ───────────────────────────────────────────
  if (!dryRun) {
    log.section("② Patching menu item storage refs…");
    const itemFile = [path.join(input, "menuItems", "documents.jsonl"), path.join(input, "menuItems.jsonl")].find((p) => fs.existsSync(p));
    if (itemFile) {
      interface RawItem { _id: string; imageStorageId?: string; videoStorageId?: string; }
      const rawItems = await readJsonl<RawItem>(itemFile);
      let patched = 0;
      for (const item of rawItems) {
        const newItemId = idMap.menuItems[item._id];
        if (!newItemId) continue;
        const fields: Record<string,string> = {};
        if (item.imageStorageId && idMap.storage[item.imageStorageId]) fields.imageStorageId = idMap.storage[item.imageStorageId];
        if (item.videoStorageId && idMap.storage[item.videoStorageId])  fields.videoStorageId  = idMap.storage[item.videoStorageId];
        if (!Object.keys(fields).length) continue;
        await client.mutation(fn.patchDocument, { table: "menuItems", convexId: newItemId, fields, secret });
        patched++;
      }
      log.ok(`Patched ${patched} menu item storage refs`);
    }

    log.section("③ Patching branding storage refs…");
    const brandFile = [path.join(input, "branding", "documents.jsonl"), path.join(input, "branding.jsonl")].find((p) => fs.existsSync(p));
    if (brandFile) {
      interface RawBrand { _id: string; heroImageStorageId?: string; heroVideoStorageId?: string; }
      const rawBranding = await readJsonl<RawBrand>(brandFile);
      for (const brand of rawBranding) {
        const newBrandId = idMap.branding[brand._id];
        if (!newBrandId) continue;
        const fields: Record<string,string> = {};
        if (brand.heroImageStorageId && idMap.storage[brand.heroImageStorageId]) fields.heroImageStorageId = idMap.storage[brand.heroImageStorageId];
        if (brand.heroVideoStorageId && idMap.storage[brand.heroVideoStorageId])  fields.heroVideoStorageId = idMap.storage[brand.heroVideoStorageId];
        if (!Object.keys(fields).length) continue;
        await client.mutation(fn.patchDocument, { table: "branding", convexId: newBrandId, fields, secret });
        log.ok("  Branding hero image patched");
      }
    }
  }

  // ── Save report ────────────────────────────────────────────────────────────
  const reportPath = path.join(input, "images-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log.section("✅ import-images complete");
  log.ok(`Report: ${reportPath}`);
  log.info("Next: npx tsx scripts/verify-import.ts --input " + input);
}

main().catch((err) => { console.error(err); process.exit(1); });
