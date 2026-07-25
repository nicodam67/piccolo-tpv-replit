# Entrega 53 — Inventario del siguiente dominio OpenAPI pendiente

Inventario y decisión exclusivamente. **No se han modificado** contratos, clientes generados, hooks, endpoints ni lógica de negocio.

## Informe final

| Campo | Valor |
|-------|-------|
| **Rama** | `cursor/openapi-next-domain-inventory-a8c8` |
| **Base** | `fe395d9` (Entrega 52 — migración Wallet hooks) |
| **Modelo** | Composer 2.5 Fast |
| **Script de inventario** | `scripts/inventory-openapi-next-domain.mjs` |
| **Artefactos** | `docs/openapi-entrega53-inventory.json`, `docs/openapi-entrega53-inventory.csv` |
| **Determinismo** | Dos ejecuciones consecutivas → `sha256: 729f1109` |

### Totales actuales (post Entregas 41–52)

| Métrica | Total |
|---------|------:|
| Hooks manuales en `api.ts` | **139** |
| Hooks manuales sin contrato pendiente | **107** |
| Hooks manuales en dominios ya consolidados (legacy) | **32** |
| Llamadas HTTP directas en `artifacts/piccolo-tpv` | **255** |
| Filas de inventario estructurado | **427** |
| Operaciones documentadas en `openapi.yaml` | **152** |

### Dominios excluidos (ya consolidados)

| Dominio funcional | Capa compat | Cliente generado | Tag OpenAPI |
|-------------------|-------------|------------------|-------------|
| Orders / Tables / Rooms / KDS | `phase1-compat.ts` (25 hooks) | `phase1-generated` | `phase1-floor` |
| Documents | `documents-compat.ts` (18 hooks) | `documents-generated` | `phase43-documents` |
| Reservations Core | `reservations-compat.ts` (4 hooks) | `reservations-generated` | `phase45-reservations` |
| Branding | `branding-compat.ts` (5 hooks) | `branding-generated` | `phase47-branding` |
| CRM hooks | `crm-compat.ts` (11 hooks) | `crm-generated` | `phase49-crm` |
| Wallet / Gift Cards | `wallet-compat.ts` (11 hooks) | `wallet-generated` | `phase51-wallet` |

**Nota:** CRM y Wallet tienen contrato OpenAPI completo, pero `crm.tsx` conserva ~22 llamadas HTTP directas (deuda de migración de hooks, no gap de contrato). Esas filas se clasifican como `consolidated-domain-http-debt`.

### Dominios pendientes (ordenados por volumen pendiente)

| # | Dominio | Hooks manuales | HTTP directas | Rutas únicas | Consumidores | Cobertura OpenAPI | Riesgo | Tamaño |
|---|---------|---------------:|--------------:|-------------:|-------------:|-------------------|--------|--------|
| — | `other` (heterogéneo) | 22 | 36 | 38 | 19 | Parcial / ausente | Alto | Muy grande |
| 1 | inventory-purchasing | 21 | 28 | 26 | 10 | Ausente | Alto | Muy grande |
| 2 | fichaje | 0 | 37 | 21 | 18 | Ausente | Medio-alto | Grande |
| 3 | catalog-admin | 28 | 8 | 21 | 4 | Parcial (`/categories`, `/products`) | Alto | Grande |
| 4 | hr | 0 | 25 | 16 | 7 | Ausente | Medio | Medio |
| 5 | cash-payments | 23 | 1 | 18 | 2 | Parcial (`/cash-sessions/*`) | Medio-alto | Medio |
| 6 | director | 0 | 22 | 21 | 16 | Ausente | Medio-alto | Grande |
| 7 | config-permissions | 4 | 15 | 16 | 5 | Parcial (`/config/business`) | Medio | Medio |
| 8 | fiscal-verifactu | 7 | 8 | 10 | 2 | Ausente | Medio | Pequeño |
| 9 | auth-employees | 2 | 13 | 7 | 12 | Parcial (`/auth/pin`, `/employees/login-list`) | Medio | Pequeño |
| **10** | **delivery** | **0** | **11** | **5** | **2** | **Ausente** | **Bajo** | **Pequeño-medio** |
| 11 | backup | 0 | 8 | 6 | 1 | Ausente | Bajo | Pequeño |
| 12 | tablet-setup | 0 | 4 | 3 | 1 | Ausente | Bajo | Pequeño |
| 13 | online-orders (TPV) | 0 | 1* | 1* | 1 | Ausente | Bajo | Pequeño |

\* `delivery.tsx` también invoca `/api/online-orders/:id/confirm` y `/api/online-orders/:id/assign-courier`; el inventario las agrupa parcialmente bajo `online-orders` por plantilla de ruta.

### Siguiente dominio recomendado: **Delivery / Reparto**

**Puntuación de selección:** 59 (criterios: valor funcional, tamaño abordable, independencia, bajo riesgo — no volumen bruto de pendientes).

#### Justificación con evidencia en repositorio

