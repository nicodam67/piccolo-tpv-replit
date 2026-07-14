# Piccolo TPV — Entrega 2 Completada

## Archivos modificados / creados

### Base de datos
- `database/migrations/002_comandas_kds.sql` — ejecutada (tablas: categories, products, order_items, kitchen_tasks; ALTER TABLE orders ADD COLUMN sent_at)
- `lib/db/src/schema/categories.ts` — nuevo: categoriesTable, productsTable
- `lib/db/src/schema/order-items.ts` — nuevo: orderItemsTable, kitchenTasksTable
- `lib/db/src/schema/orders.ts` — actualizado: campo sentAt añadido
- `lib/db/src/schema/index.ts` — actualizado: re-exports de los nuevos schemas

### OpenAPI / Codegen
- `lib/api-spec/openapi.yaml` — ampliado con 9 nuevos endpoints y sus schemas
- `lib/api-client-react/src/generated/api.ts` — regenerado (hooks nuevos)
- `lib/api-zod/src/generated/api.ts` — regenerado (schemas Zod nuevos)

### Backend (api-server)
- `artifacts/api-server/src/index.ts` — actualizado: HTTP server + Socket.io init
- `artifacts/api-server/src/lib/socket.ts` — nuevo: initSocket / getIO
- `artifacts/api-server/src/routes/categories.ts` — nuevo: GET /categories, GET /categories/:id/products
- `artifacts/api-server/src/routes/orders.ts` — nuevo: GET /tables/:id/order, POST /orders/:id/items, DELETE /order-items/:id, POST /orders/:id/send, POST /orders/:id/pase
- `artifacts/api-server/src/routes/kds.ts` — nuevo: GET /kds/:zone, PATCH /kitchen-tasks/:id/status
- `artifacts/api-server/src/routes/tables.ts` — actualizado: POST /tables/:id/open ahora devuelve {table, order} y crea el pedido en transacción
- `artifacts/api-server/src/routes/index.ts` — actualizado: registra los nuevos routers

### Frontend (piccolo-tpv)
- `artifacts/piccolo-tpv/src/App.tsx` — añadidas rutas /pedido/:tableId/:orderId y /kds/:zone
- `artifacts/piccolo-tpv/src/pages/tables.tsx` — actualizado: tap en mesa libre → abre mesa y navega a /pedido; tap en mesa ocupada → navega a /pedido/current
- `artifacts/piccolo-tpv/src/pages/order.tsx` — nuevo: pantalla de toma de comanda con categorías, productos, ticket y envío
- `artifacts/piccolo-tpv/src/pages/kds.tsx` — nuevo: KDS por zona (cocina/pizza/ensalada/barra) y KDS de Pase

## Prueba realizada
1. Login Admin PIN 1234 ✓
2. Apertura de Mesa → crea pedido activo y navega a pantalla de comanda ✓
3. Categorías y productos cargados desde BD (Pizzas, Cocina, Ensaladas, Bebidas) ✓
4. Añadir artículos al ticket (draft), eliminar artículos draft ✓
5. Enviar comanda → crea kitchen_tasks por línea y emite kds:refresh ✓
6. KDS Cocina/Pizza/Ensalada/Barra reciben las tareas en tiempo real ✓
7. Botón Preparar (new→preparing) y Listo (preparing→ready) en KDS ✓
8. KDS Pase agrupa por pedido, muestra progreso, MESA COMPLETA cuando todo listo ✓
9. Recogido y Servido en Pase → marca pedido served y libera mesa ✓
10. Socket.io emite waiter:order-ready al camarero cuando el pedido está completo ✓

## Limitaciones pendientes (Entrega 3)
- Modificadores, observaciones y alérgenos no implementados
- División de cuenta y cobro (Verifactu) pendiente
- Notificación de audio en tablet requiere interacción previa del usuario (limitación del navegador)
- El cierre manual de mesa (desde plano) no cancela el pedido activo; pendiente lógica de cancelación
