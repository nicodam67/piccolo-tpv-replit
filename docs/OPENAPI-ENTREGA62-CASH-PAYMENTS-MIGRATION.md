# Entrega 62 — Migración de consumidores Cash & Payments

## Inventario previo a cambios

Base: `9dc5843`. Contrato: `phase61-cash-payments`. Esta entrega migra consumidores mediante `@workspace/api-client-react/cash-payments` sin modificar backend, contratos, base de datos ni cálculos financieros.

Conteos verificados:

- 28 hooks legacy exportados para operaciones contratadas;
- 24 hooks con invocación activa;
- 4 hooks sin consumidor activo (`useVoidPayment`, `useStartCashMachinePayment`, `useGetCashMachinePayment`, `useCreateCashMachineRefund`);
- 1 función imperativa activa (`startCashMachinePayment`);
- 3 llamadas HTTP directas a operaciones contratadas (poll de caja automática y dos informes);
- 1 llamada directa excluida (`DirectorCaja` → `/director/cash`);
- 5 operaciones contratadas sin equivalente legacy/consumidor: tips list, reconcile, ledger y dos informes generados.

## Matriz de migración

| Consumidor | Hook/llamada actual | Endpoint | operationId generado | Auth / RBAC | Request actual → generado | Response UI / runtime | Query key e invalidación | Idempotencia | Decisión |
|---|---|---|---|---|---|---|---|---|---|
| `payment.tsx` | `useGetOrderPaymentSummary` | `GET /orders/{orderId}/payment-summary` | `getOrderCashPaymentSummary` | auth | `orderId` → igual | resumen compatible | key de URL; invalidada tras pagos/socket | — | compat |
| `payment.tsx` | `useAddPayment` | `POST /orders/{orderId}/payments` | `createOrderCashPayment` | waiter/cashier/encargado/manager/admin | `{orderId,data}` → igual | payment/change/remaining autoritativos | invalida resumen | opcional, ausente hoy | compat |
| `payment.tsx` | `useGetCurrentCashSession` | `GET /cash-sessions/current` | `getCurrentCashPaymentsSession` | auth | terminal → params | runtime nullable | conservar key legacy con terminal string | — | compat nullable |
| `payment.tsx` | métodos/splits/propina | métodos, splits, tip | operaciones generadas equivalentes | auth | renombrar `paymentId/orderId` internamente | equivalentes | keys URL existentes | — | compat |
| `payment.tsx` | función imperativa + `api.get` | machine start/poll/cancel | `start/get/cancelCashPaymentsMachinePayment` | roles pago | request equivalente | estados españoles y conciliación preservados | poll imperativo sin RQ | clave obligatoria estable por modal | compat |
| `cash-session.tsx` | 7 hooks | sesiones, movimiento, cierre, historial, reapertura | operaciones CashPayments equivalentes | manager/admin; reopen admin | nombres legacy adaptados | nullables explícitos | keys actuales preservadas | cierre opcional, ausente hoy | compat |
| `z-report.tsx` | Z + machine summary | report/summary | generated equivalents | manager/admin | id igual | DTOs nuevos equivalentes | key URL | — | compat |
| `x-report.tsx` | X report | x-report | `getCashPaymentsSessionXReport` | manager/admin | id igual | X es subtipo de Z | key URL | — | compat |
| `prefactura.tsx` | payment summary | payment-summary | `getOrderCashPaymentSummary` | auth | igual | compatible | key URL | — | compat; resto excluido |
| `ticket.tsx` | ticket | ticket | `getOrderCashPaymentTicket` | auth | igual | compatible | key URL | — | compat; Documents excluido |
| `caja-automatica.tsx` | config/update/test | admin cash-machine | generated equivalents | admin | test legacy vacío → sin body | config segura sin secreto | keys URL/refetch | — | compat |
| `caja-automatica-estado.tsx` | status/config/levels | admin cash-machine | generated equivalents | manager/admin | igual | equivalente | intervalos conservados | — | compat |
| `informes.tsx` | dos `useQuery` con HTTP manual | reports payments/cash | generated report hooks | manager/admin | `{from,to}` | arrays tipados reales | conservar keys semánticas `reports/*` | — | compat |
| `DirectorCaja.tsx` | `fetch /director/cash` | excluido phase61 | — | manager/admin | — | DTO Director | propia | — | excluir |

## Decisiones de seguridad

- No se añade idempotencia a pago ordinario ni cierre: el contrato la marca opcional y los consumidores no implementan hoy recuperación/reintento.
- El cobro físico conserva una sola clave por montaje del modal y la reutiliza durante el mismo comando.
- La compat exige clave explícita para start/refund físico; nunca genera una clave silenciosa.
- No se cambia la secuencia de pagos mixtos: continúa estrictamente secuencial y se detiene en el primer error.
- No se normaliza `completed` a `completada` en datos persistidos; únicamente se conserva la presentación existente.
- Void, refund, reconcile y ledger se exportan, pero no se crea UI inexistente.
- El simulador continúa identificado y las respuestas 409/422/503 se propagan.

## Riesgos preexistentes no corregidos

- Apertura de caja sin lock transaccional completo.
- Void administrativo sin advisory lock.
- Splits protegidos por autenticación, sin RBAC específico de router.
- Reapertura del modal tras un timeout ambiguo de inicio físico crea un intento nuevo, igual que antes.
- No existe adaptador de hardware productivo.
