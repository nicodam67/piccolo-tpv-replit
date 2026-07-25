import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const specPath = path.join(root, "lib/api-spec/openapi.yaml");
const pathsFragment = fs.readFileSync(path.join(root, "lib/api-spec/catalog-admin-openapi-section.yaml"), "utf8")
  .split("\n")
  .filter((line) => !line.startsWith("#"))
  .join("\n")
  .replace(/\n+$/, "");
const schemasFragment = fs.readFileSync(path.join(root, "lib/api-spec/catalog-admin-openapi-schemas.yaml"), "utf8")
  .split("\n")
  .filter((line) => !line.startsWith("#"))
  .join("\n")
  .replace(/\n+$/, "");

let spec = fs.readFileSync(specPath, "utf8");

if (spec.includes("phase59-catalog-admin")) {
  console.log("Catalog Admin OpenAPI section already present — skipping splice.");
  process.exit(0);
}

spec = spec.replace(
  "  - name: phase56-timeclock\n    description: Entrega 56 — fichaje domain contract scope\n\npaths:",
  "  - name: phase56-timeclock\n    description: Entrega 56 — fichaje domain contract scope\n  - name: catalog-admin\n    description: Catalog administration — categories, products, modifiers, allergens\n  - name: phase59-catalog-admin\n    description: Entrega 59 — catalog admin domain contract scope\n\npaths:",
);

spec = spec.replace(
  "components:",
  `${pathsFragment}\n\ncomponents:`,
);

spec = spec.replace(
  /    TimeclockRateLimitError:\n      type: object\n      properties:\n        error: \{ type: string \}\n        retryAfterMs: \{ type: integer \}\n      required: \[error\]\n?$/,
  (match) => `${match}\n${schemasFragment}\n`,
);

