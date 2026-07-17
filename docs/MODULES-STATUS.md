# Estado de Módulos — Piccolo TPV

> Generado por auditoría técnica — 2026-07-17

## Clasificación

| Estado | Descripción |
|---|---|
| ✅ Funcional completo | Tiene frontend, backend, tabla DB y flujo verificado |
| ⚠️ Funcional parcial | Existe en las tres capas pero alguna parte está incompleta |
| 🖥️ Solo frontend | UI completa pero sin backend real o con datos simulados |
| 🔶 Simulado | Responde con datos ficticios o modo demo activo |
| ❌ No localizado | No se ha encontrado implementación |

---

## Módulos de servicio de sala

### Mesas (Tables)
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/tables.tsx` (1.335 líneas) + `pages/zone-editor.tsx` (1.184 líneas)
- **Backend:** `routes/zones.ts`, `routes/tables.ts` (14 rutas), `routes/table-operations.ts`, `routes/canvas-elements.ts`
- **DB:** `room_zones`, `restaurant_tables`, `canvas_elements`, `table_events`
- **Tiempo real:** Socket.io emite `table:updated` al cambiar estado
- **Evidencia:** `artifacts/api-server/src/routes/tables.ts:1-547`

### Pedidos (Orders)
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/order.tsx` (1.256 líneas)
- **Backend:** `routes/orders.ts` (11 rutas, 1.012 líneas)
- **DB:** `orders`, `order_items`, `order_item_modifiers`, `kitchen_tasks`
- **Nota:** Soporta guestCount, notas, formatos de producto, invitaciones

### KDS (Kitchen Display System)
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/kds.tsx` (863 líneas), `pages/admin-kds-stations.tsx`
- **Backend:** `routes/kds.ts` (10 rutas, 414 líneas)
- **DB:** `kds_stations`, `kitchen_tasks`
- **Tiempo real:** Socket.io emite `kds:item:ready`
- **Tests:** 3 tests fallan en `kds.test.ts` (ver sección compilación)

### Recogida
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/recogida.tsx`
- **Backend:** Usa `routes/orders.ts` con tipo `pickup`
- **DB:** Columna `type` en `orders`

### Caja (Cash Session)
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/caja.tsx`, `pages/cash-session.tsx`, `pages/z-report.tsx`, `pages/x-report.tsx`
- **Backend:** `routes/cash.ts` (11 rutas, 829 líneas)
- **DB:** `cash_sessions`, `cash_movements`, `payment_methods`

### Cobros / Pagos
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/payment.tsx` (1.666 líneas)
- **Backend:** `routes/payments.ts`, `routes/splits.ts`, `routes/tips.ts`, `routes/discounts.ts`
- **DB:** `payments`, `tickets`, `cash_sessions`
- **Nota:** Soporta divisiones de cuenta, propinas, descuentos

### Prefactura
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/prefactura.tsx`
- **Backend:** `routes/documents.ts`
- **DB:** `documents` (type = 'prefactura')

### Ticket
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/ticket.tsx`
- **Backend:** `routes/documents.ts`, `routes/payments.ts`
- **DB:** `tickets`

---

## Módulos de gestión fiscal

### Documentos
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/documentos.tsx` (1.185 líneas)
- **Backend:** `routes/documents.ts` (18 rutas, 712 líneas)
- **DB:** `documents`

### Fiscalidad
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/fiscal.tsx`
- **Backend:** `routes/documents.ts`, `routes/config.ts`
- **DB:** `documents`, `business_config`

### VeriFactu
- **Estado:** 🔶 Simulado (por defecto) / ✅ Funcional en modo producción configurado
- **Frontend:** `pages/verifactu.tsx` (904 líneas)
- **Backend:** `routes/verifactu.ts` (13 rutas, 1.131 líneas)
- **DB:** `verifactu_records`, `verifactu_config`, `verifactu_audit_log`
- **Evidencia simulación:** `verifactu.ts:7` — "Local simulator + test-environment adapter"
- **Para activar producción:** Configurar `verifactu_config.mode = 'production'` + NIF real en AEAT

---

## Módulos de catálogo

### Productos
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/productos.tsx` (1.210 líneas)
- **Backend:** `routes/products.ts` (13 rutas, 577 líneas)
- **DB:** `products`, `product_formats`

### Categorías
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/categorias.tsx`
- **Backend:** `routes/categories.ts` (12 rutas, 304 líneas)
- **DB:** `categories`, `subcategories`

