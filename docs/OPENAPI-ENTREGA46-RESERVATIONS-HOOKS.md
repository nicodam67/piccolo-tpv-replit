# Entrega 46 — migración económica de Reservations core

## Resultado

Los cinco hooks manuales de Reservations core fueron sustituidos por el cliente generado.

## Hooks migrados

- `useGetReservations`
- `useCreateReservation`
- `usePatchReservation`
- `useDeleteReservation`
- `useArriveReservation`

## Consumidores

- `pages/reservations.tsx`: listados diario/semanal, creación, edición, cambio de estado,
  llegada y eliminación.
- `pages/admin-dashboard.tsx`: contador diario de reservas.

La llamada manual a `suggest-table` permanece porque corresponde a una operación diferente
y no formaba parte de los cinco hooks de esta entrega.

## Compatibilidad

El paquete raíz reexporta los símbolos generados mediante `reservations-compat.ts`.
`useArriveReservation` conserva su firma histórica `{ id, openTable? }` con un adaptador
tipado que delega en la firma generada `{ id, data?: { openTable? } }`.

## Duplicación eliminada

`migrate-reservations-generated-hooks.mjs` elimina de forma AST e idempotente las
implementaciones HTTP históricas. El codegen doble incluye cliente, poda y compatibilidad
en su hash.

## Estado

- Hooks migrados: 5/5.
- Hooks pendientes en Reservations core: 0.
- Consumidores migrados: 2.
- Hooks sin contrato de otros dominios: 115.
- HTTP manual restante bajo `/reservations`: únicamente `suggest-table`, fuera del alcance.

No se modificaron contratos, endpoints, reglas de negocio, idempotencia ni base de datos.
