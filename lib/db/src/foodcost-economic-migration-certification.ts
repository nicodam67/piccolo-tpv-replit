import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = await fs.readFile(
  path.join(packageRoot, "migrations", "0031_foodcost_economic_idempotency.sql"),
  "utf8",
);
const rollback = await fs.readFile(
  path.join(packageRoot, "migrations", "0031_foodcost_economic_idempotency.down.sql"),
  "utf8",
);

async function createBase(db: PGlite): Promise<void> {
  await db.exec(`
    CREATE TABLE payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE payment_voids (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      original_payment_id uuid NOT NULL REFERENCES payments(id),
      reason text NOT NULL
    );
    INSERT INTO payments (id)
      VALUES ('00000000-0000-0000-0000-000000000001');
  `);
}

const db = new PGlite();
await createBase(db);
await db.exec(`
  INSERT INTO payment_voids (original_payment_id, reason)
  VALUES ('00000000-0000-0000-0000-000000000001', 'Registro existente');
`);
await db.exec(migration);

const index = await db.query<{ indexname: string }>(`
  SELECT indexname FROM pg_indexes
  WHERE indexname = 'payment_voids_original_payment_unique'
`);
assert.equal(index.rows[0]?.indexname, "payment_voids_original_payment_unique");
await assert.rejects(() => db.exec(`
  INSERT INTO payment_voids (original_payment_id, reason)
  VALUES ('00000000-0000-0000-0000-000000000001', 'Reintento');
`));
const retained = await db.query<{ count: string }>(
  "SELECT count(*)::text AS count FROM payment_voids",
);
assert.equal(retained.rows[0]?.count, "1");

await db.exec(rollback);
await db.exec(`
  INSERT INTO payment_voids (original_payment_id, reason)
  VALUES ('00000000-0000-0000-0000-000000000001', 'Permitido tras rollback');
`);
await db.close();

const duplicateDb = new PGlite();
await createBase(duplicateDb);
await duplicateDb.exec(`
  INSERT INTO payment_voids (original_payment_id, reason) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Primero'),
    ('00000000-0000-0000-0000-000000000001', 'Segundo');
`);
await assert.rejects(() => duplicateDb.exec(migration), /duplicate original_payment_id/);
const duplicatesPreserved = await duplicateDb.query<{ count: string }>(
  "SELECT count(*)::text AS count FROM payment_voids",
);
assert.equal(duplicatesPreserved.rows[0]?.count, "2");
await duplicateDb.close();

process.stdout.write("FoodCost migration 0031 certification passed\n");
