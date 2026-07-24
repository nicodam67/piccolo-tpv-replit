# Entrega 41 — OpenAPI Pedidos, Mesas y Salas

## Alcance

El dominio contiene 49 operaciones: 28 contratos preexistentes y 21 añadidos en esta fase.
La auditoría automática confirma que no queda ninguna ruta sin documentar en `zones`,
`tables`, `table-operations`, `orders`, `canvas-elements` y `kds`.

## Operaciones añadidas

- `GET /tables/occupation-summary`
- `GET /tables/{tableId}/history`
- `GET|PATCH /admin/alert-config`
- `POST /tables/{tableId}/clean`
- `POST /tables/{tableId}/block`
- `POST /tables/{tableId}/transfer`
- `POST /tables/merge`
- `POST /tables/{tableId}/separate`
- `POST /orders/{orderId}/move-items`
- `POST /tables/{tableId}/transfer-waiter`
- `POST /orders/{orderId}/prefactura/print`
- `GET /orders/{orderId}/prefactura/status`
- `GET /kds/history`
- `POST /kitchen-tasks/{taskId}/resend`
- `GET|POST /admin/kds-stations`
- `PATCH|DELETE /admin/kds-stations/{id}`
- `POST /admin/kds-stations/{id}/ping`
- `GET /admin/kds-zones/transitions`

## Contratos corregidos con evidencia del código

- `Table` incluye los campos enriquecidos emitidos por `rowToTable` y `tableShape`.
- `UpdateTableInput` ya no permite cambiar `status`; el servidor lo rechaza.
- `OpenTableInput` incluye cliente, notas, terminal y empleado.
- `Order` refleja las columnas devueltas por Drizzle.
- `KitchenTaskRecord` representa mutaciones; `KitchenTask` añade joins del listado KDS.
- Se documentan `sin_partida`, 409/422/503, cierre forzado e idempotencia opcional.

## Cliente y hooks

Orval genera únicamente operaciones con tag `phase1-floor` en
`lib/api-client-react/src/phase1-generated`. El subpath
`@workspace/api-client-react/phase1` evita regenerar o romper otros dominios.

Consumidores migrados: mesas, configuración, pedido, prefactura, KDS y administración
de estaciones KDS. Los exports históricos del paquete raíz se conservan por compatibilidad.

## Validación

- `floor-openapi-contract.test.ts` valida operaciones, seguridad y respuestas.
- `check-phase1-codegen.mjs` ejecuta dos regeneraciones y compara hashes.
- La cobertura del dominio es 49/49.
