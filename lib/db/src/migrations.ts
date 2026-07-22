import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "./pool.ts";

const MIGRATION_LOCK_ID = 26002;
const here = path.dirname(fileURLToPath(import.meta.url));

async function resolvePackageRoot(): Promise<string> {
  const candidates = [
    process.env["DB_MIGRATIONS_ROOT"],
    path.resolve(process.cwd(), "lib", "db"),
    process.cwd(),
    path.resolve(process.cwd(), "..", "..", "lib", "db"),
    path.resolve(here, ".."),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      await fs.access(path.join(candidate, "migrations"));
      await fs.access(path.join(candidate, "drizzle", "0000_mysterious_hitman.sql"));
      return candidate;
    } catch {
      // Try the next supported execution context.
    }
  }
  throw new Error("Unable to locate lib/db migration assets");
}

interface MigrationFile {
  version: string;
  path: string;
  checksum: string;
  sql: string;
  baseline: boolean;
}

async function readMigration(filePath: string, version: string, baseline = false): Promise<MigrationFile> {
  const sql = await fs.readFile(filePath, "utf8");
  return {
    version,
    path: filePath,
    checksum: createHash("sha256").update(sql).digest("hex"),
    sql,
    baseline,
  };
}

export async function discoverMigrations(): Promise<MigrationFile[]> {
  const packageRoot = await resolvePackageRoot();
  const prerequisitesPath = path.join(packageRoot, "drizzle", "0000_prerequisites.sql");
  const baselinePath = path.join(packageRoot, "drizzle", "0000_mysterious_hitman.sql");
  const numberedDirectory = path.join(packageRoot, "migrations");
  const names = (await fs.readdir(numberedDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name) && !name.endsWith(".down.sql"))
    .sort();
  return [
    await readMigration(prerequisitesPath, "0000_prerequisites"),
    await readMigration(baselinePath, "0000_baseline", true),
    ...await Promise.all(names.map((name) =>
      readMigration(path.join(numberedDirectory, name), name.replace(/\.sql$/, "")),
    )),
  ];
}

async function ensureLedger(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     text        PRIMARY KEY,
      checksum    text        NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function withMigrationLock<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    return await callback(client);
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    } finally {
      client.release();
    }
  }
}

export async function applyMigrations(): Promise<string[]> {
  const migrations = await discoverMigrations();
  return withMigrationLock(async (client) => {
    await ensureLedger(client);
    const applied: string[] = [];

    for (const migration of migrations) {
      const existing = await client.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migrations WHERE version = $1",
        [migration.version],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== migration.checksum) {
          throw new Error(`Checksum mismatch for migration ${migration.version}`);
        }
        continue;
      }

      // Adopt an existing pre-ledger installation without replaying the full
      // baseline. Numbered idempotent migrations are still applied normally.
      if (migration.baseline) {
        const coreTable = await client.query<{ table_name: string | null }>(
          "SELECT to_regclass('public.employees')::text AS table_name",
        );
        if (coreTable.rows[0]?.table_name) {
          await client.query(
            "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
            [migration.version, migration.checksum],
          );
          applied.push(migration.version);
          continue;
        }
      }

      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
          [migration.version, migration.checksum],
        );
        await client.query("COMMIT");
        applied.push(migration.version);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    return applied;
  });
}

export async function verifyMigrations(): Promise<void> {
  const migrations = await discoverMigrations();
  await withMigrationLock(async (client) => {
    const ledgerExists = await client.query<{ table_name: string | null }>(
      "SELECT to_regclass('public.schema_migrations')::text AS table_name",
    );
    if (!ledgerExists.rows[0]?.table_name) {
      throw new Error("Migration ledger missing; run pnpm --filter @workspace/db migrate");
    }

    const applied = await client.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM schema_migrations",
    );
    const byVersion = new Map(applied.rows.map((row) => [row.version, row.checksum]));
    const pending: string[] = [];
    for (const migration of migrations) {
      const checksum = byVersion.get(migration.version);
      if (!checksum) pending.push(migration.version);
      else if (checksum !== migration.checksum) {
        throw new Error(`Checksum mismatch for migration ${migration.version}`);
      }
    }
    if (pending.length > 0) {
      throw new Error(`Pending migrations: ${pending.join(", ")}`);
    }
  });
}

if (
  process.argv[1] &&
  path.basename(process.argv[1]) === "migrations.ts" &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const mode = process.argv[2] ?? "check";
  const operation = mode === "apply" ? applyMigrations() : verifyMigrations();
  operation
    .then((result) => {
      if (Array.isArray(result)) {
        process.stdout.write(`Applied ${result.length} migration(s): ${result.join(", ") || "none"}\n`);
      } else {
        process.stdout.write("Migration verification passed\n");
      }
      return pool.end();
    })
    .catch(async (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      await pool.end();
      process.exitCode = 1;
    });
}
