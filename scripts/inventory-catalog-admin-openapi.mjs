import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(path.resolve(import.meta.dirname, ".."), "artifacts/api-server/package.json"));
const { parse } = require("yaml");

const root = path.resolve(import.meta.dirname, "..");
const spec = parse(fs.readFileSync(path.join(root, "lib/api-spec/openapi.yaml"), "utf8"));

const inventory = [
  { group: "categories", endpoint: "GET /admin/categories", consumer: "categorias.tsx, productos.tsx, qr-menu/lib.ts", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Admin category list" },
  { group: "categories", endpoint: "POST /admin/categories", consumer: "categorias.tsx, qr-menu/lib.ts", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Create category" },
  { group: "categories", endpoint: "PUT /admin/categories/sort", consumer: "categorias.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Reorder categories" },
  { group: "categories", endpoint: "PATCH /admin/categories/{id}", consumer: "categorias.tsx, qr-menu/lib.ts", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Update category" },
  { group: "categories", endpoint: "DELETE /admin/categories/{id}", consumer: "categorias.tsx, qr-menu/lib.ts", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Soft-delete category" },
  { group: "categories", endpoint: "PATCH /admin/categories/{id}/translations", consumer: "categorias.tsx (legacy nameEn)", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Legacy translation patch" },
  { group: "subcategories", endpoint: "POST /admin/subcategories", consumer: "categorias.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Create subcategory" },
  { group: "subcategories", endpoint: "PUT /admin/subcategories/sort", consumer: "categorias.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Reorder subcategories" },
  { group: "subcategories", endpoint: "PATCH /admin/subcategories/{id}", consumer: "categorias.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Update subcategory" },
  { group: "subcategories", endpoint: "DELETE /admin/subcategories/{id}", consumer: "categorias.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Delete subcategory" },
  { group: "products", endpoint: "GET /admin/products", consumer: "productos.tsx, order.tsx, fiscal.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Admin product list" },
  { group: "products", endpoint: "POST /admin/products", consumer: "productos.tsx, qr-menu/lib.ts", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Create product" },
  { group: "products", endpoint: "PUT /admin/products/sort", consumer: "productos.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Reorder products" },
  { group: "products", endpoint: "GET /admin/products/export", consumer: "productos.tsx (direct)", auth: "JWT/cookie", role: "admin", decision: "include", reason: "CSV/XLSX export" },
  { group: "products", endpoint: "POST /admin/products/import", consumer: "productos.tsx (direct)", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Multipart import" },
  { group: "products", endpoint: "PATCH /admin/products/{productId}", consumer: "productos.tsx, qr-menu/lib.ts", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Update product" },
  { group: "products", endpoint: "DELETE /admin/products/{productId}", consumer: "productos.tsx, qr-menu/lib.ts", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Soft-delete product" },
  { group: "products", endpoint: "PUT /admin/products/{productId}/modifier-groups", consumer: "productos.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Assign modifier groups" },
  { group: "products", endpoint: "PATCH /admin/products/{id}/soldout", consumer: "productos.tsx (direct api.patch)", auth: "JWT/cookie", role: "manager,admin", decision: "include", reason: "Sold-out toggle" },
  { group: "products", endpoint: "PATCH /admin/products/{id}/translations", consumer: "productos.tsx (legacy)", auth: "JWT/cookie", role: "manager,admin", decision: "include", reason: "Legacy translation patch" },
  { group: "formats", endpoint: "GET /products/{productId}/formats", consumer: "order.tsx", auth: "JWT/cookie", role: "authenticated", decision: "include", reason: "Staff format list (merged path)" },
  { group: "formats", endpoint: "POST /products/{productId}/formats", consumer: "productos.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Create format" },
  { group: "formats", endpoint: "PATCH /products/formats/{formatId}", consumer: "productos.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Update format" },
  { group: "formats", endpoint: "DELETE /products/formats/{formatId}", consumer: "productos.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Archive format" },
  { group: "availability", endpoint: "GET /admin/product-availability-rules", consumer: "productos.tsx (indirect)", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Availability rules CRUD" },
  { group: "availability", endpoint: "POST /admin/product-availability-rules", consumer: "productos.tsx (indirect)", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Create rule" },
  { group: "availability", endpoint: "PATCH /admin/product-availability-rules/{id}", consumer: "productos.tsx (indirect)", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Update rule" },
  { group: "availability", endpoint: "DELETE /admin/product-availability-rules/{id}", consumer: "productos.tsx (indirect)", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Delete rule" },
  { group: "modifiers", endpoint: "GET /admin/modifier-groups", consumer: "modificadores.tsx, productos.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "List groups" },
  { group: "modifiers", endpoint: "POST /admin/modifier-groups", consumer: "modificadores.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Create group" },
  { group: "modifiers", endpoint: "PATCH /admin/modifier-groups/{id}", consumer: "modificadores.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Update group" },
  { group: "modifiers", endpoint: "DELETE /admin/modifier-groups/{id}", consumer: "modificadores.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Delete group" },
  { group: "modifiers", endpoint: "POST /admin/modifier-groups/{id}/modifiers", consumer: "modificadores.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Create modifier option" },
  { group: "modifiers", endpoint: "PATCH /admin/modifiers/{id}", consumer: "modificadores.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Update modifier" },
  { group: "modifiers", endpoint: "DELETE /admin/modifiers/{id}", consumer: "modificadores.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Delete modifier" },
  { group: "modifiers", endpoint: "GET /products/{productId}/modifiers", consumer: "order.tsx", auth: "JWT/cookie", role: "authenticated", decision: "include", reason: "Staff modifier read (merged path)" },
  { group: "allergens", endpoint: "GET /admin/allergens", consumer: "productos.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "EU allergen catalog" },
  { group: "allergens", endpoint: "GET /admin/allergens/{code}", consumer: "productos.tsx", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Single allergen" },
  { group: "allergens", endpoint: "GET /admin/products/{id}/allergens", consumer: "productos.tsx (direct api.get)", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Product allergen cache" },
  { group: "allergens", endpoint: "POST /admin/products/{id}/allergens/recalculate", consumer: "productos.tsx (direct api.post)", auth: "JWT/cookie", role: "manager,admin", decision: "include", reason: "Recalculate from recipe" },
  { group: "allergens", endpoint: "POST /admin/products/{id}/allergens/override", consumer: "productos.tsx (direct)", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Manual override" },
  { group: "allergens", endpoint: "DELETE /admin/products/{id}/allergens/override/{code}", consumer: "productos.tsx (direct)", auth: "JWT/cookie", role: "admin", decision: "include", reason: "Remove override" },
  { group: "staff-read", endpoint: "GET /categories", consumer: "order.tsx", auth: "JWT/cookie", role: "authenticated", decision: "include", reason: "TPV category list (merged path)" },
  { group: "staff-read", endpoint: "GET /categories/{categoryId}/products", consumer: "order.tsx", auth: "JWT/cookie", role: "authenticated", decision: "include", reason: "TPV products (merged path)" },
  { group: "staff-read", endpoint: "GET /products", consumer: "delivery.tsx (search)", auth: "JWT/cookie", role: "authenticated", decision: "include", reason: "Product search" },
  { group: "recipes", endpoint: "GET /admin/products/{productId}/recipe", consumer: "productos.tsx (useGetProductRecipe)", auth: "JWT/cookie", role: "admin", decision: "exclude", reason: "Recipe domain — Entrega futura" },
  { group: "ingredients", endpoint: "GET /admin/ingredients", consumer: "recetas domain", auth: "JWT/cookie", role: "admin", decision: "exclude", reason: "Ingredient/stock domain" },
  { group: "qr-public", endpoint: "GET /qr-menu/public/*", consumer: "QR carta pública", auth: "public", role: "none", decision: "exclude", reason: "QR public menu — fuera de alcance" },
  { group: "tags", endpoint: "CRUD /admin/tags", consumer: "none", auth: "n/a", role: "n/a", decision: "exclude", reason: "Etiquetas dietéticas son columnas boolean en products" },
  { group: "menus", endpoint: "CRUD combos/menus", consumer: "none", auth: "n/a", role: "n/a", decision: "exclude", reason: "No implementado en backend" },
];

const contracted = [];
for (const [pathname, methods] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    if (!operation?.tags?.includes("phase59-catalog-admin")) continue;
    contracted.push({
      group: operation.tags.find((t) => t === "catalog-admin") ? "contracted" : "contracted",
      endpoint: `${method.toUpperCase()} ${pathname}`,
      operationId: operation.operationId,
      roles: operation["x-roles"] ?? [],
      responses: Object.keys(operation.responses).sort(),
    });
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  domain: "catalog-admin",
  tag: "phase59-catalog-admin",
  contractedOperations: contracted.length,
  inventoryRows: inventory.length,
  inventory,
  contracted,
};

const jsonPath = path.join(root, "docs/openapi-entrega59-inventory.json");
const csvPath = path.join(root, "docs/openapi-entrega59-inventory.csv");
fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);

const header = "group,endpoint,consumer,auth,role,decision,reason";
const csv = [header, ...inventory.map((row) =>
  [row.group, row.endpoint, row.consumer, row.auth, row.role, row.decision, `"${row.reason.replace(/"/g, '""')}"`].join(","),
)].join("\n");
fs.writeFileSync(csvPath, `${csv}\n`);

const hash = createHash("sha256").update(fs.readFileSync(jsonPath)).digest("hex");
console.log(`Inventory written: ${inventory.length} rows, ${contracted.length} contracted ops, sha256: ${hash.slice(0, 12)}`);