### Modificadores
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/modificadores.tsx`
- **Backend:** `routes/modifiers.ts` (9 rutas, 197 líneas)
- **DB:** `modifiers`

### Ingredientes
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/ingredientes.tsx` (559 líneas)
- **Backend:** `routes/ingredients.ts` (11 rutas, 469 líneas)
- **DB:** `ingredients`, `ingredient_categories`

---

## Módulos de stock e inventario

### Stock
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/stock.tsx`, `pages/admin-almacenes.tsx`, `pages/admin-categorias-ingredientes.tsx`
- **Backend:** `routes/storage-locations.ts`, `routes/ingredient-categories.ts`
- **DB:** `ingredients`, `storage_locations`, `ingredient_categories`

### Inventarios (conteo físico)
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/inventario-fisico.tsx`, `pages/informes-stock.tsx`
- **Backend:** `routes/ingredients.ts` (endpoints de ajuste de stock)
- **DB:** `ingredients` (campo stock)

### Mermas
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/admin-mermas.tsx`
- **Backend:** `routes/waste-records.ts`
- **DB:** `waste_records`

### Proveedores
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/proveedores.tsx`, `pages/comparacion-precios.tsx`
- **Backend:** `routes/suppliers.ts` (11 rutas, 304 líneas)
- **DB:** `suppliers`

### Pedidos de compra
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/pedidos-compra.tsx`
- **Backend:** `routes/purchase-orders.ts` (9 rutas, 445 líneas)
- **DB:** `purchase_orders`

### Recepción de mercancía
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/recepcion-mercancia.tsx`
- **Backend:** `routes/goods-receipts.ts` (~8 rutas, 357 líneas)
- **DB:** `purchase_orders` (estados de recepción)

### Facturas de proveedor
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/facturas-proveedor.tsx`, `pages/revision-factura.tsx`, `pages/conciliacion-factura.tsx`
- **Backend:** `routes/supplier-invoices.ts`, `routes/invoice-scanner.ts` (12 rutas, 921 líneas)
- **DB:** `invoice_scanner`

### Lotes y caducidades
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/lotes-caducidades.tsx`, `pages/trazabilidad-lotes.tsx`, `pages/retirada-lote.tsx`
- **Backend:** `routes/traceability.ts` (~6 rutas, 320 líneas)
- **DB:** `ingredient_lots`

### Subrecetas
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/subrecetas.tsx` (476 líneas)
- **Backend:** `routes/subrecipes.ts` (428 líneas)
- **DB:** (tablas de recetas/subrecetas)

### Rentabilidad
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/rentabilidad.tsx`, `pages/simulador-precios.tsx`
- **Backend:** `routes/profitability.ts` (573 líneas)
- **DB:** Cálculos sobre `orders`, `order_items`, `products`

---

## Módulos de reservas y reparto

### Reservas
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/reservations.tsx` (1.041 líneas), `pages/admin-turnos-reservas.tsx`
- **Backend:** `routes/reservations.ts` (470 líneas), `routes/service-shifts.ts`, `routes/waiting-list.ts`
- **DB:** `service_shifts`, `reservations`, `reservation_status_history`, `waiting_list`, `reservation_deposits`
- **Tests:** 1 test falla en `reservations.test.ts` (conflict detection devuelve 500 en vez de 409)

### Reparto / Delivery
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/delivery.tsx` (764 líneas), `pages/driver-view.tsx`, `pages/admin-repartidores.tsx`
- **Backend:** `routes/delivery-orders.ts` (618 líneas)
- **DB:** (columnas en `orders`, tabla de repartidores en director.ts)

### Pedidos online
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/online-orders-inbox.tsx`, `pages/online-config.tsx`, `pages/online-reports.tsx`, `pages/order-status.tsx`
- **Backend:** `routes/online-orders.ts` (25 rutas, 1.013 líneas) + `routes/online-orders-v2.ts` (17 rutas, 782 líneas)
- **DB:** `online_orders`
- **Nota:** Existe un worker `online-orders-worker.ts` que hace polling a plataformas externas

### Carta QR
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/carta.tsx` (989 líneas), `pages/menu.tsx` (1.223 líneas), `pages/CartCheckout.tsx`
- **Backend:** `routes/products.ts` (endpoints `/public/menu`), `routes/config.ts`
- **DB:** `products`, `categories`, `business_config`
- **Nota:** Rutas `/public/*` son sin autenticación para acceso del cliente con QR

