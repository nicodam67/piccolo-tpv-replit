# Piccolo TPV — Entrega 3 Completada

## Variables de entorno
- `SESSION_SECRET` — único secreto necesario, se usa como clave JWT. Ya configurado en la entrega anterior.
- No se ha añadido ninguna nueva variable de entorno.

## Archivos modificados / creados

### Base de datos
- `003_tablets_modificadores_alergenos.sql` — ejecutada: ALTER TABLE order_items (notes, allergy_note, has_allergy); CREATE TABLE modifier_groups, modifiers, product_modifier_groups, order_item_modifiers, waiter_notifications

### Drizzle Schema
- `lib/db/src/schema/order-items.ts` — añadidos campos allergyNote, hasAllergy; kitchenTasksTable también lleva allergyNote/hasAllergy
- `lib/db/src/schema/modifiers.ts` — nuevo: modifierGroupsTable, modifiersTable, productModifierGroupsTable
- `lib/db/src/schema/order-item-modifiers.ts` — nuevo: orderItemModifiersTable
- `lib/db/src/schema/notifications.ts` — nuevo: waiterNotificationsTable
- `lib/db/src/schema/index.ts` — actualizado: re-exports de todos los nuevos schemas

### OpenAPI / Codegen
- `lib/api-spec/openapi.yaml` — 4 nuevos endpoints y schemas: ModifierGroup, ModifierOption, OrderItemModifier, UpdateOrderItemDetailsInput, WaiterNotification; OrderItem y KitchenTask ampliados con allergy + modifiers
- `lib/api-client-react/src/generated/api.ts` — regenerado
- `lib/api-zod/src/generated/api.ts` — regenerado

### Backend (api-server)
- `artifacts/api-server/src/routes/modifiers.ts` — nuevo: GET /products/:id/modifiers, PATCH /order-items/:id/details
- `artifacts/api-server/src/routes/notifications.ts` — nuevo: GET /notifications/unread, PATCH /notifications/:id/read
- `artifacts/api-server/src/routes/orders.ts` — GET /tables/:id/order devuelve items con modifiers; POST /orders/:id/send propaga allergyNote/hasAllergy a kitchen_tasks
- `artifacts/api-server/src/routes/kds.ts` — incluye allergyNote/hasAllergy/employeeId en el select; PATCH kitchen-tasks/status crea waiter_notification en BD y emite waiter:<employeeId>:notification
- `artifacts/api-server/src/routes/index.ts` — registra modifiersRouter y notificationsRouter

### Frontend (piccolo-tpv)
- `artifacts/piccolo-tpv/src/components/EditItemModal.tsx` — nuevo: modal con grupos de modificadores (radio/checkbox), observaciones libres, sección de alergia con toggle e input
- `artifacts/piccolo-tpv/src/pages/order.tsx` — botón Editar en cada línea del ticket, badges ALERGIA en rojo, tags de modificadores, campana de notificaciones con contador de no leídas, banner de alerta "Mesa X lista" con vibración
- `artifacts/piccolo-tpv/src/pages/kds.tsx` — banda roja ALERGIA pulsante en tarjetas de zona KDS; badge ALERGIA en PaseView con allergyNote

## Errores corregidos
- `EditItemModal.tsx`: `group.options` → `group.modifiers` (nombre correcto de la propiedad en el schema OpenAPI)
- `EditItemModal.tsx`: `queryKey` añadido a las opciones de `useGetProductModifiers` (requerido por orval v8)
- `kds.tsx`: zona tipada como `KdsZone` literal union para compatibilidad con el hook generado (heredado de Entrega 2)

## Datos de prueba cargados
- Grupo "Punto de cocción" con 5 opciones → vinculado a Entrecot al punto
- Grupo "Extras pizza" con 5 opciones (extra queso +1.50€, sin cebolla, sin gluten +2€, extra jamón +1.50€, picante) → vinculado a todas las pizzas
- Grupo "Tipo de pasta" → vinculado a Pasta carbonara y Lasaña

## Flujo completo probado
1. Login Admin 1234 ✓
2. Abrir Mesa 1 → pantalla de comanda ✓
3. Añadir Pizza Diavola → Editar → seleccionar "Extra queso" + "Sin cebolla" ✓
4. Añadir Entrecot al punto → Editar → seleccionar punto "Al punto" ✓
5. Añadir Coca-Cola → Editar → activar alergia "Alergia grave a frutos secos" ✓
6. Enviar comanda → kitchen_tasks creadas con allergyNote propagado ✓
7. Ver modificadores en KDS Pizza (Extra queso, Sin cebolla) ✓
8. Ver banda roja ALERGIA en KDS Barra (Coca-Cola) ✓
9. Marcar todos preparando y listos → waiter_notification creada en BD, socket emitido ✓
10. Banner "Mesa 1 lista para recoger" + vibración en tablet ✓
11. Campana con contador de no leídas, marcar leída ✓
12. KDS Pase → MESA COMPLETA → Recogido → Servido → mesa libre ✓
