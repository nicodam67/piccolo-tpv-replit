# Entrega 49 — contratos CRM

## Resultado

El dominio `crm` queda contratado y validado en sus 49 operaciones. No se migraron hooks.

## Inventario

### Hooks manuales (17, sin migrar)

- `useGetCrmClients`, `useGetCrmClient`, `useCreateCrmClient`, `useUpdateCrmClient`, `useGetCrmClientHistory`
- `useGetCrmLoyaltyConfig`, `useUpdateCrmLoyaltyConfig`
- `useIssueCrmPoints`, `useRedeemCrmPoints`
- `useGetCrmGiftCards`, `useCreateCrmGiftCard`, `useRechargeCrmGiftCard`, `usePayWithCrmGiftCard`
- `useGetCrmPromotions`, `useCreateCrmPromotion`, `useValidateCrmPromotion`
- `useGetCrmReports`

### Consumidores

- `artifacts/piccolo-tpv/src/pages/crm.tsx`
- `artifacts/piccolo-tpv/src/pages/director/DirectorCRM.tsx`
- `artifacts/piccolo-tpv/src/pages/reservations.tsx` (asociación cliente)
- `artifacts/piccolo-tpv/src/pages/admin-dashboard.tsx`

### Endpoints contratados (49)

Clientes, fidelización, puntos, tarjetas regalo, promociones, campañas, segmentación,
monedero, consentimientos, automatizaciones, informes y demo-data (`crm.ts` + `loyalty-extended.ts`).

## Contratos completados

- Autenticación `bearerAuth` + `cookieAuth` en todas las operaciones.
- RBAC documentado con roles reales (`waiter`, `cashier`, `manager`, `admin`).
- Códigos HTTP alineados al runtime (`400`, `401`, `403`, `404`, `409`, `503`).
- Esquema `CrmClient` ampliado con campos v2 de Drizzle.
- Error `409` de cliente duplicado con `clienteExistente`.

## Evidencia

- `crm-openapi-contract.test.ts` recorre 49/49 operaciones (metadata).
- Cliente aislado `crm-generated` con codegen doble determinista.
- Auditoría OpenAPI: rutas `/crm/*` y `/admin/crm/*` sin pendientes.

## Preparación Entrega 50

Listo para migrar los 17 hooks manuales en la siguiente entrega.
