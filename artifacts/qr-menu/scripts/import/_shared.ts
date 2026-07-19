/**
 * Shared utilities for all import scripts.
 *
 * Set these env vars before running any import script:
 *   CONVEX_URL=https://xxx.convex.cloud
 *   CONVEX_IMPORT_SECRET=your-import-secret
 */

import { createReadStream } from "fs";
import { createInterface } from "readline";
import { ConvexHttpClient } from "convex/browser";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = path.resolve(__dirname, "../../import_piccolo_qr");
export const ID_MAP_PATH = path.resolve(__dirname, "../../import_piccolo_qr/.id-map.json");

// ── Convex client ─────────────────────────────────────────────────────────────
export function getClient(): ConvexHttpClient {
  const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
  if (!url) throw new Error("CONVEX_URL or VITE_CONVEX_URL must be set");
  return new ConvexHttpClient(url);
}

export function getSecret(): string {
  const secret = process.env.CONVEX_IMPORT_SECRET;
  if (!secret) throw new Error("CONVEX_IMPORT_SECRET must be set");
  return secret;
}

// ── String-based function references (no dependency on generated _api types) ──
// These must match the function names in convex/importSupport.ts.
// When using ConvexHttpClient, string references work as-is.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fn: Record<string, any> = {
  checkImported: "importSupport:checkImported",
  markImported: "importSupport:markImported",
  importBatch: "importSupport:importBatch",
  patchDocument: "importSupport:patchDocument",
  generateImportUploadUrl: "importSupport:generateImportUploadUrl",
  getImportLog: "importSupport:getImportLog",
  getImportSummary: "importSupport:getImportSummary",
  clearImportLog: "importSupport:clearImportLog",
  countTable: "importSupport:countTable",
};

// ── JSONL reader ──────────────────────────────────────────────────────────────
export async function readJsonl<T>(filePath: string): Promise<T[]> {
  const results: T[] = [];
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) results.push(JSON.parse(trimmed) as T);
  }
  return results;
}

// ── ID map persistence ────────────────────────────────────────────────────────
export interface IdMap {
  categories: Record<string, string>; // old → new
  menuItems: Record<string, string>;
  branding: Record<string, string>;
  storage: Record<string, string>; // old storageId → new storageId
}

export function loadIdMap(): IdMap {
  if (fs.existsSync(ID_MAP_PATH)) {
    return JSON.parse(fs.readFileSync(ID_MAP_PATH, "utf-8")) as IdMap;
  }
  return { categories: {}, menuItems: {}, branding: {}, storage: {} };
}

export function saveIdMap(map: IdMap): void {
  fs.mkdirSync(path.dirname(ID_MAP_PATH), { recursive: true });
  fs.writeFileSync(ID_MAP_PATH, JSON.stringify(map, null, 2));
}

// ── Logging ───────────────────────────────────────────────────────────────────
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";

export const log = {
  info: (msg: string) => console.log(`${CYAN}ℹ${RESET} ${msg}`),
  ok: (msg: string) => console.log(`${GREEN}✓${RESET} ${msg}`),
  skip: (msg: string) => console.log(`${YELLOW}↷${RESET} ${msg}`),
  error: (msg: string) => console.error(`${RED}✗${RESET} ${msg}`),
  section: (msg: string) => console.log(`\n${BOLD}${msg}${RESET}`),
};
