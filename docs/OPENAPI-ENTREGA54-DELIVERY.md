# Entrega 54 — contratos Delivery / Reparto

## Resultado

El dominio Delivery / Reparto queda contratado en **25 operaciones** con tag `phase54-delivery`.
Cliente Orval aislado: `delivery-generated`. **No se migraron consumidores** (Entrega 55).

## Inventario del dominio

### Fuentes backend

| Archivo | Rutas contratadas |
|---------|-------------------|
| `delivery-orders.ts` | `delivery-orders`, `couriers/{id}/summary`, `couriers/{id}/settle`, `courier-settlements` |
| `online-orders.ts` | `online-orders` (bandeja TPV), config, zones, couriers CRUD |

### Excluidos (documentados en `endpoint-exclusions.json`)

- API móvil courier token (`/courier/{courierId}/*`)
- Rutas públicas legacy / 410 (`/public/orders/online`, etc.)
- `GET /admin/online-reports`

### Consumidores identificados (sin migrar)

| Archivo | HTTP directa pendiente |
|---------|------------------------|
| `artifacts/piccolo-tpv/src/pages/delivery.tsx` | `delivery-orders`, `couriers`, `online-orders/confirm`, `online-orders/assign-courier` |
| `artifacts/piccolo-tpv/src/pages/admin-repartidores.tsx` | `couriers`, `courier-settlements` |

## Contratos

- Tag unificado: `delivery` + `phase54-delivery`
- Autenticación: `bearerAuth` + `cookieAuth` en todas las operaciones
- RBAC: `x-roles` por operación (waiter/cashier/manager/admin según runtime)
- Respuestas HTTP documentadas: 200/201/400/401/403/404/409/503 según endpoint
- `POST /delivery-orders`: header `Idempotency-Key` obligatorio, `x-idempotent: true`

## Esquemas añadidos (35)

`DeliveryAddress`, `CourierSafe`, `DeliveryZone`, `DeliveryOrderListItem`, `DeliveryOrderDetail`,
`CreateDeliveryOrderInput`, `OnlineOrderInboxItem`, `AdminOnlineConfigResponse`, `CourierSettlement`, etc.

## Artefactos

| Artefacto | Ruta |
|-----------|------|
| Fragmento paths | `lib/api-spec/delivery-openapi-section.yaml` |
| Fragmento schemas | `lib/api-spec/delivery-openapi-schemas.yaml` |
| Splice script | `scripts/splice-delivery-openapi.mjs` |
| Orval config | `lib/api-spec/orval.delivery.config.ts` |
| Cliente generado | `lib/api-client-react/src/delivery-generated/` |
| Tests metadata | `artifacts/api-server/src/routes/delivery-openapi-contract.test.ts` |

## Validaciones

- Codegen delivery: `pnpm --filter @workspace/api-spec codegen:delivery`
- Codegen determinista: sha256 idéntico en dos ejecuciones
- TypeScript: `lib/api-client-react`
- Tests metadata: 25 operaciones verificadas
- Auditoría OpenAPI: 177 endpoints documentados (+25), 10 exclusiones

## Preparación Entrega 55

Listo para crear `delivery-compat.ts` y migrar `delivery.tsx` + `admin-repartidores.tsx`
a hooks de `delivery-generated`.
