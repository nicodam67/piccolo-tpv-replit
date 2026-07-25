# Entrega 61 — Contratación OpenAPI Cash & Payments

## Resultado

Contrato aislado `phase61-cash-payments` para **33 operaciones activas**. No se migraron consumidores, no se modificó backend, lógica financiera, RBAC, base de datos ni proveedores.

Fuente reproducible:

- `docs/openapi-entrega61-inventory.json`
- `docs/openapi-entrega61-inventory.csv`
- `scripts/inventory-cash-payments-openapi.mjs`

## Routers y grupos

| Router | Grupo | Operaciones incluidas |
|---|---|---:|
| `cash.ts` | métodos, apertura/cierre, movimientos, arqueo, Z/X, historial, reapertura/anulación | 11 |
| `payments.ts` | resumen, pago parcial/mixto, ticket | 3 |
| `splits.ts` | grupos de división | 3 |
| `tips.ts` | alta y lectura de propinas | 2 |
| `cash-machine.ts` | configuración, estado, cobro, cancelación, conciliación, devolución y ledger | 12 |
| `reports.ts` | agregados operativos de métodos y sesiones | 2 |

## Operaciones

### Caja

- `GET /payment-methods`
- `POST /cash-sessions/open`
- `GET /cash-sessions/current`
- `POST /cash-sessions/{id}/movements`
- `POST /cash-sessions/{id}/close`
- `GET /cash-sessions/{id}/summary`
- `GET /cash-sessions/{id}/report`
- `GET /cash-sessions/{id}/x-report`
- `POST /cash-sessions/{id}/reopen`
- `POST /cash-sessions/{id}/void-payment`
- `GET /cash-sessions/history`

### Pagos, divisiones y propinas

- `GET /orders/{orderId}/payment-summary`
- `POST /orders/{orderId}/payments`
- `GET /orders/{orderId}/ticket`
- `GET/POST /orders/{id}/splits`
- `PUT /orders/{id}/splits/{groupId}/pay`
- `POST /payments/{id}/tip`
- `GET /orders/{id}/tips`

### Caja automática y conciliación

- `GET/PUT /admin/cash-machine/config`
- `POST /admin/cash-machine/test-connection`
- `GET /admin/cash-machine/status`
- `GET /admin/cash-machine/cash-levels`
- `POST /cash-machine/payments`
- `GET /cash-machine/payments/{id}`
- `POST /cash-machine/payments/{id}/cancel`
- `POST /cash-machine/payments/{id}/reconcile`
- `POST /cash-machine/refunds`
- `GET /cash-machine/transactions`
- `GET /cash-sessions/{id}/cash-machine-summary`

### Informes operativos

- `GET /reports/payments`
- `GET /reports/cash`

## Autenticación y RBAC

Todas las operaciones admiten JWT Bearer o cookie autenticada. El contrato refleja el middleware real:

- caja abierta/cierre/movimientos/informes: `manager`, `admin`;
- reapertura y anulación manual: `admin`;
- pagos: `waiter`, `cashier`, `encargado`, `manager`, `admin`;
- configuración de caja automática: `admin`;
- estado, ledger, conciliación y devoluciones de caja automática: `manager`, `admin`;
- splits y propinas: solo `requireAuth`; aunque existe catálogo de permisos, el router no usa `requireRole`.

No se amplió ni corrigió RBAC en esta entrega.

## Importes y estados

Los importes viajan como cadenas decimales, igual que los campos `numeric` del runtime. No se convirtieron a céntimos ni se normalizaron estados.

Estados de sesión reales: `open`, `closed`.

Estados de pago persistidos: `completed`, `voided`.

Estados de caja automática:

`pending`, `iniciando`, `esperando_efectivo`, `efectivo_parcial`, `devolviendo_cambio`, `completada`, `cancelada`, `tiempo_agotado`, `error`, `intervencion_manual`, `conciliando`, `conciliacion_pendiente`.

## Idempotencia y concurrencia

`Idempotency-Key`:

- opcional en cierre de caja y pago de pedido, porque el middleware deja continuar si falta;
- obligatorio en inicio de cobro y devolución de caja automática, porque el handler devuelve `400` si falta;
- longitud real cuando se suministra: 8–200;
- almacenamiento en memoria + PostgreSQL durante 24 horas;
- lock advisory por usuario/clave;
- replay con `Idempotency-Replayed: true`.

Los pagos usan `pg_advisory_xact_lock` por pedido y `SELECT ... FOR UPDATE`. La caja automática ordena locks por dispositivo, referencia, terminal, pedido, mesa y split. Se bloquean cobros concurrentes y estados físicos pendientes de conciliación.

La apertura de caja comprueba una sesión abierta por terminal, pero no usa un lock transaccional. La anulación usa una transacción sin advisory lock. Estos riesgos existentes se documentan; no se cambia lógica.

## Pagos parciales, mixtos y cambio