1. **Consumidores acotados y reales**
   - `artifacts/piccolo-tpv/src/pages/delivery.tsx` — centro de mando reparto/recogida
   - `artifacts/piccolo-tpv/src/pages/admin-repartidores.tsx` — CRUD repartidores y liquidaciones

2. **Cero hooks manuales** en `lib/api-client-react/src/generated/api.ts` para este dominio; toda la deuda es HTTP directa vía `api.get/post/patch/delete` → contratación limpia sin duplicar hooks legacy.

3. **Backend acotado y con tests**
   - `artifacts/api-server/src/routes/delivery-orders.ts` (8 rutas)
   - `artifacts/api-server/src/routes/online-orders.ts` (couriers, delivery-zones, bandeja TPV)
   - `artifacts/api-server/src/routes/delivery.test.ts`, `courier-auth.test.ts`

4. **Sin cobertura OpenAPI** — búsqueda en `lib/api-spec/openapi.yaml`: ningún path `delivery-orders`, `couriers`, `delivery-zones` ni `courier-settlements`.

5. **Independencia** — no solapa contratos de Orders (floor), CRM ni Wallet. Dependencias de datos con `orders`/`products` ya contratados en fase 1.

6. **Valor funcional Piccolo** — flujo operativo de reparto a domicilio y recogida, visible en TPV diario.

#### Dominios descartados como siguiente paso (y por qué)

| Dominio | Motivo de descarte |
|---------|-------------------|
| `other` | Cesto heterogéneo (stock, diagnósticos, QR, offline); no es un dominio funcional único. |
| inventory-purchasing | 49 pendientes, 10 consumidores, 26 rutas; alto acoplamiento compras/stock/recetas. |
| fichaje | 37 HTTP directas, 18 páginas; módulo RRHH separado, mayor superficie. |
| catalog-admin | 28 hooks manuales + solapamiento parcial con `/categories` ya en OpenAPI fase 1. |
| cash-payments | Solapa sesiones de caja ya parcialmente en OpenAPI; riesgo de duplicar `/cash-sessions`. |
| director | Capa de agregación/informes (16 consumidores); no es API de dominio transaccional. |
| backup / tablet-setup | Menor valor operativo TPV que reparto; candidatos secundarios. |

### Alcance propuesto para Entrega 54 (contratación OpenAPI — **no iniciada en E53**)

**Fase A — núcleo delivery (obligatorio):**

| Método | Ruta backend | Fuente |
|--------|-------------|--------|
| POST | `/delivery-orders` | `delivery-orders.ts` |
| GET | `/delivery-orders` | `delivery-orders.ts` |
| GET | `/delivery-orders/{id}` | `delivery-orders.ts` |
| GET | `/delivery-orders/{id}/history` | `delivery-orders.ts` |
| PATCH | `/delivery-orders/{id}` | `delivery-orders.ts` |
| GET | `/admin/couriers` | `online-orders.ts` |
| POST | `/admin/couriers` | `online-orders.ts` |
| PATCH | `/admin/couriers/{id}` | `online-orders.ts` |
| DELETE | `/admin/couriers/{id}` | `online-orders.ts` |
| GET | `/admin/couriers/{id}/summary` | `delivery-orders.ts` |
| POST | `/admin/couriers/{id}/settle` | `delivery-orders.ts` |
| GET | `/admin/courier-settlements` | `delivery-orders.ts` |
| GET/POST/PATCH/DELETE | `/admin/delivery-zones` (+ `/{id}`) | `online-orders.ts` |

**Fase B — bandeja TPV online (recomendado, usado por `delivery.tsx`):**

| Método | Ruta | Uso actual |
|--------|------|------------|
| POST | `/online-orders/{id}/confirm` | Confirmar pedido online |
| POST | `/online-orders/{id}/assign-courier` | Asignar repartidor |
| POST | `/online-orders/{id}/reject` | Rechazo |
| PATCH | `/online-orders/{id}/status` | Cambio de estado |
| GET | `/online-orders` | Bandeja |

**Fuera de alcance E54 (evaluar E55+):**

- Rutas públicas legacy (`/public/online-config`, `/public/check-zone`) — posible solapamiento con QR/online v2.
- API móvil repartidor con token (`/courier/{courierId}/*`) — autenticación Bearer separada.
- `GET /admin/online-reports` — informes, no transaccional.

**Entregables E54 previstos:** paths + schemas en `openapi.yaml`, tag `phase54-delivery`, `orval.delivery.config.ts`, `delivery-generated`, `delivery-openapi-contract.test.ts`.

### Riesgos y bloqueadores

| Riesgo | Mitigación |
|--------|------------|
| Couriers definidos en `online-orders.ts` y settlements en `delivery-orders.ts` | Un solo tag OpenAPI `delivery` que agrupe ambos routers. |
| `delivery.tsx` mezcla dominios (products, orders/send) | E54 solo contrata delivery; migración de consumidores en E55. |
| Rutas courier token sin auth estándar | Excluir de E54 o documentar security scheme `CourierToken` aparte. |
| Duplicar esquemas de Order | Reutilizar/referenciar schemas de `phase1-floor` donde aplique. |