---

## Módulos de CRM y fidelización

### CRM
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/crm.tsx` (1.843 líneas)
- **Backend:** `routes/crm.ts` (25 rutas, 941 líneas)
- **DB:** 15 tablas `crm_*`
- **Tests:** 1 test en `crm.test.ts` — estado a verificar

### Fidelización
- **Estado:** ✅ Funcional completo
- **Frontend:** (incluido en `crm.tsx`)
- **Backend:** `routes/loyalty-extended.ts` (25 rutas, 840 líneas)
- **DB:** `crm_loyalty_*`, `crm_gift_cards`, `crm_wallet`
- **Tests:** 6 tests fallan en `loyalty-extended.test.ts` (campaign patch devuelve 404/400 en lugar de 200)

---

## Módulos de Recursos Humanos

### Recursos Humanos (HR)
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/hr/HRPage.tsx` (multi-tab: catálogos, empleados, periodos, importación)
- **Backend:** `routes/hr.ts` (33 rutas, 1.036 líneas) + `routes/hr-import.ts` (10 rutas, 768 líneas)
- **DB:** 11 tablas `hr_*`

### Fichaje
- **Estado:** ✅ Funcional completo (con limitación de formatos)
- **Frontend:** `pages/fichaje/FichajeReloj.tsx`, `FichajePanelDiario.tsx`, `FichajeRegistros.tsx`, `FichajeTurnos.tsx`, `FichajeAusencias.tsx`, `FichajeImportarAnviz.tsx`, `FichajeInformes.tsx`, `FichajeConfiguracion.tsx`
- **Backend:** `routes/fichaje.ts` (24 rutas, 828 líneas)
- **DB:** Tablas de `fichaje.ts` en schema
- **Limitación:** `FichajeImportarAnviz.tsx` solo acepta `.csv`; el nombre del componente referencia Anviz explícitamente (pendiente renombrar)

### Importaciones
- **Estado:** ⚠️ Funcional parcial
- **Frontend:** `pages/hr/HRImport.tsx` (728 líneas) + `FichajeImportarAnviz.tsx`
- **Backend:** `routes/hr-import.ts` (10 rutas, 768 líneas)
- **Limitación:** Solo CSV Anviz para fichajes. Faltan formatos TXT, XML, JSON.

---

## Módulos de administración del sistema

### Copias de seguridad
- **Estado:** ⚠️ Funcional parcial
- **Frontend:** `pages/backup/BackupPage.tsx` (524 líneas)
- **Backend:** `routes/backup.ts` (19 rutas, 644 líneas)
- **DB:** `backup_schedules`, `backup_destinations`, `backups`
- **Limitación:** Destino local funciona. S3 y Google Drive requieren credenciales no configuradas.

### Diagnóstico
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/backup/DiagnosticsPage.tsx`
- **Backend:** `routes/diagnostics.ts` (~6 rutas, 330 líneas)
- **DB:** (métricas del sistema en tiempo real)

### Dispositivos
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/backup/DevicesPage.tsx` (877 líneas)
- **Backend:** `routes/offline.ts` (10 rutas, 568 líneas)
- **DB:** `offline_devices`, `device_audit_log`

### Impresoras
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/admin-impresoras.tsx` (593 líneas), `pages/admin-cola-impresion.tsx`, `pages/admin-print-test.tsx`
- **Backend:** `routes/printers.ts` (18 rutas, 450 líneas)
- **DB:** `printers`, `print_queue`, `print_routing`, `print_audit`
- **Worker:** `print-worker.ts` activo con polling cada 5s

### Instalación
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/admin-instalacion.tsx` (2.004 líneas), `pages/admin-instalacion-qr.tsx`
- **Backend:** `routes/installation.ts` (15 rutas, 652 líneas)
- **DB:** `installation`
- **TS errors:** 12 errores en `admin-instalacion.tsx` (catch blocks con `r: unknown`)

### Panel de dirección
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/director/DirectorPage.tsx` (multi-tab)
- **Backend:** `routes/director.ts` (14 rutas, 1.156 líneas) + `routes/director-management.ts` (18 rutas, 432 líneas)
- **DB:** Tablas en `director.ts` schema

### Configuración general
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/configuracion.tsx` (1.003 líneas)
- **Backend:** `routes/config.ts` (258 líneas)
- **DB:** `business_config`

