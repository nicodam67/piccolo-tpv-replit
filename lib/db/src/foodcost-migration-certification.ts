import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = await fs.readFile(
  path.join(packageRoot, "migrations", "0030_foodcost_profitability.sql"),
  "utf8",
);
const rollback = await fs.readFile(
  path.join(packageRoot, "migrations", "0030_foodcost_profitability.down.sql"),
  "utf8",
);

const db = new PGlite();
await db.exec(`
  CREATE TABLE employees (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
  CREATE TABLE suppliers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), commercial_name text NOT NULL);
  CREATE TABLE categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
  CREATE TABLE products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id uuid NOT NULL REFERENCES categories(id),
    name text NOT NULL,
    price numeric(10,2) NOT NULL
  );
  CREATE TABLE ingredient_cost_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_id uuid NOT NULL,
    previous_cost numeric(10,4) NOT NULL,
    new_cost numeric(10,4) NOT NULL,
    supplier_name text,
    reason text,
    employee_id uuid REFERENCES employees(id),
    created_at timestamptz NOT NULL DEFAULT now()
  );

  INSERT INTO employees (id, name)
    VALUES ('00000000-0000-0000-0000-000000000001', 'Admin');
  INSERT INTO suppliers (id, commercial_name)
    VALUES ('00000000-0000-0000-0000-000000000002', 'Proveedor');
  INSERT INTO categories (id, name)
    VALUES ('00000000-0000-0000-0000-000000000003', 'Carta');
  INSERT INTO products (id, category_id, name, price)
    VALUES (
      '00000000-0000-0000-0000-000000000004',
      '00000000-0000-0000-0000-000000000003',
      'Producto existente',
      10
    );
  INSERT INTO ingredient_cost_history (
    id, ingredient_id, previous_cost, new_cost, supplier_name, reason, employee_id
  ) VALUES (
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000006',
    1, 2, 'Proveedor', 'Dato previo',
    '00000000-0000-0000-0000-000000000001'
  );
`);

await db.exec(migration);

const existingProduct = await db.query<{ name: string; price: string }>(
  "SELECT name, price::text AS price FROM products WHERE id = '00000000-0000-0000-0000-000000000004'",
);
assert.deepEqual(existingProduct.rows, [{ name: "Producto existente", price: "10.00" }]);

const history = await db.query<{
  reason: string;
  source: string;
  source_reference: string | null;
  supplier_id: string | null;
}>(
  `SELECT reason, source, source_reference, supplier_id
   FROM ingredient_cost_history
   WHERE id = '00000000-0000-0000-0000-000000000005'`,
);
assert.deepEqual(history.rows, [{
  reason: "Dato previo",
  source: "manual",
  source_reference: null,
  supplier_id: null,
}]);

const settings = await db.query<{
  id: string;
  default_target_margin_pct: string;
  warning_gap_pct: string;
  allocation_method: string;
}>(
  `SELECT id, default_target_margin_pct::text, warning_gap_pct::text, allocation_method
   FROM profitability_settings`,
);
assert.deepEqual(settings.rows, [{
  id: "global",
  default_target_margin_pct: "65.00",
  warning_gap_pct: "10.00",
  allocation_method: "none",
}]);

const indexes = await db.query<{ indexname: string }>(
  `SELECT indexname FROM pg_indexes
   WHERE indexname IN (
     'channel_commissions_channel_unique',
     'profitability_targets_unique_scope',
     'price_change_proposals_product_created_idx'
   )
   ORDER BY indexname`,
);
assert.deepEqual(indexes.rows.map((row) => row.indexname), [
  "channel_commissions_channel_unique",
  "price_change_proposals_product_created_idx",
  "profitability_targets_unique_scope",
]);

async function rejects(sql: string): Promise<void> {
  await assert.rejects(() => db.exec(sql));
}

await rejects(`INSERT INTO operating_expenses (name, category, amount) VALUES ('', 'other', 10)`);
await rejects(`INSERT INTO operating_expenses (name, category, amount) VALUES ('Luz', 'invalid', 10)`);
await rejects(`INSERT INTO operating_expenses (name, category, amount) VALUES ('Luz', 'electricity', -1)`);
await rejects(`INSERT INTO channel_commissions (channel, name, percent) VALUES ('tpv', 'TPV', 100)`);
await rejects(`INSERT INTO profitability_targets (scope_type, target_margin_pct) VALUES ('product', 50)`);
await rejects(`INSERT INTO profitability_targets (scope_type, target_margin_pct) VALUES ('global', 100)`);
await rejects(`
  INSERT INTO price_change_proposals (product_id, old_price, proposed_price, reason)
  VALUES ('00000000-0000-0000-0000-000000000004', 10, 11, '')
`);
await rejects(`
  INSERT INTO price_change_proposals (product_id, old_price, proposed_price, reason)
  VALUES ('00000000-0000-0000-0000-000000000099', 10, 11, 'FK inválida')
`);

await db.exec(`
  INSERT INTO channel_commissions (channel, name) VALUES ('tpv', 'TPV');
  INSERT INTO profitability_targets (scope_type, target_margin_pct) VALUES ('global', 60);
  INSERT INTO price_change_proposals (product_id, old_price, proposed_price, reason)
  VALUES ('00000000-0000-0000-0000-000000000004', 10, 11, 'Certificación');
`);
await rejects(`INSERT INTO channel_commissions (channel, name) VALUES ('tpv', 'Duplicada')`);
await rejects(`INSERT INTO profitability_targets (scope_type, target_margin_pct) VALUES ('global', 55)`);
await rejects(`DELETE FROM products WHERE id = '00000000-0000-0000-0000-000000000004'`);

await db.exec(`
  UPDATE ingredient_cost_history
  SET supplier_id = '00000000-0000-0000-0000-000000000002'
  WHERE id = '00000000-0000-0000-0000-000000000005';
  DELETE FROM suppliers WHERE id = '00000000-0000-0000-0000-000000000002';
`);
const supplierAfterDelete = await db.query<{ supplier_id: string | null }>(
  `SELECT supplier_id FROM ingredient_cost_history
   WHERE id = '00000000-0000-0000-0000-000000000005'`,
);
assert.equal(supplierAfterDelete.rows[0]?.supplier_id, null);

await db.exec(rollback);

const retainedRows = await db.query<{ count: string }>(
  "SELECT count(*)::text AS count FROM ingredient_cost_history",
);
assert.equal(retainedRows.rows[0]?.count, "1");
const removedTables = await db.query<{ name: string | null }>(
  `SELECT to_regclass('profitability_settings')::text AS name`,
);
assert.equal(removedTables.rows[0]?.name, null);
const removedColumns = await db.query<{ count: string }>(
  `SELECT count(*)::text AS count
   FROM information_schema.columns
   WHERE table_name = 'ingredient_cost_history'
     AND column_name IN ('supplier_id', 'source', 'source_reference')`,
);
assert.equal(removedColumns.rows[0]?.count, "0");

await db.close();
process.stdout.write("FoodCost migration 0030 certification passed\n");
