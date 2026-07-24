# Entrega 60 — Migración consumidores Catalog Admin

## Resultado

Consumidores activos del dominio Catalog Admin migrados a `@workspace/api-client-react/catalog-admin`.

**Catalog Admin queda consolidado sobre OpenAPI: COMPLETAMENTE** (alcance contratado en Entrega 59).

## Capa compat

- `lib/api-client-react/src/catalog-admin-compat.ts`
- `lib/api-client-react/src/catalog-admin-adapters.ts`
- Export: `@workspace/api-client-react/catalog-admin`

Adaptadores explícitos:

- `parseProductAllergensResponse` / `allergenCodesForLegacyTextField`
- `pruneTranslations` / `mergeTranslationsPatch` / `buildTranslationsPatchFromFormEdit`
- `recalculateAndFetchProductAllergens` / `patchProductSoldout`
- `useCreateAdminModifier` (`groupId` → `id`)
- `useImportProducts` (`{ file }` → `{ data: { file } }`)
- `useUpdateProductFormatTaxRate` (`taxRate: null` para herencia)

## Consumidores migrados

| Consumidor | Cambio |
|------------|--------|
| `categorias.tsx` | hooks catalog-admin |
| `productos.tsx` | hooks + alérgenos/soldout sin HTTP manual |
| `modificadores.tsx` | hooks catalog-admin |
| `order.tsx` | lecturas staff desde catalog-admin; stock sigue en main |
| `EditItemModal.tsx` | `useGetProductModifiers` desde catalog-admin |
| `fiscal.tsx` | IVA producto/formato |
| `inventario-fisico.tsx` | solo `useGetAdminCategories` |
| `admin-impresoras.tsx` | `getAdminCategories()` |
| `delivery.tsx` | `searchCatalogProducts` |
| `qr-menu/lib.ts` | funciones admin sin `customFetch` manual |

## Hooks legacy eliminados

138 declaraciones duplicadas retiradas de `generated/api.ts` + 26 esquemas legacy.

## Desalineaciones tratadas

| Caso | Tratamiento |
|------|-------------|
| Alérgenos array vs `{cache, overrides}` | Adaptador; UI sigue usando texto legacy con códigos EU |
| Traducciones JSONB | `pruneTranslations` en qr-menu patch |
| `groupId` vs `id` en create modifier | Wrapper compat |
| Rutas staff compartidas phase1 | Mismas query keys (`/api/categories`, etc.) vía aliases |

## Excluidos (fuera de alcance)

- `SetupCarta.tsx` — setup/onboarding con fetch propio
- Recetas, ingredientes, stock (`useGetProductAvailability`, `useGetProductRecipe`, etc.)
- QR público `/api/public/menu`

## Validaciones

```bash
node scripts/migrate-catalog-admin-generated-hooks.mjs
pnpm run typecheck
pnpm run codegen:catalog-admin:check
pnpm --filter api-server test -- catalog-admin-adapters catalog-admin-client-compat catalog-admin-openapi-contract
```
