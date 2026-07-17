# Inventario de Base de Datos — Piccolo TPV

> Generado por auditoría técnica — 2026-07-17

## Motor y configuración

| Parámetro | Valor |
|---|---|
| Motor | PostgreSQL (Replit managed) |
| ORM | Drizzle ORM |
| Driver | postgres.js |
| Config | `lib/db/drizzle.config.ts` |
| Variable de conexión | `DATABASE_URL` (obligatoria) |
| Aplicación de migraciones | `drizzle-kit push` (manual) |
| Baseline | Sin migración 0000 — el esquema base es implícito |

## Migraciones

| # | Archivo | Descripción | Down SQL |
|---|---|---|---|
| 0001 | `0001_carta_qr_branding.sql` | Carta QR, branding | ✅ |
| 0002 | `0002_online_orders.sql` | Pedidos online v1 | ✅ |
| 0003 | `0003_printers.sql` | Impresoras y cola de impresión | ✅ |
| 0004 | `0004_stock_module.sql` | Módulo de stock e ingredientes | ✅ |
| 0005 | `0005_reservations_v2.sql` | Reservas v2, turnos | ✅ |
| 0006 | `0006_delivery_v2.sql` | Reparto v2 | ✅ |
| 0007 | `0007_online_v2.sql` | Pedidos online v2 | ✅ |
| 0008 | `0008_crm_loyalty.sql` | CRM, fidelización | ✅ |
| 0009 | `0009_hr_module.sql` | RRHH, posiciones, departamentos | ✅ |
| 0010 | `0010_director_module.sql` | Panel de dirección | ✅ |
| 0011 | `0011_backup_offline.sql` | Backups, modo offline, dispositivos | ✅ |
| 0012 | `0012_setup_wizard.sql` | Asistente de instalación | ✅ |
| 0013 | `0013_audit_findings.sql` | Hallazgos de auditoría | ✅ |
| 0014 | `0014_installation.sql` | Módulo de instalación | ✅ |
| 0015 | `0015_is_demo_operational.sql` | Flags demo/operacional | ✅ |
| 0016 | `0016_device_hardware_fields.sql` | Campos hardware de dispositivos | ✅ |
| 0017 | `0017_kds_stations_print_test_prepzone.sql` | Estaciones KDS, zonas de preparación | ✅ |
| 0018 | `0018_manuals.sql` | Manuales de instalación | ✅ |
| 0019 | `0019_role_permissions.sql` | Permisos granulares por rol | ✅ |

---

## Inventario completo de tablas

### Usuarios y empleados

| Tabla | Schema | Columnas principales | FK |
|---|---|---|---|
| `employees` | `lib/db/src/schema/employees.ts` | id (UUID PK), name, role (admin/manager/waiter/cashier/kitchen/delivery), active | — |
| `employee_pins` | `lib/db/src/schema/employees.ts` | id, employeeId, pinHash | → employees |
| `role_permissions` | `lib/db/src/schema/role-permissions.ts` | id, role, moduleKey, canView, canEdit, canDelete, isOverride | — |

### Zonas y mesas

| Tabla | Schema | Columnas principales | FK |
|---|---|---|---|
| `room_zones` | `lib/db/src/schema/zones.ts` | id (UUID PK), name, color, emoji, sortOrder, active, activeLayout | — |
| `restaurant_tables` | `lib/db/src/schema/tables.ts` | id (UUID PK), zoneId, name, status, capacity, posX, posY, rotation, layout | → room_zones |
| `canvas_elements` | `lib/db/src/schema/canvas-elements.ts` | id, zoneId, type, posX, posY, width, height, label | → room_zones |
| `table_events` | `lib/db/src/schema/table-events.ts` | id, tableId, eventType, payload, createdAt | → restaurant_tables |

### Pedidos y líneas

| Tabla | Schema | Columnas principales | FK |
|---|---|---|---|
| `orders` | `lib/db/src/schema/orders.ts` | id, tableId, status, guestCount, notes, isDemo, createdAt | → restaurant_tables |
| `order_items` | `lib/db/src/schema/order-items.ts` | id, orderId, productId, quantity, unitPrice, notes, formatId, formatName, isInvitation, status | → orders, products |
| `order_item_modifiers` | `lib/db/src/schema/order-item-modifiers.ts` | id, orderItemId, modifierId, name, price | → order_items |
| `kitchen_tasks` | `lib/db/src/schema/orders.ts` | id, orderId, orderItemId, kdsStationId, status, createdAt | → orders |

### Pagos y caja

| Tabla | Schema | Columnas principales | FK |
|---|---|---|---|
| `payment_methods` | `lib/db/src/schema/payments.ts` | id, name, type (cash/card/other), active | — |
| `payments` | `lib/db/src/schema/payments.ts` | id, orderId, sessionId, amount, method, createdAt | → orders |
| `cash_sessions` | `lib/db/src/schema/payments.ts` | id, employeeId, openedAt, closedAt, openingBalance, closingBalance | → employees |
| `cash_movements` | `lib/db/src/schema/payments.ts` | id, sessionId, type, amount, reason | → cash_sessions |
| `tickets` | `lib/db/src/schema/payments.ts` | id, orderId, number, total, createdAt | → orders |

