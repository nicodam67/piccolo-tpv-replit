import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import app from "../app";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const secret = process.env.SESSION_SECRET ?? "test-secret";
const categoryId = "69000000-0000-4000-8000-000000000010";
const existingProductId = "69000000-0000-4000-8000-000000000011";
const users = {
  admin: { id: "69000000-0000-4000-8000-000000000001", name: "E69 Import Admin", role: "admin" },
  manager: { id: "69000000-0000-4000-8000-000000000002", name: "E69 Import Manager", role: "manager" },
  waiter: { id: "69000000-0000-4000-8000-000000000003", name: "E69 Import Waiter", role: "waiter" },
};
const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-import-integration-"));

function auth(user: typeof users.admin) {
  return `Bearer ${jwt.sign({ ...user, jti: `catalog-${user.role}` }, secret)}`;
}

async function cleanup() {
  await pool.query("DELETE FROM idempotency_keys WHERE cache_key LIKE '%catalog-import-e69%'");
  await pool.query("DELETE FROM document_audit_log WHERE document_type = 'catalog_import' AND employee_name LIKE 'E69 Import %'");
  await pool.query("DELETE FROM tech_events WHERE code = 'CATALOG_IMPORT_CONFIRMED'");
  await pool.query("DELETE FROM products WHERE internal_code IN ('E69-NEW', 'E69-EXIST')");
  await pool.query("DELETE FROM categories WHERE id = $1 OR name = 'Importadas E69'", [categoryId]);
  await pool.query("DELETE FROM employees WHERE id = ANY($1::uuid[])", [Object.values(users).map((user) => user.id)]);
}

describeWithDatabase("guided initial catalog import", () => {
  beforeAll(async () => {
    process.env.PICCOLO_UPLOAD_ROOT = uploadRoot;
    await cleanup();
    for (const user of Object.values(users)) {
      await pool.query(
        "INSERT INTO employees (id, name, role, active) VALUES ($1, $2, $3, false)",
        [user.id, user.name, user.role],
      );
    }
    await pool.query("INSERT INTO categories (id, name, active) VALUES ($1, 'Existente E69', true)", [categoryId]);
    await pool.query(
      `INSERT INTO products
        (id, category_id, name, internal_code, price, prep_zone, active, qr_visible)
       VALUES ($1, $2, 'Existente E69', 'E69-EXIST', '5.00', 'cocina', true, true)`,
      [existingProductId, categoryId],
    );
  });

  afterAll(async () => {
    await cleanup();
    delete process.env.PICCOLO_UPLOAD_ROOT;
    fs.rmSync(uploadRoot, { recursive: true, force: true });
  });

  it("denies waiter upload and previews manager CSV without writes", async () => {
    const csv = "nombre;codigo;categoria;precio;iva;zona_prep;alergenos\nNuevo;E69-NEW;Importadas E69;12,50;10;cocina;gluten\nExistente;E69-EXIST;Existente E69;6;10;cocina;\n";
    const denied = await request(app)
      .post("/api/admin/catalog-import/sessions")
      .set("Authorization", auth(users.waiter))
      .attach("file", Buffer.from(csv), "carta.csv");
    expect(denied.status).toBe(403);

    const preview = await request(app)
      .post("/api/admin/catalog-import/sessions")
      .set("Authorization", auth(users.manager))
      .attach("file", Buffer.from(csv), "carta.csv");
    expect(preview.status).toBe(201);
    expect(preview.body.summary).toMatchObject({ total: 2, creates: 1, skips: 1, errors: 0 });
    const beforeConfirm = await pool.query("SELECT id FROM products WHERE internal_code = 'E69-NEW'");
    expect(beforeConfirm.rowCount).toBe(0);
  });

  it("allows correction before atomic confirm and synchronizes public QR from PostgreSQL", async () => {
    const csv = "nombre;codigo;categoria;precio;iva;zona_prep;alergenos\nNuevo;E69-NEW;Importadas E69;-1;8;incorrecto;inventado\n";
    const preview = await request(app)
      .post("/api/admin/catalog-import/sessions")
      .set("Authorization", auth(users.manager))
      .attach("file", Buffer.from(csv), "errores.csv");
    expect(preview.status).toBe(201);
    expect(preview.body.summary.errors).toBe(1);

    const corrected = await request(app)
      .patch(`/api/admin/catalog-import/sessions/${preview.body.sessionId}/rows`)
      .set("Authorization", auth(users.manager))
      .send({
        corrections: [{
          rowIndex: 2,
          changes: { price: 12.5, taxRate: 10, prepZone: "cocina", allergens: ["gluten"] },
        }],
      });
    expect(corrected.status).toBe(200);
    expect(corrected.body.summary.errors).toBe(0);

    const confirmed = await request(app)
      .post(`/api/admin/catalog-import/sessions/${preview.body.sessionId}/confirm`)
      .set("Authorization", auth(users.manager))
      .set("Idempotency-Key", "catalog-import-e69-confirm")
      .send({ allowOverwrite: false });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body).toMatchObject({
      imported: 1,
      updated: 0,
      failed: 0,
      qrSync: { automatic: true, sourceOfTruth: "postgresql" },
    });
    const product = await pool.query<{ price: string; allergens: string }>(
      "SELECT price, allergens FROM products WHERE internal_code = 'E69-NEW'",
    );
    expect(product.rows[0]).toMatchObject({ price: "12.50", allergens: "gluten" });
    const publicMenu = await request(app).get("/api/public/menu");
    expect(publicMenu.status).toBe(200);
    expect(publicMenu.body.some((category: { products: Array<{ name: string }> }) =>
      category.products.some((entry) => entry.name === "Nuevo"))).toBe(true);

    const report = await request(app)
      .get(`/api/admin/catalog-import/sessions/${preview.body.sessionId}/report`)
      .set("Authorization", auth(users.manager));
    expect(report.status).toBe(200);
    expect(report.body.catalogAuthority).toBe("TPV PostgreSQL");
    expect(report.body.report).toMatchObject({ imported: 1, failed: 0 });
  });

  it("requires administrator authorization before overwriting a duplicate", async () => {
    const csv = "nombre;codigo;categoria;precio;iva;zona_prep\nExistente actualizado;E69-EXIST;Existente E69;8;10;cocina\n";
    const managerPreview = await request(app)
      .post("/api/admin/catalog-import/sessions")
      .set("Authorization", auth(users.manager))
      .attach("file", Buffer.from(csv), "duplicado.csv");
    const managerOverwrite = await request(app)
      .post(`/api/admin/catalog-import/sessions/${managerPreview.body.sessionId}/validate`)
      .set("Authorization", auth(users.manager))
      .send({ allowOverwrite: true });
    expect(managerOverwrite.status).toBe(403);

    const adminPreview = await request(app)
      .post("/api/admin/catalog-import/sessions")
      .set("Authorization", auth(users.admin))
      .attach("file", Buffer.from(csv), "duplicado-admin.csv");
    const validated = await request(app)
      .post(`/api/admin/catalog-import/sessions/${adminPreview.body.sessionId}/validate`)
      .set("Authorization", auth(users.admin))
      .send({ allowOverwrite: true });
    expect(validated.status).toBe(200);
    expect(validated.body.rows[0].action).toBe("update");
  });
});
