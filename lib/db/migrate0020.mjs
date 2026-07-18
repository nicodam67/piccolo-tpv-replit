/**
 * migrate0020.mjs — applies 0020_qr_menu_module.sql
 * Usage: node lib/db/migrate0020.mjs
 * Requires DATABASE_URL env var.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const pg = require('pg');
const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(__dirname, 'migrations', '0020_qr_menu_module.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(sql);
console.log('✅ Migration 0020_qr_menu_module applied');
await client.end();