---

## Metodología de auditoría

### Fuentes escaneadas

1. `lib/api-client-react/src/generated/api.ts` — 139 hooks `use*` manuales
2. `lib/api-client-react/src/*-compat.ts` — 6 capas compat (phase1, documents, reservations, branding, crm, wallet)
3. `lib/api-client-react/src/*-generated/api.ts` — hooks generados no migrados a compat
4. `artifacts/piccolo-tpv/src/**` — `api.get/post/patch/put/delete`, `customFetch`, `fetch('/api…')`
5. `lib/api-spec/openapi.yaml` — 152 operaciones documentadas

### Clasificaciones del inventario

| Clasificación | Significado | Filas |
|---------------|-------------|------:|
| `manual-hook-pending-contract` | Hook en `api.ts` sin contrato OpenAPI | 107 |
| `consolidated-hook-legacy` | Hook manual en dominio ya migrado a `*-generated` | 32 |
| `app-http-pending-contract` | HTTP directa en app, dominio sin contrato | 217 |
| `consolidated-domain-http-debt` | HTTP directa en dominio ya contratado (migración pendiente) | 38 |
| `generated-hook-not-migrated` | Hook en `*-generated` sin capa compat | 33 |

### Distinciones explícitas

- **Hooks manuales sin contrato:** 107 en `api.ts` (p. ej. `useGetAdminIngredients`, `usePostCashSessionsOpen`).
- **Hooks generados no migrados:** 33 (principalmente `crm-generated`; CRM ya tiene compat pero algunos hooks no exportados).
- **HTTP directa de aplicación:** 255 llamadas en páginas TPV.
- **Endpoints sin consumidor actual:** no identificados como bloqueantes; el inventario prioriza rutas con `consumerFile` en `piccolo-tpv`.
- **Código obsoleto/sentinela:** `POST /public/orders/online` → 410 Gone en `online-orders.ts`; excluir de contratación.
- **Duplicados:** deduplicación por `(kind, hook, method, route, consumerFile)` en el script.

### Dominio `other` — desglose (no recomendable como unidad)

Rutas heterogéneas sin cohesión funcional: stock (`/admin/stock/*`), trazabilidad, invoice-scanner, profitability, offline/diagnostics, `public/menu`, `kitchen-tasks`. Requiere subdivisión en entregas futuras, no contratación monolítica.

---

## Evidencia: dominio Delivery

### Llamadas HTTP directas detectadas

| Método | Ruta | Archivo |
|--------|------|---------|
| GET | `/api/delivery-orders` | `delivery.tsx` |
| PATCH | `/api/delivery-orders/{id}` | `delivery.tsx` |
| GET | `/api/admin/couriers` | `delivery.tsx`, `admin-repartidores.tsx` |
| POST | `/api/admin/couriers` | `admin-repartidores.tsx` |
| PATCH | `/api/admin/couriers/{id}` | `delivery.tsx`, `admin-repartidores.tsx` |
| DELETE | `/api/admin/couriers/{id}` | `admin-repartidores.tsx` |
| POST | `/api/admin/couriers/{id}/settle` | `delivery.tsx` |
| GET | `/api/admin/courier-settlements` | `admin-repartidores.tsx` |
| POST | `/api/online-orders/{id}/confirm` | `delivery.tsx` |
| POST | `/api/online-orders/{id}/assign-courier` | `delivery.tsx` |

### Dependencias con dominios consolidados

| Dependencia | Estado |
|-------------|--------|
| `POST /api/orders/{id}/send` en `delivery.tsx` | Ya en `phase1-floor` |
| `GET /api/products` en `delivery.tsx` | Parcial en OpenAPI; catálogo fuera de E54 |
| Tablas `orders`, `couriers`, `delivery_zones` | Solo referencia de schemas, sin duplicar contrato orders |

---

## Cómo reproducir

```bash
node scripts/inventory-openapi-next-domain.mjs
node scripts/inventory-openapi-next-domain.mjs   # debe repetir sha256
```

Salida esperada:

```json
{
  "manualHooksAll": 139,
  "manualHooksPendingContract": 107,
  "directHttpCalls": 255,
  "recommended": "delivery",
  "sha256": "729f1109"
}
```

## Archivos de inventario estructurado

- **JSON:** `docs/openapi-entrega53-inventory.json` — resumen por dominio + 427 filas detalladas
- **CSV:** `docs/openapi-entrega53-inventory.csv` — columnas: `domain`, `hook`, `method`, `route`, `consumerFile`, `openapiStatus`, `classification`, `recommendation`, `kind`

---

## Criterio de finalización

Existe evidencia suficiente para escoger **Delivery / Reparto** como siguiente dominio sin repetir trabajo de Entregas 41–52. La Entrega 54 puede iniciar la contratación OpenAPI con el alcance definido arriba.
