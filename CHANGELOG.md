# Changelog — Piccolo TPV

All significant changes to this project are documented here.
Format: [version] date — description — migration (if any).

---

## [1.2.0] — 2026-07-17

### Nuevas funcionalidades
- **Panel de salud del sistema** (`/admin/salud`): indicadores en tiempo real con semáforo verde/amarillo/rojo para DB, almacenamiento, impresoras, copias de seguridad, cola offline y alertas críticas.
- **Plan de producción y mantenimiento**: versioning, changelog, informe de arquitectura y recomendaciones documentadas en `PRODUCTION_REPORT.md`.
- **Sistema de versiones**: fichero `VERSION`, endpoint `GET /admin/system/version`, historial de migraciones accesible desde el panel.
- **Panel de instalación multi-tablet** (`/admin/instalacion` → pestaña Asistente): matriz de progreso por tablet con los 12 pasos del asistente, persistencia por dispositivo en localStorage.
- **Editor de escenarios de emergencia** (Manuales): edición inline de situaciones y pasos, guardado vía PATCH `/admin/installation/manuals/emergencia`.

### Mejoras
- Documentación completa de arquitectura, base de datos, API y variables de entorno en `replit.md` y `PRODUCTION_REPORT.md`.
- `replit.md` actualizado con mapa del repositorio, decisiones arquitectónicas y preferencias del proyecto.

---

## [1.1.0] — 2026-07-16

### Nuevas funcionalidades
- **Módulo de auditoría** (`/admin/sistema`): catálogo de 56 módulos con estado, hallazgos automáticos, ejecución de auditoría y descarga de informe. Migración `0013_audit_findings.sql`.
- **Módulo de instalación** (`/admin/instalacion`): inventario de dispositivos, registro de red, diagnóstico de instalación, asistente de tablet, manuales operativos (apertura, cierre, emergencia), simulación de servicio, QR de mesas. Migraciones `0014`, `0016`, `0017`, `0018`.
- **Módulo Director** (`/director`): cuadro de mando ejecutivo con 15 pestañas (ventas, ocupación, personal, rentabilidad, tendencias, previsiones, benchmarks, comparativas, objetivos, KPIs, mapa de calor, satisfacción, competidores, informes, alertas). Migración `0010_director_module.sql`.
- **Módulo CRM / Fidelización**: 15 tablas DB para clientes, tarjetas regalo, promociones, wallet, campañas, reseñas. Migración `0008_crm_loyalty.sql`.
- **Módulo RRHH**: contratos, nóminas, ausencias, evaluaciones, documentos de empleado. Migración `0009_hr_module.sql`.
- **Copia de seguridad y modo offline**: programación automática, registro de backups, cola offline con reintentos. Migración `0011_backup_offline.sql`.
- **Asistente de configuración inicial** (`/admin/setup`): wizard de 12 pasos para la puesta en marcha. Migración `0012_setup_wizard.sql`.
- **Estaciones KDS** (`/admin/kds-stations`): gestión de pantallas de cocina por zona, test de impresión. Migración `0017`.
- **Pedidos con marca de demo** (`isDemo`): flag en órdenes para distinguir simulaciones. Migración `0015_is_demo_operational.sql`.
- **Campos de hardware de dispositivos**: campos extendidos (RAM, procesador, disco, etc.) en `installation_devices`. Migración `0016_device_hardware_fields.sql`.

### Mejoras
- Inventario de dispositivos con categorías (tablet, KDS, impresora, caja, ordenador).
- Diagnóstico de instalación con semáforo por dispositivo.

---

## [1.0.0] — 2026-07-15

### Nuevas funcionalidades
- **Módulo de fichaje**: 8 tablas (fichajeTable, fichajeBreaksTable, fichajeIncidentsTable…), login por PIN/contraseña, gestión de jornadas, ausencias. UUID migrado desde INTEGER.
- **Módulo de stock extendido**: `ingredient_categories`, `storage_locations`, `waste_records`, ingredientes con coste medio, umbral de stock mínimo/máximo. Migración `0004_stock_module.sql`.
- **Reservas v2**: zonas de reserva, políticas de cancelación, listas de espera, depósitos. Migración `0005_reservations_v2.sql`.
- **Reparto v2**: repartidores, rutas, pedidos online propios. Migración `0006_delivery_v2.sql`.
- **Pedidos online v2**: catálogo web, configuración de franjas horarias, pagos online. Migración `0007_online_v2.sql`.
- **Comandas con formatos**: `productFormatsTable`, `formatId`/`formatName`/`isInvitation` en líneas de pedido, `guestCount`/`notes` en pedidos. Auditoría (`auditLogTable`).
- **Carta QR y branding**: campos de branding en configuración, QR de carta. Migración `0001_carta_qr_branding.sql`.
- **Pedidos online v1**: integración inicial. Migración `0002_online_orders.sql`.
- **Impresoras**: `printersTable`, `printQueueTable`, worker de impresión, fallback y tipos de impresora. Migración `0003_printers.sql`.

### Base (esquema inicial)
- Módulo TPV core: zonas, mesas, categorías, productos, pedidos, líneas de pedido, modificadores.
- Módulo de caja: sesiones, arqueos, métodos de pago, pagos.
- Módulo KDS: tareas de cocina, estados de línea.
- Módulo de empleados: roles (admin, manager, waiter, cashier), PIN, autenticación JWT.
- Módulo de configuración general: `businessConfigTable`, impuesto por defecto, moneda, zona horaria.
- Módulo verifactu: cadena de firma fiscal, certificados, envío a la AEAT.
- Módulo offline: `offlineDevicesTable`, `offlineQueueTable`, sincronización automática.
- Módulo de dispositivos: `offlineDevicesTable`, registro ligero de dispositivos.

---

## Historial de migraciones

| # | Fichero | Contenido principal |
|---|---------|---------------------|
| 01 | `0001_carta_qr_branding.sql` | Branding de carta y QR |
| 02 | `0002_online_orders.sql` | Pedidos online v1 |
| 03 | `0003_printers.sql` | Impresoras y cola de impresión |
| 04 | `0004_stock_module.sql` | Stock: categorías, almacenes, mermas |
| 05 | `0005_reservations_v2.sql` | Reservas v2 con zonas y depósitos |
| 06 | `0006_delivery_v2.sql` | Reparto v2 con repartidores |
| 07 | `0007_online_v2.sql` | Pedidos online v2 con franja horaria |
| 08 | `0008_crm_loyalty.sql` | CRM: clientes, tarjetas, wallet, campañas |
| 09 | `0009_hr_module.sql` | RRHH: contratos, nóminas, evaluaciones |
| 10 | `0010_director_module.sql` | Dashboard director (5 tablas) |
| 11 | `0011_backup_offline.sql` | Backups, cola offline, sincronización |
| 12 | `0012_setup_wizard.sql` | Asistente de configuración inicial |
| 13 | `0013_audit_findings.sql` | Panel de auditoría (hallazgos, ejecuciones) |
| 14 | `0014_installation.sql` | Inventario de instalación, red, tests |
| 15 | `0015_is_demo_operational.sql` | Flag `is_demo` en órdenes |
| 16 | `0016_device_hardware_fields.sql` | Campos hardware en dispositivos |
| 17 | `0017_kds_stations_print_test_prepzone.sql` | Estaciones KDS, zona de preparación |
| 18 | `0018_manuals.sql` | Manuales operativos en BD |

---

_Mantenido manualmente. Para añadir una entrada: describe los cambios bajo la versión correspondiente antes de publicar._
