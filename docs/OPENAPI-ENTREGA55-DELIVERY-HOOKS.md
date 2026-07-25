# Entrega 55 — migración de consumidores Delivery / Reparto

## Resultado

Los consumidores `delivery.tsx` y `admin-repartidores.tsx` quedan consolidados sobre
`delivery-generated` vía `delivery-compat.ts`. **0 llamadas HTTP manuales Delivery** en ambos archivos.

## Llamadas migradas (14)

### `delivery.tsx` (8)

| Antes | Función `delivery-generated` |
|-------|------------------------------|
| `GET /api/delivery-orders` | `getDeliveryOrders` |
| `GET /api/admin/couriers` | `getCouriers` |
| `PATCH /api/delivery-orders/:id` | `patchDeliveryOrder` |
| `POST /api/online-orders/:id/confirm` | `confirmOnlineOrder` |
| `POST /api/online-orders/:id/assign-courier` | `assignOnlineOrderCourier` |
| `PATCH /api/admin/couriers/:id` (estado) | `patchCourier` |
| `POST /api/admin/couriers/:id/settle` | `settleCourier` |
| `POST /api/delivery-orders` | `createDeliveryOrder` |

### `admin-repartidores.tsx` (6)

| Antes | Función `delivery-generated` |
|-------|------------------------------|
| `GET /api/admin/couriers` | `getCouriers` |
| `GET /api/admin/courier-settlements` | `getCourierSettlements` |
| `POST /api/admin/couriers` | `createCourier` |
| `PATCH /api/admin/couriers/:id` | `patchCourier` |
| `DELETE /api/admin/couriers/:id` | `deleteCourier` |
| `PATCH /api/admin/couriers/:id` (estado) | `patchCourier` |

## Llamadas excluidas (otros dominios / fuera de contrato)

En `delivery.tsx` se mantienen sin cambios:

- `GET /api/products` — catálogo (Catalog)
- `POST /api/public/check-zone` — ruta pública (fuera de phase54-delivery)
- `POST /api/orders/:id/send` — Orders (phase1)

## Compatibilidad

- `delivery-compat.ts` reexporta `delivery-generated` (`export *`)
- Export package: `@workspace/api-client-react/delivery` → `delivery-compat.ts`
- Sin adaptadores de firma adicionales
- Tipos locales extendidos desde `CourierSafe` y `DeliveryOrderListItem`

## Estado

- HTTP manual Delivery en consumidores: **0**
- Dominio Delivery consolidado sobre OpenAPI

No se modificaron contratos OpenAPI, endpoints, reglas de negocio ni base de datos.
