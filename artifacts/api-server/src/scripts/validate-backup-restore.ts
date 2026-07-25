import { pool } from "@workspace/db";
import {
  backupArtifactChecksum,
  createDatabaseSnapshot,
  decryptBackup,
  encryptBackup,
  restoreDatabaseSnapshot,
  validateBackupForCurrentDatabase,
} from "../lib/backup-core";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria");
const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
if (!/(staging|test|ci)/i.test(databaseName)) {
  throw new Error(`Base rechazada por seguridad: ${databaseName}`);
}
if (process.env.ALLOW_DESTRUCTIVE_RESTORE_TEST !== "YES_I_UNDERSTAND") {
  throw new Error("Define ALLOW_DESTRUCTIVE_RESTORE_TEST=YES_I_UNDERSTAND");
}
if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET es obligatoria");

const marker = `restore-validation-${crypto.randomUUID()}`;
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const [employee] = (await client.query<{ id: string }>(
    "INSERT INTO employees (name, role, active) VALUES ($1, 'admin', true) RETURNING id",
    [marker],
  )).rows;
  const [zone] = (await client.query<{ id: string }>(
    "INSERT INTO room_zones (name, active) VALUES ($1, true) RETURNING id",
    [marker],
  )).rows;
  await client.query(
    "INSERT INTO restaurant_tables (zone_id, name, active) VALUES ($1, $2, true)",
    [zone.id, marker],
  );
  await client.query("COMMIT");

  const snapshot = await createDatabaseSnapshot("validation");
  const encrypted = encryptBackup(JSON.stringify(snapshot.payload));
  const checksum = backupArtifactChecksum({
    formatVersion: snapshot.payload.formatVersion,
    appVersion: snapshot.payload.appVersion,
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
  });
  const decrypted = JSON.parse(decryptBackup(encrypted.iv, encrypted.ciphertext));
  await validateBackupForCurrentDatabase(decrypted);

  await client.query("DELETE FROM restaurant_tables WHERE name = $1", [marker]);
  await client.query("DELETE FROM room_zones WHERE name = $1", [marker]);
  await client.query("DELETE FROM employees WHERE id = $1", [employee.id]);

  await restoreDatabaseSnapshot(snapshot.payload);
  await restoreDatabaseSnapshot(snapshot.payload);
  const restored = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM restaurant_tables t
       JOIN room_zones z ON z.id = t.zone_id
      WHERE t.name = $1 AND z.name = $1`,
    [marker],
  );
  if (restored.rows[0]?.count !== "1") throw new Error("Relaciones no restauradas");

  const afterRestore = await createDatabaseSnapshot("validation");
  if (JSON.stringify(afterRestore.payload.sequences) !== JSON.stringify(snapshot.payload.sequences)) {
    throw new Error("Secuencias no restauradas");
  }

  const corrupted = structuredClone(snapshot.payload);
  const employees = corrupted.tables.employees as Array<Record<string, unknown>>;
  const target = employees.find((row) => row.id === employee.id);
  if (!target) throw new Error("Empleado marcador ausente del snapshot");
  target.id = "uuid-invalido";
  let rollbackObserved = false;
  try {
    await restoreDatabaseSnapshot(corrupted);
  } catch {
    rollbackObserved = true;
  }
  if (!rollbackObserved) throw new Error("El fallo intermedio no provocó error");
  const afterFailure = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM employees WHERE id = $1",
    [employee.id],
  );
  if (afterFailure.rows[0]?.count !== "1") throw new Error("Rollback parcial detectado");

  const role = await client.query<{ session_replication_role: string }>(
    "SHOW session_replication_role",
  );
  if (role.rows[0]?.session_replication_role !== "origin") {
    throw new Error("session_replication_role contaminado");
  }
  console.log(JSON.stringify({
    ok: true,
    checksum,
    tables: snapshot.payload.manifest.length,
    sequences: Object.keys(snapshot.payload.sequences).length,
    repeatedRestore: true,
    rollback: true,
    sessionReplicationRole: "origin",
  }, null, 2));
} finally {
  await client.query("DELETE FROM restaurant_tables WHERE name = $1", [marker]).catch(() => {});
  await client.query("DELETE FROM room_zones WHERE name = $1", [marker]).catch(() => {});
  await client.query("DELETE FROM employees WHERE name = $1", [marker]).catch(() => {});
  client.release();
  await pool.end();
}
