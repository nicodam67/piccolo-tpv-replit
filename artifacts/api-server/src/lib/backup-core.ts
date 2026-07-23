import crypto from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";

export const BACKUP_FORMAT_VERSION = "2.0.0";
export const BACKUP_EXCLUDED_TABLES = [
  "backup_records",
  "backup_audit_log",
  "idempotency_keys",
  "revoked_tokens",
  "_piccolo_migrations",
  "schema_migrations",
] as const;

export interface BackupPayload {
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  appVersion: string;
  createdAt: string;
  manifest: string[];
  tables: Record<string, unknown[]>;
  sequences: Record<string, { lastValue: string; isCalled: boolean }>;
}

function deriveKey(): Buffer {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET no está configurado");
  return crypto.scryptSync(secret, "piccolo-backup-salt-v2", 32);
}

function deriveLegacyKey(): Buffer {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET no está configurado");
  return crypto.scryptSync(secret, "piccolo-backup-salt-v1", 32);
}

export function encryptBackup(plaintext: string): { iv: string; ciphertext: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const payload = Buffer.concat([encrypted, cipher.getAuthTag()]);
  return { iv: iv.toString("hex"), ciphertext: payload.toString("base64") };
}

export function decryptBackup(iv: string, ciphertext: string): string {
  if (detectBackupFormat(iv) === "legacy-1.0.0") {
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      deriveLegacyKey(),
      Buffer.from(iv, "hex"),
    );
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
  const payload = Buffer.from(ciphertext, "base64");
  if (payload.length < 17) throw new Error("Payload cifrado inválido");
  const encrypted = payload.subarray(0, -16);
  const authTag = payload.subarray(-16);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveKey(),
    Buffer.from(iv, "hex"),
  );
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function backupChecksum(ciphertext: string): string {
  return crypto.createHash("sha256").update(ciphertext).digest("hex");
}

export function detectBackupFormat(iv: string): "2.0.0" | "legacy-1.0.0" {
  if (/^[0-9a-f]{24}$/i.test(iv)) return BACKUP_FORMAT_VERSION;
  if (/^[0-9a-f]{32}$/i.test(iv)) return "legacy-1.0.0";
  throw new Error("IV de backup inválido");
}

export function backupArtifactChecksum(input: {
  formatVersion: string;
  appVersion: string;
  iv: string;
  ciphertext: string;
}): string {
  return crypto.createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

function assertSafeCatalogIdentifier(name: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`Identificador de catálogo no válido: ${name}`);
  }
}

function quoteCatalogIdentifier(name: string): string {
  assertSafeCatalogIdentifier(name);
  return `"${name}"`;
}

export async function discoverBackupTables(client: Pick<PoolClient, "query">): Promise<string[]> {
  const result = await client.query<{ tablename: string }>(
    `SELECT tablename
       FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
        AND tablename <> ALL($1::text[])
      ORDER BY tablename`,
    [BACKUP_EXCLUDED_TABLES],
  );
  const names = result.rows.map((row) => row.tablename);
  names.forEach(assertSafeCatalogIdentifier);
  if (names.length === 0) throw new Error("No se encontraron tablas para la copia");
  return names;
}

export async function discoverBackupSequences(
  client: Pick<PoolClient, "query">,
): Promise<string[]> {
  const result = await client.query<{ sequencename: string }>(
    `SELECT sequencename
       FROM pg_catalog.pg_sequences
      WHERE schemaname = 'public'
      ORDER BY sequencename`,
  );
  const names = result.rows.map((row) => row.sequencename);
  names.forEach(assertSafeCatalogIdentifier);
  return names;
}

