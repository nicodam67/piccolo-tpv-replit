# Idempotencia de operaciones críticas

## Middleware HTTP

Las rutas críticas aceptan `Idempotency-Key`:

- envío de comanda;
- cobro;
- cierre de caja;
- fichaje.

La clave se limita y se vincula al usuario. El middleware:

1. consulta memoria;
2. adquiere un advisory lock PostgreSQL por clave;
3. consulta `idempotency_keys`;
4. ejecuta una única petición;
5. persiste la respuesta 2xx antes de enviarla y liberar el lock;
6. devuelve la misma respuesta con `Idempotency-Replayed: true`.

Si PostgreSQL no puede garantizar el lock o la persistencia, falla cerrado.
La migración `0025_idempotency_keys.sql` es la única creadora de la tabla.

## Envío de comandas

El TPV genera una clave UUID al abrir el intento. Los reintentos conservan esa
clave; solo cambia tras éxito.

El servidor serializa además por pedido mediante
`pg_advisory_xact_lock(hashtext('order-send:' || orderId))`. Bajo ese lock vuelve
a leer las líneas draft. En una sola transacción:

- crea `kitchen_tasks`;
- marca líneas y pedido como enviados;
- calcula receta;
- crea movimientos de venta;
- descuenta stock.
- persiste en `idempotency_keys` la respuesta exacta que devolverá la ruta.

Restricciones:

- `UNIQUE kitchen_tasks(order_item_id)`;
- índice único parcial de movimiento `sale` por
  `(order_item_id, ingredient_id, movement_type)`.

El movimiento se inserta antes de descontar stock; si ya existe, no vuelve a
descontar. Cualquier error revierte comanda, KDS y stock.

## KDS

Una línea genera como máximo una tarea. Reenviar reutiliza esa misma fila y
restablece su estado. La máquina de estados rechaza transiciones inválidas; las
tareas finalizadas o canceladas no regresan a vistas activas.

## Evidencia

- Middleware: `artifacts/api-server/src/middlewares/idempotency.ts`
- Envío: `artifacts/api-server/src/routes/orders.ts`
- Esquema: `order-items.ts`, `stock.ts`, `idempotency-keys.ts`
- Migraciones: `0024_send_idempotency.sql`, `0025_idempotency_keys.sql`
- Pruebas: `concurrency.test.ts`, `kds.test.ts`
