# Entrega 59 — contratos Catalog Admin

## Resultado

El dominio Catalog Admin queda contratado en **45 operaciones** con tag `phase59-catalog-admin`.
Cliente Orval aislado: `catalog-admin-generated`. **No se migraron consumidores** (Entrega 60).

## Alcance

Inventario y contratación OpenAPI de operaciones administrativas de catálogo:

- categorías y subcategorías (jerarquía, orden, traducciones legacy);
- productos (CRUD, import/export, formatos/precios, media ración);
- disponibilidad y agotado (`soldout`, reglas de disponibilidad);
- modificadores (grupos, opciones, asignación a productos);
- alérgenos de producto (catálogo EU, caché, overrides, recálculo);
- lecturas staff TPV (`/categories`, `/products`, formatos, modificadores).

## Routers inspeccionados

| Archivo | Alcance |
|---------|---------|
| `artifacts/api-server/src/routes/categories.ts` | Staff reads + admin categories/subcategories |
| `artifacts/api-server/src/routes/products.ts` | Admin products, formats, import/export |
| `artifacts/api-server/src/routes/modifiers.ts` | Modifier groups and options |
| `artifacts/api-server/src/routes/allergens.ts` | Product allergen subset only (no technical sheets in contract) |
| `artifacts/api-server/src/routes/online-orders-v2.ts` | `soldout`, legacy `translations`, availability rules |

## Grupos funcionales y operaciones contratadas

| Grupo | Ops | Endpoints principales |
|-------|----:|-----------------------|
| Categorías | 6 | `/admin/categories`, `/admin/categories/sort`, `/admin/categories/{id}`, `/admin/categories/{id}/translations` |
| Subcategorías | 4 | `/admin/subcategories`, `/admin/subcategories/sort`, `/admin/subcategories/{id}` |
| Productos admin | 10 | `/admin/products`, sort, export, import, CRUD, modifier-groups, soldout, translations |
| Formatos / precios | 4 | `/products/{productId}/formats`, `/products/formats/{formatId}` (merged con phase1) |
| Disponibilidad | 4 | `/admin/product-availability-rules` CRUD |
| Modificadores | 7 | `/admin/modifier-groups`, `/admin/modifiers`, staff read `/products/{productId}/modifiers` |
| Alérgenos producto | 6 | `/admin/allergens`, `/admin/products/{id}/allergens/*` |
| Lecturas staff | 4 | `/categories`, `/categories/{categoryId}/products`, `/products` (search) |

**Total: 45 operaciones.**

## Excluidos

| Ruta / área | Motivo |
|-------------|--------|
| `/admin/products/{id}/recipe*` | Dominio recetas/escandallos |
| `/admin/ingredients*` | Dominio ingredientes/stock |
| `/qr-menu/public/*` | Carta QR pública |
| CRUD `/admin/tags` | No existe; etiquetas dietéticas son booleanos en `products` |
| Combos/menús | No implementado en backend |
| Sincronización QR ya contratada | Dominio anterior |
| Sentinela 410 / legacy | Sin runtime activo |

## Esquemas

48 esquemas `Catalog*` en `lib/api-spec/catalog-admin-openapi-schemas.yaml` (reutilizan `ErrorResponse` compartido).
Precios como `string`; `taxRate` enum `4|10|21`; `CatalogOkResult: { ok: true }`.

## Autenticación y RBAC

- **Auth:** `bearerAuth` + `cookieAuth` en todas las operaciones contratadas.
- **RBAC (`x-roles`):**
  - `admin` — CRUD administrativo de catálogo.
  - `manager, admin` — soldout, traducciones legacy, recálculo alérgenos.
  - `authenticated` — lecturas staff TPV y búsqueda de productos.

## Consumidores identificados (sin migrar)