### Facturas y fiscalidad

| Tabla | Schema | Columnas principales | FK |
|---|---|---|---|
| `documents` | `lib/db/src/schema/documents.ts` | id, type (factura/ticket/prefactura), orderId, number, series, total | → orders |
| `verifactu_records` | `lib/db/src/schema/verifactu.ts` | id, invoiceId, hash, qrCode, status, sentAt | → documents |
| `verifactu_config` | `lib/db/src/schema/verifactu.ts` | id, nif, businessName, mode (simulator/production) | — |
| `verifactu_audit_log` | `lib/db/src/schema/verifactu.ts` | id, recordId, action, result, createdAt | → verifactu_records |

### Catálogo (productos / ingredientes)

| Tabla | Schema | Columnas principales | FK |
|---|---|---|---|
| `categories` | `lib/db/src/schema/categories.ts` | id, name, color, sortOrder, active | — |
| `subcategories` | `lib/db/src/schema/categories.ts` | id, categoryId, name | → categories |
| `products` | `lib/db/src/schema/categories.ts` | id, categoryId, name, price, iva, active, imageUrl | → categories |
| `product_formats` | `lib/db/src/schema/categories.ts` | id, productId, name, price | → products |
| `modifiers` | `lib/db/src/schema/modifiers.ts` | id, name, price, type | — |
| `ingredients` | `lib/db/src/schema/stock.ts` | id, categoryId, name, unit, costPerUnit, stock, minStock | → ingredient_categories |
| `ingredient_categories` | `lib/db/src/schema/stock.ts` | id, name | — |

### Alérgenos

| Tabla | Schema | Columnas principales |
|---|---|---|
| `allergens_catalog` | `lib/db/src/schema/allergens.ts` | id, name, code (EU 14) |
| `ingredient_allergens` | — | ingredientId, allergenId |
| `ingredient_allergen_versions` | — | Historial de cambios |
| `product_allergen_cache` | — | Caché calculada por producto |
| `product_allergen_overrides` | — | Sobreescrituras manuales |
| `table_guest_allergies` | — | Alergias de comensales |
| `allergy_override_log` | — | Auditoría de sobreescrituras |
| `kitchen_allergy_confirmations` | — | Confirmaciones en cocina |
| `ingredient_substitutions` | — | Sustituciones propuestas |
| `lot_blocks` | — | Bloqueos de lotes por alérgeno |
| `product_technical_sheets` | — | Fichas técnicas |
| `allergen_audit_log` | — | Log de auditoría de alérgenos |

### Stock y proveedores

| Tabla | Schema | Columnas principales | FK |
|---|---|---|---|
| `storage_locations` | `lib/db/src/schema/stock.ts` | id, name, type | — |
| `waste_records` | `lib/db/src/schema/stock.ts` | id, ingredientId, quantity, reason, createdAt | → ingredients |
| `suppliers` | `lib/db/src/schema/suppliers.ts` | id, name, cif, email, phone, active | — |
| `purchase_orders` | `lib/db/src/schema/suppliers.ts` | id, supplierId, status, total, createdAt | → suppliers |
| `ingredient_lots` | `lib/db/src/schema/suppliers.ts` | id, ingredientId, lotNumber, expirationDate, quantity | → ingredients |

### Impresoras y KDS

| Tabla | Schema | Columnas principales |
|---|---|---|
| `printers` | `lib/db/src/schema/printers.ts` | id, name, ip, port, type, active |
| `print_queue` | — | id, printerId, content, status, createdAt |
| `print_routing` | — | id, printerId, categoryIds (JSONB), events (JSONB) |
| `print_audit` | — | id, queueId, result, sentAt |
| `kds_stations` | `lib/db/src/schema/kds-stations.ts` | id, name, zoneId, active, prepZone |

### Reservas

| Tabla | Schema | Columnas principales | FK |
|---|---|---|---|
| `service_shifts` | `lib/db/src/schema/reservations.ts` | id, name, startTime, endTime, days, capacity | — |
| `reservations` | — | id, shiftId, tableId, clientId, fecha, hora, guests | → service_shifts |
| `reservation_status_history` | — | id, reservationId, status, changedAt | — |
| `waiting_list` | — | id, nombre, guests, phone, requestedAt | — |
| `reservation_deposits` | — | id, reservationId, amount, paid | — |

### CRM y fidelización

| Tabla | Schema | Columnas principales |
|---|---|---|
| `crm_clients` | `lib/db/src/schema/crm.ts` | id, name, email, phone, birthdate |
| `crm_loyalty_levels` | — | id, name, minPoints, discount |
| `crm_loyalty_config` | — | id, pointsPerEuro, expirationDays |
| `crm_loyalty_points` | — | id, clientId, points, orderId |
| `crm_gift_cards` | — | id, code, balance, expiresAt |
| `crm_gift_card_transactions` | — | id, cardId, amount, type |
| `crm_promotions` | — | id, name, type, discount, conditions |
| `crm_coupon_uses` | — | id, clientId, promotionId, usedAt |
| `crm_wallet` | — | id, clientId, balance |
| `crm_wallet_transactions` | — | id, walletId, amount, type |
| `crm_campaigns` | — | id, name, channel, status, scheduledAt |
| `crm_campaign_sends` | — | id, campaignId, clientId, sentAt |
| `crm_consents` | — | id, clientId, type, granted |
| `crm_audit_log` | — | id, clientId, action, createdAt |
| `crm_demo_data` | — | id, tag (para limpieza de datos demo) |