export function validateBackupPayload(
  value: unknown,
  expectedTables?: readonly string[],
  expectedSequences?: readonly string[],
): BackupPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Formato de backup inválido");
  }
  const payload = value as Partial<BackupPayload>;
  if (payload.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Versión de backup no soportada: ${String(payload.formatVersion)}`);
  }
  if (!payload.appVersion || !payload.createdAt || !Array.isArray(payload.manifest)) {
    throw new Error("Metadatos obligatorios incompletos");
  }
  if (!payload.tables || typeof payload.tables !== "object" || Array.isArray(payload.tables)) {
    throw new Error("Manifest de tablas inválido");
  }
  if (!payload.sequences || typeof payload.sequences !== "object" || Array.isArray(payload.sequences)) {
    throw new Error("Manifest de secuencias inválido");
  }
  const manifest = [...payload.manifest].sort();
  const payloadNames = Object.keys(payload.tables).sort();
  if (new Set(manifest).size !== manifest.length || manifest.join("\0") !== payloadNames.join("\0")) {
    throw new Error("Backup incompleto: manifest y tablas no coinciden");
  }
  for (const name of manifest) {
    assertSafeCatalogIdentifier(name);
    if (!Array.isArray(payload.tables[name])) {
      throw new Error(`Filas inválidas para ${name}`);
    }
  }
  for (const [name, state] of Object.entries(payload.sequences)) {
    assertSafeCatalogIdentifier(name);
    if (
      !state
      || typeof state !== "object"
      || typeof state.lastValue !== "string"
      || !/^-?\d+$/.test(state.lastValue)
      || typeof state.isCalled !== "boolean"
    ) {
      throw new Error(`Estado de secuencia inválido: ${name}`);
    }
  }
  if (expectedTables) {
    const expected = [...expectedTables].sort();
    if (expected.join("\0") !== manifest.join("\0")) {
      throw new Error("Backup incompleto o incompatible con el esquema actual");
    }
  }
  if (expectedSequences) {
    const expected = [...expectedSequences].sort();
    const actual = Object.keys(payload.sequences).sort();
    if (expected.join("\0") !== actual.join("\0")) {
      throw new Error("Backup incompleto o incompatible con las secuencias actuales");
    }
  }
  return payload as BackupPayload;
}

export async function createDatabaseSnapshot(appVersion: string): Promise<{
  payload: BackupPayload;
  rowCounts: Record<string, number>;
}> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const manifest = await discoverBackupTables(client);
    const sequenceNames = await discoverBackupSequences(client);
    const tables: Record<string, unknown[]> = {};
    const rowCounts: Record<string, number> = {};
    for (const name of manifest) {
      const result = await client.query(`SELECT * FROM ${quoteCatalogIdentifier(name)}`);
      tables[name] = result.rows;
      rowCounts[name] = result.rows.length;
    }
    const sequences: BackupPayload["sequences"] = {};
    for (const name of sequenceNames) {
      const [state] = (await client.query<{ last_value: string; is_called: boolean }>(
        `SELECT last_value::text, is_called FROM ${quoteCatalogIdentifier(name)}`,
      )).rows;
      sequences[name] = {
        lastValue: state?.last_value ?? "1",
        isCalled: state?.is_called ?? false,
      };
    }
    const payload: BackupPayload = {
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion,
      createdAt: new Date().toISOString(),
      manifest,
      tables,
      sequences,
    };
    await client.query("COMMIT");
    return { payload, rowCounts };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function validateBackupForCurrentDatabase(payloadInput: unknown): Promise<BackupPayload> {
  const client = await pool.connect();
  try {
    const currentTables = await discoverBackupTables(client);
    const currentSequences = await discoverBackupSequences(client);
    return validateBackupPayload(payloadInput, currentTables, currentSequences);
  } finally {
    client.release();
  }
}

export async function restoreDatabaseSnapshot(payloadInput: unknown): Promise<Record<string, number>> {
  const client = await pool.connect();
  let originalReplicationRole = "origin";
  let releaseError: Error | undefined;
  try {
    await client.query("BEGIN");
    const currentTables = await discoverBackupTables(client);
    const currentSequences = await discoverBackupSequences(client);
    const payload = validateBackupPayload(payloadInput, currentTables, currentSequences);
    const roleResult = await client.query<{ session_replication_role: string }>(
      "SHOW session_replication_role",
    );
    originalReplicationRole = roleResult.rows[0]?.session_replication_role ?? "origin";
    if (!["origin", "replica", "local"].includes(originalReplicationRole)) {
      throw new Error("Estado session_replication_role no reconocido");
    }
    await client.query("SET LOCAL session_replication_role = 'replica'");

    const restored: Record<string, number> = {};
    for (const name of payload.manifest) {
      const identifier = quoteCatalogIdentifier(name);
      await client.query(`DELETE FROM ${identifier}`);
    }
    for (const name of payload.manifest) {
      const identifier = quoteCatalogIdentifier(name);
      const rows = payload.tables[name];
      if (rows.length > 0) {
        await client.query(
          `INSERT INTO ${identifier}
             SELECT * FROM json_populate_recordset(NULL::${identifier}, $1::json)`,
          [JSON.stringify(rows)],
        );
      }
      restored[name] = rows.length;
    }
    for (const [name, state] of Object.entries(payload.sequences)) {
      assertSafeCatalogIdentifier(name);
      await client.query("SELECT setval($1::regclass, $2::bigint, $3::boolean)", [
        `public.${name}`,
        state.lastValue,
        state.isCalled,
      ]);
    }
    await client.query("COMMIT");
    return restored;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    try {
      const roleResult = await client.query<{ session_replication_role: string }>(
        "SHOW session_replication_role",
      );
      if ((roleResult.rows[0]?.session_replication_role ?? "origin") !== originalReplicationRole) {
        await client.query(`SET session_replication_role = '${originalReplicationRole}'`);
      }
    } catch (error) {
      releaseError = error instanceof Error ? error : new Error(String(error));
    }
    client.release(releaseError);
  }
}
