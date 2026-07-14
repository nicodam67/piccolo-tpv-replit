# Piccolo TPV — Entrega 4 Completada

## Variables de entorno
Ninguna nueva. Sigue usando únicamente `SESSION_SECRET` para JWT.

## Archivos modificados / creados

### Base de datos
- `004_cobros_caja_tickets.sql` — ejecutada: CREATE TABLE payment_methods, cash_sessions, payments, tickets, cash_movements + índices + 3 métodos de pago

### Drizzle Schema
- `lib/db/src/schema/payments.ts` — nuevo: paymentMethodsTable, cashSessionsTable, paymentsTable, ticketsTable, cashMovementsTable
- `lib/db/src/schema/index.ts` — añadido export `./payments`

### OpenAPI / Codegen
- `lib/api-spec/openapi.yaml` — 8 nuevos endpoints y 11 nuevos schemas (CashSession, PaymentMethod, CashMovement, PaymentSummary, PaymentResult, TicketData, etc.)
- `lib/api-client-react/src/generated/api.ts` — regenerado
- `lib/api-zod/src/generated/api.ts` — regenerado

### Backend (api-server)
- `artifacts/api-server/src/routes/cash.ts` — nuevo:
  - `POST /cash-sessions/open` — abre sesión (rechaza si ya hay una abierta)
  - `GET /cash-sessions/current` — devuelve sesión abierta o null
  - `POST /cash-sessions/:id/movements` — entrada/salida con motivo obligatorio
  - `POST /cash-sessions/:id/close` — cierra con efectivo contado, calcula diferencia
  - `GET /cash-sessions/:id/summary` — desglose por método + historial de movimientos
- `artifacts/api-server/src/routes/payments.ts` — nuevo:
  - `GET /orders/:id/payment-summary` — subtotal, IVA 10%, total, pagado, pendiente, métodos, pagos
  - `POST /orders/:id/payments` — cobro parcial o total; solo efectivo puede superar pendiente
    - Si pendiente → 0: crea ticket, pone pedido a 'paid', libera mesa, emite tables:refresh
  - `GET /orders/:id/ticket` — devuelve datos completos para imprimir ticket
- `artifacts/api-server/src/routes/index.ts` — registra cashRouter y paymentsRouter

### Frontend (piccolo-tpv)
- `artifacts/piccolo-tpv/src/App.tsx` — nuevas rutas: `/cobro/:orderId`, `/caja`, `/ticket/:orderId`
- `artifacts/piccolo-tpv/src/pages/order.tsx` — botón "Cobrar" verde debajo de "Enviar Comanda"; visible cuando hay ítems no-borrador y el pedido no está pagado
- `artifacts/piccolo-tpv/src/pages/payment.tsx` — pantalla de cobro bicolumna:
  - Panel izquierdo: resumen del pedido (líneas, subtotal, IVA 10%, total, pagado, pendiente)
  - Panel derecho: 3 métodos de pago (Efectivo/Tarjeta/Bizum), teclado numérico con accesos rápidos (Resto/5€/10€/20€/50€), validación por método, cambio automático en efectivo, diálogo de confirmación, lista de pagos parciales ya realizados
- `artifacts/piccolo-tpv/src/pages/cash-session.tsx` — gestión completa de caja:
  - Apertura con fondo inicial
  - Registro de entradas/salidas con motivo
  - Resumen de ventas por método en tiempo real
  - Cierre con comparación efectivo esperado vs contado y diferencia
- `artifacts/piccolo-tpv/src/pages/ticket.tsx` — vista dual:
  - Pantalla: preview de recibo oscuro con botones Imprimir y Correo (pendiente, placeholder Verifactu)
  - Impresión: layout 80mm monoespaciado con @media print, nombre del restaurante, mesa, camarero, líneas, subtotal, IVA, total, pagos, pie de página

## Reglas de negocio implementadas
- IVA al 10% tipo reducido (precio con IVA incluido); tax = total × 10/110
- Todas las operaciones financieras en transacciones SQL (Drizzle tx)
- Doble cobro bloqueado: `order.status === 'paid'` → 409
- Solo efectivo puede superar el pendiente (para dar cambio)
- Tarjeta y Bizum rechazados si importe > pendiente
- Pedido se cierra SOLO cuando pendiente = 0
- Mesa se libera automáticamente al cerrar pedido
- Ticket emitido una vez por pedido (UNIQUE constraint en orders.id)
- Nunca se borra un pago: status → cancelled para anulaciones futuras
- Código preparado para Verifactu: botón "Enviar por correo" visible pero deshabilitado con tooltip

## Prueba de aceptación
1. Abrir caja con 100 € → ✓
2. Abrir mesa, tomar comanda, enviar → ✓
3. Cobrar parcial en tarjeta (ej. 10 €) → pendiente actualizado ✓
4. Cobrar resto en efectivo con billete de 20 € → cambio mostrado ✓
5. Ticket emitido, mesa libre ✓
6. Registrar salida de caja "Pago a proveedor 15 €" → ✓
7. Cerrar caja → diferencia calculada ✓
8. Recargar → todos los datos persisten en BD ✓