### Recursos humanos y fichaje

| Tabla | Schema | Columnas principales |
|---|---|---|
| `hr_positions` | `lib/db/src/schema/hr.ts` | id, name, department |
| `hr_departments` | — | id, name |
| `hr_work_centers` | — | id, name, address |
| `hr_employee_positions` | — | id, employeeId, positionId, startDate |
| `hr_employee_external_ids` | — | id, employeeId, system, externalId |
| `hr_import_templates` | — | id, name, format, mapping (JSONB) |
| `hr_import_history` | — | id, filename, status, importedAt |
| `hr_import_rows` | — | id, historyId, data (JSONB), status |
| `hr_pay_periods` | — | id, start, end, status |
| `hr_employee_requests` | — | id, employeeId, type, status |
| `hr_notifications` | — | id, employeeId, message, read |
| **fichaje** (schema propio) | `lib/db/src/schema/fichaje.ts` | fichajes, employee_schedule, leave_requests |

### Panel de dirección

| Tabla | Schema | Columnas principales |
|---|---|---|
| Tablas director | `lib/db/src/schema/director.ts` | Métricas, KPIs, configuración de alertas, simulaciones |

### Sistema y configuración

| Tabla | Schema | Columnas principales |
|---|---|---|
| `business_config` | `lib/db/src/schema/business-config.ts` | id, businessName, nif, address, logo, currency |
| `alert_config` | `lib/db/src/schema/alert-config.ts` | id, alertType, threshold, active |
| `notifications` | `lib/db/src/schema/notifications.ts` | id, message, type, read, createdAt |
| `audit_log` | `lib/db/src/schema/audit-log.ts` | id, employeeId, action, entity, entityId, createdAt |
| `audit_findings` | `lib/db/src/schema/audit-findings.ts` | id, runId, severity, description |
| `audit_runs` | — | id, startedAt, completedAt, status |
| `backup_schedules` | `lib/db/src/schema/backup-offline.ts` | id, frequency, nextRun, destination |
| `backup_destinations` | — | id, type (local/s3/gdrive), config (JSONB) |
| `offline_devices` | — | id, name, type, lastSeen |
| `offline_queue` | — | id, deviceId, action, payload, synced |
| `device_audit_log` | — | id, deviceId, event, createdAt |
| `tech_events` | — | id, severity, message, source |
| `setup_wizard` | `lib/db/src/schema/setup-wizard.ts` | id, sessionId, step, completed |
| `installation` | `lib/db/src/schema/installation.ts` | id, module, status, installedAt |
| `caja_sessions` | `lib/db/src/schema/caja.ts` | (similar a cash_sessions, revisar posible solapamiento) |
| `cash_machine` | `lib/db/src/schema/cash-machine.ts` | id, scenario, status |
| `invoice_scanner` | `lib/db/src/schema/invoice-scanner.ts` | id, filename, parsedData (JSONB), status |
| `backups` | `lib/db/src/schema/backups.ts` | id, filename, size, createdAt, status |
| `online_orders` | `lib/db/src/schema/online-orders.ts` | id, platform, externalId, status, items (JSONB) |

---

## Entidades del requisito sin tabla localizada

| Entidad requerida | Estado |
|---|---|
| Usuarios del sistema (login Replit) | ❌ No existe — solo `employees` con PIN |
| Sesiones HTTP / refresh tokens | ❌ No existe — JWT stateless, sin tabla de sesiones |
| Permisos granulares por módulo | ✅ `role_permissions` (migración 0019) |
| Lotes y caducidades | ✅ `ingredient_lots` |
| Traceabilidad de lotes | ✅ tablas en stock.ts |
| Facturas de proveedor | ✅ `invoice_scanner` + `purchase_orders` |
| Conciliación documental | ✅ endpoints en purchase-orders.ts y documents.ts |

---

## Proceso de backup

- **Worker:** `artifacts/api-server/src/lib/backup-worker.ts`
- **Polling:** cada 5 minutos
- **Destinos configurables:** local, S3, Google Drive (config via `backup_destinations`)
- **Tablas:** `backup_schedules`, `backup_destinations`, `backups`
- **Estado actual:** El worker existe y está activo. La integración con S3/GDrive es configurable pero no está conectada a credenciales reales (ver AUDIT-INITIAL.md §Simulaciones).

---

## Cómo se aplican las migraciones

```bash
# Desde la raíz del workspace
cd lib/db
DATABASE_URL=<url> pnpm drizzle-kit push

# Para aplicar una migración específica
DATABASE_URL=<url> pnpm drizzle-kit migrate
```

No hay runner automático al arrancar el servidor. Las migraciones se aplican manualmente antes de cada despliegue que las requiera.
