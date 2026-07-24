# Entrega 45 — inventario y selección de dominio

## Inventario de hooks sin contrato

| Dominio | Hooks | Consumidores / dependencia principal | Riesgo |
|---|---:|---|---|
| catalog-admin | 25 | Carta, productos, modificadores | medio-alto |
| CRM | 17 | Clientes, pedidos y reservas | medio |
| stock | 11 | Compras, recetas y pedidos | alto |
| cash-machine | 10 | Hardware y cobros físicos | crítico |
| purchasing | 10 | Proveedores, facturas y stock | alto |
| VeriFactu | 9 | AEAT y facturación | crítico |
| subrecipes | 8 | Productos y stock | medio |
| payments-orders | 7 | Caja, descuentos e idempotencia | crítico |
| profitability | 6 | Informes de costes | medio |
| reservations | 5 | Sala, mesas y CRM opcional | medio |
| cash-sessions | 5 | Caja e informes X/Z | crítico |
| recipes-food-cost | 4 | Productos e ingredientes | medio |
| branding-admin | 2 | Configuración y QR | medio |
| branding-public | 1 | Carta pública | alto |
| **Total** | **120** | 116 con consumidor; 4 sin consumidor | — |

El inventario estructurado permanece en `artifacts/api-client-inventory.json`.

## Dominio seleccionado: Reservations

Se selecciona el núcleo `reservations.ts` porque:

1. Tiene impacto operativo directo en sala.
2. Su frontera es clara: ocho operaciones y cinco hooks históricos.
3. Depende de mesas/pedidos, ya contratados en Entrega 41.
4. No requiere hardware ni servicios externos.
5. Dispone de pruebas unitarias y E2E PostgreSQL.
6. Presenta menor riesgo que pagos, caja automática, VeriFactu, CRM o fidelización.

Quedan fuera de esta entrega `waiting-list`, `service-shifts`, depósitos y agregados Director:
son subdominios con contratos, consumidores y decisiones propias, y no corresponden a los cinco
hooks seleccionados.

## Hooks del dominio

- `useGetReservations`
- `useCreateReservation`
- `usePatchReservation`
- `useDeleteReservation`
- `useArriveReservation`

## Endpoints contratados

- `GET|POST /reservations`
- `GET /reservations/suggest-table`
- `GET|PATCH|DELETE /reservations/{id}`
- `POST /reservations/{id}/arrive`
- `GET /reservations/{id}/history`

## Evidencia y decisiones preservadas

- Todos aceptan JWT Bearer o cookie `piccolo_session`.
- Solo DELETE requiere `manager|admin`; los demás aceptan cualquier sesión autenticada.
- No existe soporte `Idempotency-Key`; create/patch/arrive/delete se documentan no idempotentes.
- Status desconocidos en filtros/PATCH se ignoran actualmente.
- `arrive` puede abrir mesa y crear pedido, pero no cambia esa lógica.
- No se documentan depósitos, capacidad de turnos ni filtros sugeridos pero no implementados.

## Preparación

Las ocho operaciones quedan aisladas bajo el tag `phase45-reservations`, con cliente generado
determinista y pruebas contractuales. El dominio queda preparado para migrar sus cinco hooks en
una entrega posterior; no se migra ningún hook en Entrega 45.