function applyStaffPathPatches(source) {
  let next = source;

  next = next.replace(
    /  \/categories:\n    get:\n      operationId: getCategories\n      tags: \[categories\]\n      summary: Get all active categories\n      security:\n        - bearerAuth: \[\]\n      responses:\n        "200":\n          description: List of categories\n          content:\n            application\/json:\n              schema:\n                type: array\n                items:\n                  \$ref: "#\/components\/schemas\/Category"\n        "401":\n          description: Unauthorized\n          content:\n            application\/json:\n              schema:\n                \$ref: "#\/components\/schemas\/ErrorResponse"/,
    `  /categories:
    get:
      operationId: getCatalogStaffCategories
      tags: [categories, catalog-admin, phase59-catalog-admin]
      summary: List active categories for staff TPV
      security: [{ bearerAuth: [] }, { cookieAuth: [] }]
      x-roles: [authenticated]
      responses:
        "200":
          description: Active categories
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/CatalogStaffCategory" }
        "401": { $ref: "#/components/responses/Unauthorized" }`,
  );

  next = next.replace(
    /  \/categories\/\{categoryId\}\/products:\n    get:\n      operationId: getCategoryProducts\n      tags: \[categories\]\n      summary: Get active products for a category\n      security:\n        - bearerAuth: \[\]\n      parameters:\n        - name: categoryId\n          in: path\n          required: true\n          schema:\n            type: string\n      responses:\n        "200":\n          description: List of products\n          content:\n            application\/json:\n              schema:\n                type: array\n                items:\n                  \$ref: "#\/components\/schemas\/Product"\n        "401":\n          description: Unauthorized\n          content:\n            application\/json:\n              schema:\n                \$ref: "#\/components\/schemas\/ErrorResponse"/,
    `  /categories/{categoryId}/products:
    get:
      operationId: getCatalogStaffCategoryProducts
      tags: [categories, catalog-admin, phase59-catalog-admin]
      summary: List active TPV-visible products for a category
      security: [{ bearerAuth: [] }, { cookieAuth: [] }]
      x-roles: [authenticated]
      parameters:
        - name: categoryId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "200":
          description: Products with formats and modifier flag
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/CatalogStaffCategoryProduct" }
        "401": { $ref: "#/components/responses/Unauthorized" }`,
  );

  next = next.replace(
    /  \/products\/\{productId\}\/modifiers:\n    get:\n      operationId: getProductModifiers\n      tags: \[categories\]\n      summary: Get modifier groups and options for a product\n      security:\n        - bearerAuth: \[\]\n      parameters:\n        - name: productId\n          in: path\n          required: true\n          schema:\n            type: string\n      responses:\n        "200":\n          description: Modifier groups for the product\n          content:\n            application\/json:\n              schema:\n                type: array\n                items:\n                  \$ref: "#\/components\/schemas\/ModifierGroup"\n        "401":\n          description: Unauthorized\n          content:\n            application\/json:\n              schema:\n                \$ref: "#\/components\/schemas\/ErrorResponse"/,
    `  /products/{productId}/modifiers:
    get:
      operationId: getCatalogProductModifiers
      tags: [categories, catalog-admin, phase59-catalog-admin]
      summary: List modifier groups and options for a product
      security: [{ bearerAuth: [] }, { cookieAuth: [] }]
      x-roles: [authenticated]
      parameters:
        - name: productId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "200":
          description: Modifier groups with options
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/CatalogStaffModifierGroup" }
        "401": { $ref: "#/components/responses/Unauthorized" }`,
  );

  next = next.replace(
    /  \/products\/\{productId\}\/formats:\n    get:\n      operationId: getProductFormats\n      tags: \[categories\]\n      summary: Get active formats for a product\n      security:\n        - bearerAuth: \[\]\n      parameters:\n        - name: productId\n          in: path\n          required: true\n          schema:\n            type: string\n      responses:\n        "200":\n          description: List of formats\n          content:\n            application\/json:\n              schema:\n                type: array\n                items:\n                  \$ref: "#\/components\/schemas\/ProductFormat"\n        "401":\n          description: Unauthorized\n          content:\n            application\/json:\n              schema:\n                \$ref: "#\/components\/schemas\/ErrorResponse"\n    post:\n      operationId: createProductFormat\n      tags: \[categories\]\n      summary: Create a format for a product \(admin only\)\n      security:\n        - bearerAuth: \[\]\n      parameters:\n        - name: productId\n          in: path\n          required: true\n          schema:\n            type: string\n      requestBody:\n        required: true\n        content:\n          application\/json:\n            schema:\n              \$ref: "#\/components\/schemas\/CreateProductFormatInput"\n      responses:\n        "201":\n          description: Format created\n          content:\n            application\/json:\n              schema:\n                \$ref: "#\/components\/schemas\/ProductFormat"\n        "400":\n          description: Bad request\n          content:\n            application\/json:\n              schema:\n                \$ref: "#\/components\/schemas\/ErrorResponse"\n        "401":\n          description: Unauthorized\n          content:\n            application\/json:\n              schema:\n                \$ref: "#\/components\/schemas\/ErrorResponse"\n        "403":\n          description: Forbidden\n          content:\n            application\/json:\n              schema:\n                \$ref: "#\/components\/schemas\/ErrorResponse"/,
    `  /products/{productId}/formats:
    get:
      operationId: getCatalogProductFormats
      tags: [categories, catalog-admin, phase59-catalog-admin]
      summary: List active formats for a product
      security: [{ bearerAuth: [] }, { cookieAuth: [] }]
      x-roles: [authenticated]
      parameters:
        - name: productId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "200":
          description: Product formats
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/CatalogProductFormat" }
        "401": { $ref: "#/components/responses/Unauthorized" }
    post:
      operationId: createCatalogProductFormat
      tags: [categories, catalog-admin, phase59-catalog-admin]
      summary: Create a product format
      security: [{ bearerAuth: [] }, { cookieAuth: [] }]
      x-roles: [admin]
      parameters:
        - name: productId
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CatalogCreateProductFormatInput" }
      responses:
        "201":
          description: Created format
          content:
            application/json:
              schema: { $ref: "#/components/schemas/CatalogProductFormat" }
        "400": { $ref: "#/components/responses/BadRequest" }
        "401": { $ref: "#/components/responses/Unauthorized" }
        "403": { $ref: "#/components/responses/Forbidden" }`,
  );

  next = next.replace(
    /  \/products\/formats\/\{formatId\}:\n    patch:\n      operationId: updateProductFormat\n      tags: \[categories\]\n      summary: Update a product format \(admin only\)\n      security:\n        - bearerAuth: \[\]\n      parameters:\n        - name: formatId\n          in: path\n          required: true\n          schema:\n            type: string\n      requestBody:\n        required: true\n        content:\n          application\/json:\n            schema:\n              \$ref: "#\/components\/schemas\/UpdateProductFormatInput"\n      responses:\n        "200":\n          description: Format updated\n          content:\n            application\/json:\n              schema:\n                \$ref: "#\/components\/schemas\/ProductFormat"\n        "404":\n          description: Not found\n          content:\n            application\/json:\n              schema:\n                \$ref: "#\/components\/schemas\/ErrorResponse"\n        "401":\n          description: Unauthorized\n          content:\n            application\/json:\n              schema:\n                \$ref: "#\/components\/schemas\/ErrorResponse"\n        "403":\n          description: Forbidden\n          content:\n            application\/json:\n              schema:\n                \$ref: "#\/components\/schemas\/ErrorResponse"/,
    `  /products/formats/{formatId}:
    patch:
      operationId: updateCatalogProductFormat
      tags: [categories, catalog-admin, phase59-catalog-admin]
      summary: Update a product format
      security: [{ bearerAuth: [] }, { cookieAuth: [] }]
      x-roles: [admin]
      parameters:
        - name: formatId
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CatalogUpdateProductFormatInput" }
      responses:
        "200":
          description: Updated format
          content:
            application/json:
              schema: { $ref: "#/components/schemas/CatalogProductFormat" }
        "400": { $ref: "#/components/responses/BadRequest" }
        "401": { $ref: "#/components/responses/Unauthorized" }
        "403": { $ref: "#/components/responses/Forbidden" }
        "404": { $ref: "#/components/responses/NotFound" }
    delete:
      operationId: deleteCatalogProductFormat
      tags: [categories, catalog-admin, phase59-catalog-admin]
      summary: Soft-archive a product format
      security: [{ bearerAuth: [] }, { cookieAuth: [] }]
      x-roles: [admin]
      parameters:
        - name: formatId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "200":
          description: Format archived
          content:
            application/json:
              schema: { $ref: "#/components/schemas/CatalogOkResult" }
        "401": { $ref: "#/components/responses/Unauthorized" }
        "403": { $ref: "#/components/responses/Forbidden" }`,
  );

  return next;
}

spec = applyStaffPathPatches(spec);

fs.writeFileSync(specPath, spec);
console.log("Spliced catalog-admin paths and schemas into openapi.yaml");
