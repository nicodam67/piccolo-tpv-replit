# Entrega 50 — migración de hooks CRM

## Resultado

Los 17 hooks manuales del dominio CRM fueron sustituidos por el cliente generado
`crm-generated`, con compatibilidad pública preservada vía `crm-compat.ts`.

## Hooks migrados (17/17)

- `useGetCrmClients`, `useGetCrmClient`, `useCreateCrmClient`, `useUpdateCrmClient`, `useGetCrmClientHistory`
- `useGetCrmLoyaltyConfig`, `useUpdateCrmLoyaltyConfig`
- `useIssueCrmPoints`, `useRedeemCrmPoints`
- `useGetCrmGiftCards`, `useCreateCrmGiftCard`, `useRechargeCrmGiftCard`, `usePayWithCrmGiftCard`
- `useGetCrmPromotions`, `useCreateCrmPromotion`, `useValidateCrmPromotion`
- `useGetCrmReports`

## Consumidores

Ningún archivo de aplicación importaba directamente estos hooks; el paquete raíz
`@workspace/api-client-react` reexporta los símbolos vía `crm-compat.ts` para
compatibilidad pública. Las páginas CRM (`crm.tsx`, `DirectorCRM.tsx`) siguen
usando `api.get`/`api.post` locales (fuera del alcance de esta entrega).

## Adaptadores

- `useIssueCrmPoints` — mapea `{ clientId, data }` → `{ id, data }`
- `useRedeemCrmPoints` — mapea `{ clientId, data }` → `{ id, data }`
- `issueCrmPoints` / `redeemCrmPoints` — conservan firma `(clientId, data)`

## Duplicación eliminada

`migrate-crm-generated-hooks.mjs` elimina de forma AST e idempotente 41 declaraciones
HTTP históricas de `generated/api.ts` y 20 esquemas legacy de `generated/api.schemas.ts`.

## Estado

- Hooks migrados: 17/17.
- HTTP manual CRM restante en `generated/api.ts`: 0.
- Dominio CRM consolidado sobre OpenAPI para los hooks contratados en Entrega 49.

No se modificaron contratos OpenAPI, endpoints, reglas de negocio ni base de datos.