| Página / módulo | Hooks manuales | HTTP directo |
|-----------------|----------------|--------------|
| `categorias.tsx` | `useGetAdminCategories`, create/update/delete category/subcategory | — |
| `productos.tsx` | `useGetAdminProducts`, categories, modifier groups, recipe | `api.patch soldout`, `api.get/post allergens` |
| `modificadores.tsx` | `useGetAdminModifierGroups`, CRUD hooks | — |
| `order.tsx` | `useGetCategories`, `useGetCategoryProducts`, formats, modifiers | — |
| `qr-menu/lib.ts` | — | `customFetch` admin categories/products |
| `admin-impresoras.tsx` | — | `api('/api/admin/categories')` |
| `delivery.tsx` | — | búsqueda `/api/products?q=` |
| `fiscal.tsx`, `inventario-fisico.tsx` | `useGetAdminProducts/Categories` | — |

**Hooks manuales catalog-admin en `generated/api.ts`:** ~28 (categorías, productos, formatos, modificadores, import; sin hooks para alérgenos, soldout, traducciones ni availability rules).

## Desalineaciones consumidor/backend

| Caso | Evidencia | Tratamiento Entrega 60 |
|------|-----------|------------------------|
| A. Alérgenos GET | `productos.tsx` espera `Array<{allergenCode,type}>`; backend devuelve `{cache, overrides, needsReview}` | Contrato refleja backend; adaptar consumidor |
| B. Códigos alérgeno | UI usa códigos ES; catálogo EU usa códigos EN | Documentado; no falsear contrato |
| C. Traducciones | Endpoints legacy `nameEn` vs campo jsonb `translations` en PATCH producto | Mantener ambos contratados según runtime |
| D. Etiquetas dietéticas | UI muestra tags; backend usa columnas `isVegan`, `isGlutenFree`, etc. | No inventar endpoint tags |
| E. Recetas | `useGetProductRecipe` en productos.tsx | Excluido de Catalog Admin |

## Rutas staff fusionadas (sin duplicar paths)

Las rutas phase1 existentes se enriquecieron in-place con tag `phase59-catalog-admin`:

- `/categories`, `/categories/{categoryId}/products`
- `/products/{productId}/formats`, `/products/formats/{formatId}` (+ DELETE añadido)
- `/products/{productId}/modifiers`

Nueva ruta: `GET /products` (búsqueda staff).

## Artefactos

| Artefacto | Ruta |
|-----------|------|
| Fragmento paths admin | `lib/api-spec/catalog-admin-openapi-section.yaml` |
| Fragmento schemas | `lib/api-spec/catalog-admin-openapi-schemas.yaml` |
| Splice script | `scripts/splice-catalog-admin-openapi.mjs` |
| Orval config | `lib/api-spec/orval.catalog-admin.config.ts` |
| Cliente generado | `lib/api-client-react/src/catalog-admin-generated/` |
| Export estable | `@workspace/api-client-react/catalog-admin-generated` |
| Inventario | `docs/openapi-entrega59-inventory.json`, `.csv` |
| Script inventario | `scripts/inventory-catalog-admin-openapi.mjs` |
| Tests metadata | `artifacts/api-server/src/routes/catalog-admin-openapi-contract.test.ts` |

## Codegen y validaciones

```bash
node scripts/splice-catalog-admin-openapi.mjs   # idempotente
pnpm --filter @workspace/api-spec codegen:catalog-admin
pnpm run codegen:catalog-admin:check            # determinismo doble
node scripts/inventory-catalog-admin-openapi.mjs
pnpm --filter @workspace/api-client-react exec tsc --noEmit
pnpm --filter api-server build
pnpm --filter api-server test -- catalog-admin-openapi-contract
pnpm --filter api-server audit-openapi -- --strict --tag phase59-catalog-admin
```

Integración PostgreSQL: tests preparados con `RUN_DB_INTEGRATION_TESTS=1`; omitidos si no hay `DATABASE_URL`.

## Riesgos

- Migración de ~28 hooks + llamadas HTTP directas en Entrega 60.
- Desalineación alérgenos requiere capa compat o refactor UI.
- Rutas staff compartidas con `phase1-floor` — cuidado al renombrar operationIds.

## Preparación Entrega 60

Listo para crear `catalog-admin-compat.ts` y migrar `categorias.tsx`, `productos.tsx`, `modificadores.tsx` y lecturas staff a `catalog-admin-generated`.

**Catalog Admin queda preparado para migración de consumidores en la Entrega 60: SÍ**