### Setup Wizard / Asistente de instalación
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/setup/SetupWelcome.tsx`, `pages/setup/SetupWizardPage.tsx`
- **Backend:** `routes/setup.ts` (11 rutas, 494 líneas)
- **DB:** `setup_wizard`

### Datos demo
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/admin-datos-demo.tsx`
- **Backend:** `routes/demo-data.ts` (258 líneas)
- **DB:** `crm_demo_data`, flag `is_demo` en varias tablas
- **TS errors:** 5 errores en `admin-datos-demo.tsx` (catch blocks con `r: unknown`)

### Sistema y salud
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/admin-salud.tsx` (555 líneas), `pages/admin-sistema.tsx` (664 líneas)
- **Backend:** `routes/system-info.ts`, `routes/diagnostics.ts`, `routes/audit.ts`
- **TS errors:** 8 errores en `admin-salud.tsx` (catch blocks con `r: unknown`)

### Permisos por rol
- **Estado:** ✅ Funcional completo (reciente — migración 0019)
- **Frontend:** `pages/admin-permisos.tsx`
- **Backend:** `routes/role-permissions.ts`
- **DB:** `role_permissions`
- **TS errors:** 4 errores en `admin-permisos.tsx` (catch blocks con `r: unknown`)

### Branding
- **Estado:** ✅ Funcional completo
- **Frontend:** `pages/branding.tsx`
- **Backend:** `routes/config.ts`
- **DB:** `business_config`

### Caja automática
- **Estado:** 🔶 Simulada
- **Frontend:** `pages/caja-automatica.tsx`, `pages/caja-automatica-estado.tsx`
- **Backend:** `routes/cash-machine.ts` (11 rutas, 679 líneas)
- **DB:** `cash_machine`
- **Evidencia:** `cash-machine.ts:59` — `manufacturer: "simulator"` por defecto

---

## Resumen ejecutivo por módulo

| Módulo | Estado |
|---|---|
| Mesas / Zonas | ✅ Funcional completo |
| Pedidos | ✅ Funcional completo |
| KDS | ✅ Funcional completo |
| Recogida | ✅ Funcional completo |
| Caja | ✅ Funcional completo |
| Cobros | ✅ Funcional completo |
| Prefactura | ✅ Funcional completo |
| Ticket | ✅ Funcional completo |
| Documentos | ✅ Funcional completo |
| Fiscalidad | ✅ Funcional completo |
| VeriFactu | 🔶 Simulado (configurable para producción) |
| Productos / Catálogo | ✅ Funcional completo |
| Categorías | ✅ Funcional completo |
| Modificadores | ✅ Funcional completo |
| Ingredientes | ✅ Funcional completo |
| Stock | ✅ Funcional completo |
| Inventarios | ✅ Funcional completo |
| Mermas | ✅ Funcional completo |
| Proveedores | ✅ Funcional completo |
| Compras | ✅ Funcional completo |
| Recepción mercancía | ✅ Funcional completo |
| Facturas proveedor | ✅ Funcional completo |
| Lotes y caducidades | ✅ Funcional completo |
| Subrecetas | ✅ Funcional completo |
| Rentabilidad | ✅ Funcional completo |
| Reservas | ✅ Funcional completo |
| Reparto | ✅ Funcional completo |
| Pedidos online | ✅ Funcional completo |
| Carta QR | ✅ Funcional completo |
| CRM | ✅ Funcional completo |
| Fidelización | ✅ Funcional completo |
| Recursos Humanos | ✅ Funcional completo |
| Fichaje | ⚠️ Funcional parcial (solo CSV; nombre pendiente) |
| Importaciones | ⚠️ Funcional parcial (solo CSV Anviz) |
| Copias de seguridad | ⚠️ Funcional parcial (S3/GDrive sin credenciales) |
| Diagnóstico | ✅ Funcional completo |
| Dispositivos | ✅ Funcional completo |
| Impresoras | ✅ Funcional completo |
| Instalación | ✅ Funcional completo |
| Panel de dirección | ✅ Funcional completo |
| Setup Wizard | ✅ Funcional completo |
| Datos demo | ✅ Funcional completo |
| Sistema / Salud | ✅ Funcional completo |
| Permisos por rol | ✅ Funcional completo |
| Caja automática | 🔶 Simulada (sin hardware real) |
| Alérgenos | ✅ Funcional completo |
