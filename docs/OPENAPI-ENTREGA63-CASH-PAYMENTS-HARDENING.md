# Entrega 63 — Endurecimiento Cash & Payments

## Alcance

Se cerraron cuatro riesgos de las Entregas 61/62 sin cambiar importes, estados, cálculos, secuencia de pagos, conciliación ni transiciones de pedidos/mesas. No se creó ninguna migración.

## Evidencia previa

Prueba: `cash-payments-concurrency.integration.test.ts`, PostgreSQL 16 real, solicitudes HTTP concurrentes y conexiones backend separadas.

| Riesgo | Resultado previo |
|---|---|
| Apertura simultánea, mismo terminal | `201 + 201`; dos checks observaron `existing=false`; dos sesiones abiertas |
| Void simultáneo, claves distintas | `201 + 201`; dos voids y dos contramovimientos |
| Void simultáneo, misma clave | dos respuestas `201` con IDs distintos; no existía middleware idempotente |
| POST split como waiter/kitchen | alcanzaba handler (`404` del pedido inexistente), no `403` |
| Modal físico remount | `useRef(crypto.randomUUID())` pertenecía al montaje; reapertura generaba otra clave |

Los triggers de prueba introducen `pg_sleep(0.5)` únicamente para ampliar la carrera y registran `pg_backend_pid()`. Se crean y eliminan dentro de la suite; no forman parte del esquema productivo.

## Apertura de caja

El recurso protegido es el terminal exacto, porque:

- la consulta existente define unicidad funcional por `status=open + terminalName`;
- el consumidor selecciona `cashTerminal`;
- los pagos buscan la sesión abierta por terminal.

La apertura ahora ejecuta bajo una transacción:

1. `pg_advisory_xact_lock(hashtext('cash-session:' + terminalName))`;
2. relectura de sesión abierta;
3. inserción únicamente si no existe.

La reapertura usa la misma granularidad y además bloquea la fila de sesión con `FOR UPDATE`, evitando una carrera apertura/reapertura.

Resultado posterior: una respuesta `201`, una `409`, una sesión y una auditoría.

## Void administrativo

El recurso protegido es `paymentId`, materializado mediante `SELECT ... FOR UPDATE` dentro de la transacción.

Dentro de la misma transacción se realizan:

- relectura y validación `completed`/`voided`;
- actualización a `voided`;
- contramovimiento de efectivo cuando corresponde;
- inserción en `payment_voids`;
- inserción de auditoría.

Se añadió el middleware idempotente existente:

- misma `Idempotency-Key`: replay del mismo `201` y mismo ID;
- claves distintas concurrentes: `201 + 409`;
- un void, un movimiento y una auditoría.

## RBAC de splits

No se creó un sistema paralelo.

| Endpoint | Protección | Roles por defecto |
|---|---|---|
| `GET /orders/:id/splits` | `requireAuth` | cualquier autenticado; conserva lectura operativa |
| `POST /orders/:id/splits` | `payments.split` | admin, manager, encargado, cashier |
| `PUT /orders/:id/splits/:groupId/pay` | `payments.create` | admin, manager, encargado, waiter, cashier |

`payments.split` ya existía en el catálogo administrativo. Se incorporó al catálogo runtime y al espejo frontend; la tabla `role_permissions` existente permite grants/denials sin migración.

La UI muestra “Dividir” únicamente cuando el rol tiene `payments.split`. Un waiter conserva lectura y puede completar una parte ya creada, pero no crear una división. Kitchen puede leer el estado, pero no mutarlo.

## Recuperación del comando físico

El comando pendiente se guarda en `localStorage`, no como estado financiero autoritativo, sino como referencia de recuperación compartida entre pestañas.

Huella versionada:

- tipo `cash-machine-payment`;
- `orderId`;
- importe formateado;
- método `cash_machine`;
- terminal.

Registro:

- clave opaca;
- huella;
- transactionId cuando existe;
- timestamps y expiración de 24 horas, igual al backend.

Reglas:

- misma huella: reutiliza clave y hace replay o continúa polling;
- misma orden con huella distinta pendiente: bloquea el nuevo POST;
- otra orden: nueva clave;
- resultado definitivo (`completada`, `cancelada`, `tiempo_agotado`, `error`): limpia;
- timeout HTTP, `503`, intervención manual o conciliación pendiente: conserva;
- si existe `transactionId`, la reapertura solo consulta; no repite el start;
- no hay retry automático.

La clave completa no se registra ni se muestra.

## OpenAPI

Se mantuvo `phase61-cash-payments` y se actualizaron únicamente cambios reales:

- void con idempotencia opcional y replay;
- `403` y roles efectivos en mutaciones split.

El cliente `cash-payments-generated` se regenera desde los fragmentos fuente. No existe edición manual de generated.

## Riesgos residuales

- Los advisory locks usan `hashtext`, consistente con los locks existentes del proyecto.
- `localStorage` reduce colisiones entre pestañas; PostgreSQL y los guards de cash-machine siguen siendo la autoridad ante una carrera simultánea extrema.
- La lectura de splits permanece disponible para cualquier sesión autenticada por compatibilidad operativa.