Un pago parcial o mixto consiste en varias llamadas a `POST /orders/{orderId}/payments`. No existe un endpoint separado de “mixed payment”. El último pago liquida pedido, emite ticket y marca la mesa pendiente de limpieza. Solo efectivo puede superar el saldo; el importe persistido se limita al saldo y la respuesta contiene el cambio.

Los splits organizan responsabilidad y enlazan pagos, pero el cobro sigue usando el endpoint de pagos.

## Devoluciones y anulaciones

- Anulación manual: `POST /cash-sessions/{id}/void-payment`, solo admin; estado `voided`, registro de auditoría y contramovimiento para efectivo.
- Devolución física: `POST /cash-machine/refunds`, solo manager/admin y con idempotencia obligatoria.
- No existe una devolución manual genérica para tarjeta/Bizum; no se inventa.

## Proveedores y fail-closed

Solo existe `SimulatorAdapter`. No hay adaptador de hardware productivo para CashKeeper u otro fabricante. El registro rechaza el simulador en producción y la API devuelve `503` cuando el módulo está deshabilitado o el conector no está disponible.

Stripe, Bizum y Redsys no se presentan como integraciones productivas. `bizum` es únicamente un código de método de pago manual sembrado. No se instaló SDK, activó proveedor ni añadió configuración.

## Consumidores inventariados para Entrega 62

Principales consumidores activos:

- `payment.tsx`
- `cash-session.tsx`
- `z-report.tsx`
- `x-report.tsx`
- `prefactura.tsx`
- `ticket.tsx`
- `caja-automatica.tsx`
- `caja-automatica-estado.tsx`
- `informes.tsx`
- `director/DirectorCaja.tsx` (excluido del contrato)

Se localizaron **23 hooks manuales** y seis archivos con HTTP imperativo/directo relacionado o adyacente. No se modificó ninguno.

## Desalineaciones documentadas

- `GET /cash-sessions/current` puede responder `null`; el tipo legacy no era nullable.
- La UI bloquea todos los pagos sin sesión, mientras backend solo exige sesión para efectivo.
- `/caja` es visible para `encargado`, pero apertura/cierre/movimientos admiten solo manager/admin.
- El consumidor comprueba un estado inglés `completed`; el runtime usa `completada`.
- Los IDs de métodos del setup (`efectivo`, `tarjeta`) no coinciden con los códigos sembrados (`cash`, `card`) y el setup no actualiza `payment_methods`.
- El catálogo de permisos define permisos de splits, pero el router solo exige autenticación.

## Exclusiones

- `/reports/voids`: mezcla descuentos y anulaciones; la anulación de pago ya está contratada por su comando.
- `/reports/summary`, tendencias, camareros, zonas, productos, IVA, horas punta, top-products y export Excel: informes generales, fiscales o de rendimiento.
- `/director/cash`: informe financiero de Director.
- Stripe/public online payment, simulación de pago online y Delivery settlements.
- Verifactu, facturación, Documents, reservas, Wallet/Gift Cards.
- Sync offline `cash_payment`: stub que solo confirma recepción y no crea un pago.
- Rutas legacy/sentinelas 410.
- CRUD de métodos de pago: no existe endpoint activo; se siembran en startup.
- Hardware productivo: no implementado.

## Esquemas

Se añadieron esquemas prefijados `CashPayments*` para sesiones, movimientos, resumen de pedido, pagos, splits, propinas, informes Z/X, configuración y estado de caja automática, comandos físicos, ledger y conciliación. Se reutilizan `TaxBreakdownItem`, `ErrorResponse` y respuestas compartidas.

## Cliente y codegen

- Configuración: `lib/api-spec/orval.cash-payments.config.ts`
- Salida: `lib/api-client-react/src/cash-payments-generated/`
- Export: `@workspace/api-client-react/cash-payments-generated`
- Generación: `pnpm --filter @workspace/api-spec codegen:cash-payments`
- Determinismo: `pnpm run codegen:cash-payments:check`

No editar manualmente la salida generada.

## Pruebas y preparación Entrega 62

`cash-payments-openapi-contract.test.ts` valida operación/tag/auth/RBAC, operationIds globales, referencias, paths, idempotencia, exclusiones y evidencia focalizada de conflictos, locks, pagos parciales, splits y fail-closed.

La integración PostgreSQL se omite cuando no existe base local o `RUN_DB_INTEGRATION_TESTS=1`; las suites existentes `payments.test.ts`, `cash-machine.test.ts`, `service-flow.test.ts`, `concurrency.test.ts` y `production-connectors.test.ts` cubren el runtime sin requerir cambios para esta contratación.

En Cursor Cloud, `DATABASE_URL` apuntó a `/tmp/.s.PGSQL.5433`, pero no había servidor escuchando; `psql` y `pg_isready` devolvieron “no response” y Docker no está instalado. Por tanto no se ejecutó integración PostgreSQL.

**Cash & Payments queda preparado para migración de consumidores en la Entrega 62: SÍ.**
