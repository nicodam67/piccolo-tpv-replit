# Informe de producción y mantenimiento — Piccolo TPV
**Versión:** 1.2.0  
**Fecha del informe:** 2026-07-17  
**Generado por:** Agente de arquitectura Replit

---

## 1. Resumen ejecutivo

Piccolo TPV es un sistema de punto de venta completo para restaurantes, desarrollado como monorepo TypeScript con Express 5 en el backend, React/Vite en el frontend y PostgreSQL con Drizzle ORM como capa de datos. El sistema cubre el ciclo operativo completo del restaurante: desde la toma de pedidos en sala hasta la firma fiscal verifactu, pasando por cocina (KDS), caja, stock, reservas, reparto, fichaje, CRM y cuadro de mando directivo.

**Estado general:** ✅ Funcional y operativo  
**Riesgos críticos:** 0  
**Riesgos altos:** 2  
**Riesgos medios:** 4  
**Recomendaciones de mantenimiento:** 8

---

## 2. Arquitectura del sistema

### 2.1 Topología

```
┌─────────────────────────────────────────────────┐
│                  Cliente                         │
│  Tablet / PC / KDS (navegador o PWA)            │
└──────────────────┬──────────────────────────────┘
                   │ HTTPS (proxy Replit)
┌──────────────────▼──────────────────────────────┐
│             piccolo-tpv (Vite/React)            │
│  Puerto: $PORT · Rutas: wouter                  │
│  API client: @workspace/api-client-react        │
│  Socket.io client para tiempo real              │
└──────────────────┬──────────────────────────────┘
                   │ REST + WebSocket
┌──────────────────▼──────────────────────────────┐
│              api-server (Express 5)             │
│  Puerto: $PORT · ~60 grupos de rutas            │
│  Auth: JWT (requireAuth + requireRole)          │
│  Workers: print, backup, verifactu              │
└──────────────────┬──────────────────────────────┘
                   │ Drizzle ORM
┌──────────────────▼──────────────────────────────┐
│              PostgreSQL (Replit DB)             │
│  162 tablas · 18 migraciones                   │
└─────────────────────────────────────────────────┘
```

### 2.2 Librerías internas

| Paquete | Rol |
|---------|-----|
| `@workspace/db` | Esquema Drizzle + cliente de base de datos |
| `@workspace/api-client-react` | Hooks TanStack Query generados por Orval |
| `@workspace/api-zod` | Schemas Zod generados desde la spec OpenAPI |
| `@workspace/api-spec` | Spec OpenAPI (fuente de verdad) |

### 2.3 Workers de fondo

| Worker | Función |
|--------|---------|
| `print-worker` | Cola de impresión con reintentos y fallback |
| `backup-worker` | Backups automáticos programados |
| `verifactu-worker` | Firma y envío de facturas a la AEAT |

---

## 3. Inventario de módulos

| # | Módulo | Estado | Tablas BD | Rutas API | Tests |
|---|--------|--------|-----------|-----------|-------|
| 1 | TPV core (pedidos, mesas, zonas) | ✅ OK | ~15 | ~12 | Sí |
| 2 | Cocina (KDS) | ✅ OK | 3 | 3 | No |
| 3 | Caja y cobro | ✅ OK | 5 | 8 | Sí |
| 4 | Categorías y productos | ✅ OK | 4 | 6 | No |
| 5 | Impresoras y cola | ✅ OK | 3 | 6 | No |
| 6 | Carta QR y branding | ✅ OK | 1 | 2 | No |
| 7 | Stock e ingredientes | ✅ OK | 7 | 10 | No |
| 8 | Reservas v2 | ✅ OK | 6 | 8 | No |
| 9 | Reparto v2 | ✅ OK | 4 | 6 | Sí |
| 10 | Pedidos online v2 | ⚠️ Parcial | 6 | 8 | No |
| 11 | CRM / Fidelización | ✅ OK | 15 | 20 | Sí |
| 12 | RRHH (nóminas, contratos) | ✅ OK | 8 | 12 | No |
| 13 | Fichaje | ✅ OK | 8 | 10 | No |
| 14 | Director / BI | ✅ OK | 5 | 8 | No |
| 15 | Verifactu | ⚠️ Parcial | 3 | 4 | No |
| 16 | Modo offline | ✅ OK | 3 | 5 | No |
| 17 | Backup automático | ✅ OK | 2 | 6 | No |
| 18 | Auditoría de módulos | ✅ OK | 2 | 6 | No |
| 19 | Instalación y diagnóstico | ✅ OK | 5 | 15 | No |
| 20 | Configuración general | ✅ OK | 2 | 4 | No |
| 21 | Salud del sistema | ✅ OK | — | 3 | No |

**Totales:** 162 tablas · ~60 grupos de rutas · 31 suites de tests

---

## 4. Base de datos

### 4.1 Estado
- **Motor:** PostgreSQL (Replit managed)
- **Tablas:** 162 tablas activas
- **Migraciones:** 18 aplicadas (0001–0018), todas idempotentes
- **ORM:** Drizzle ORM con tipo inferido desde el esquema
- **Índices:** Drizzle genera índices en PKs; sin índices adicionales explícitos sobre FKs frecuentes

### 4.2 Dependencias circulares conocidas
- `manualsTable` → `employeesTable` (FK `updated_by`) — gestionado con `{ onDelete: "set null" }`
- `installationDevicesTable` → `printersTable` (FK `default_printer_id`) — gestionado con `{ onDelete: "set null" }`

### 4.3 Recomendaciones BD
1. **Añadir índices** en columnas de búsqueda frecuente: `orders.tableId`, `orders.status`, `order_items.orderId`, `fichaje.employeeId`.
2. **Vacuum periódico**: programar `VACUUM ANALYZE` semanal en tablas de alta rotación (`orders`, `order_items`, `kitchen_tasks`, `fichaje`).
3. **Retención de datos**: los registros de `kitchen_tasks`, `print_queue` y `offline_queue` resueltos/completados pueden archivarse o borrarse tras 90 días.
4. **Backup diario verificado**: el worker de backup está activo; verificar que los registros en `backup_records` tienen `verified = true` antes de asumir que la copia es válida.

---

## 5. Seguridad

### 5.1 Autenticación y autorización
| Mecanismo | Estado | Notas |
|-----------|--------|-------|
| JWT Bearer | ✅ OK | Firmado con `SESSION_SECRET` (env secret) |
| Roles (admin, manager, encargado, waiter, cashier) | ✅ OK | `requireRole` aplicado en todas las rutas admin |
| Rate limiting en auth | ✅ OK | `express-rate-limit` en `/api/auth/*` |
| CORS | ✅ OK | Solo orígenes Replit + `ALLOWED_ORIGINS` |
| Secretos hardcodeados | ✅ Ninguno detectado | — |
| Permisos granulares por acción | ⚠️ Pendiente | Un rol tiene acceso total a su nivel |
| Auditoría de accesos denegados | ⚠️ Pendiente | No se registran los 403 |
| Sesiones activas listables | ⚠️ Pendiente | Sin endpoint de gestión de sesiones |

### 5.2 Vulnerabilidades de dependencias conocidas
| Paquete | Versión | Riesgo | Acción recomendada |
|---------|---------|--------|--------------------|
| `xlsx` | 0.18.5 | **Alto** | Vulnerabilidades conocidas (CVE-2023-30533). Reemplazar por `exceljs` o `papaparse` |
| `express` | 5.2.1 | Medio | Express 5 aún en pre-release. Monitorizar changelog para breaking changes |

### 5.3 Recomendaciones de seguridad
1. **Reemplazar `xlsx`** por una librería sin vulnerabilidades activas antes de la siguiente publicación.
2. **Registrar accesos denegados** (403) en `techEventsTable` para detectar intentos de acceso no autorizado.
3. **Añadir permisos granulares**: crear una tabla `permissions` con acciones por módulo y vincularla a roles.
4. **Revisión de sesiones**: implementar endpoint `GET /admin/auth/sessions` que liste JWT activos y permita revocarlos.
5. **Rate limiting global**: extender `express-rate-limit` a todas las rutas, no solo autenticación.

---

## 6. Rendimiento

### 6.1 Métricas actuales
| Indicador | Valor observado | Umbral aceptable |
|-----------|----------------|------------------|
| Latencia BD (`SELECT 1`) | <20ms | <50ms |
| Tiempo de arranque del servidor | ~3s | <10s |
| Tamaño del bundle de tipos generados | 5.506 líneas (`api.ts`) | — |

### 6.2 Riesgos de rendimiento
- **Consultas N+1**: varios endpoints cargan órdenes y luego hacen JOINs en bucle. Usar `db.select().from(...).leftJoin(...)` en una sola query.
- **`execSync` en rutas**: `diagnostics.ts` usa `execSync('df -k ...')` en la ruta de status — bloquea el event loop brevemente. Migrar a `spawnSync` con timeout o leer `/proc/diskstats`.
- **Polling del frontend**: TanStack Query hace `refetchInterval` en múltiples componentes simultáneamente. Consolidar en un único endpoint de status y distribuir con Context.

### 6.3 Recomendaciones de rendimiento
1. **Añadir índices BD** en las columnas listadas en §4.3.
2. **Paginar** los endpoints que devuelven listas sin límite (`/diagnostics/events` ya lo hace; revisar `/admin/audit/findings`).
3. **Reemplazar `execSync`** en rutas HTTP por llamadas no bloqueantes.

---

## 7. Tests

### 7.1 Estado actual
- **31 suites Vitest** en `artifacts/api-server/`
- **Cobertura estimada:** ~40% de las rutas tienen tests directos
- **Sin tests de frontend** (no hay Playwright, Cypress ni Testing Library configurados)

### 7.2 Suites existentes
Allergens, cash-machine (cobro, divisas, propinas), delivery (reparto), CRM, goods-receipts, hr-import, installation (simulación), online-orders, payroll, profitability, purchase-reports, reservations, stock (ingredientes, mermas), tax (verifactu IVA), zones.

### 7.3 Recomendaciones de testing
1. **Tests E2E** (Playwright): cubrir el flujo crítico completo: abrir mesa → pedir → cobrar → cerrar mesa.
2. **Tests de seguridad**: verificar que las rutas admin rechazan peticiones sin rol suficiente.
3. **CI obligatorio antes de publicar**: `pnpm typecheck && pnpm test && bash scripts/check-codegen.sh`
4. **Tests de verifactu**: cubrir la generación de la cadena de firma fiscal con fixtures de facturas reales.

---

## 8. Copias de seguridad

### 8.1 Estado actual
- Worker `backup-worker` activo desde el arranque del servidor
- Tabla `backup_records` registra cada ejecución con `status` y `verified`
- Tabla `backup_schedules` permite configurar la frecuencia

### 8.2 Recomendaciones
1. **Verificar la copia diaria**: comprobar que `backup_records` tiene al menos un registro con `verified = true` en las últimas 24h desde el panel `/admin/salud`.
2. **Backup externo**: enviar copias a Google Drive o S3 para protección fuera del servidor (tarea pendiente #198).
3. **Drill de recuperación**: restaurar una copia en un entorno de staging al menos una vez al mes y documentar el resultado.

---

## 9. Monitorización y alertas

### 9.1 Infraestructura existente
| Componente | Estado |
|-----------|--------|
| `GET /healthz` | ✅ Endpoint público de salud básica |
| `GET /diagnostics/status` | ✅ Estado completo: BD, disco, impresoras, backups, cola offline, alertas |
| `GET /diagnostics/connectivity` | ✅ Latencia BD, uptime, versión Node |
| `GET /diagnostics/events` | ✅ Log de eventos técnicos paginado |
| `POST /diagnostics/maintenance` | ✅ Limpieza de eventos resueltos |
| Panel `/admin/salud` | ✅ Dashboard visual con semáforos en tiempo real |
| Panel `/admin/sistema` | ✅ Auditoría de 56 módulos con hallazgos |
| Logging | ✅ Pino (JSON estructurado) en todos los endpoints |

### 9.2 Alertas automáticas pendientes
- **Sin notificaciones push**: cuando el sistema detecta un error crítico (en `techEventsTable`) no hay alerta activa al administrador.
- **Sin umbral de disco configurable**: el umbral de 500 MB está hardcodeado en `diagnostics.ts`.
- **Sin monitorización externa**: no hay uptime monitor externo (UptimeRobot, etc.).

### 9.3 Recomendaciones
1. **Añadir webhook de alertas**: cuando se inserte un evento de nivel `critical` en `techEventsTable`, enviar una notificación por email o Slack.
2. **Externalizar el umbral de disco** a la tabla `business_config`.
3. **Configurar monitor externo** que haga ping a `/api/healthz` cada 5 minutos y alerte si cae.

---

## 10. Mantenimiento preventivo

### 10.1 Tareas periódicas recomendadas

| Frecuencia | Tarea | Herramienta |
|-----------|-------|-------------|
| Diario | Verificar backup válido | Panel `/admin/salud` |
| Diario | Revisar alertas críticas sin resolver | Panel `/admin/salud` |
| Semanal | Ejecutar auditoría automática | `POST /admin/audit/run` |
| Semanal | Revisar cola de impresión con errores | Panel `/admin/salud` |
| Mensual | `VACUUM ANALYZE` en tablas de alta rotación | SQL directo |
| Mensual | Drill de recuperación desde backup | Entorno staging |
| Mensual | Revisión de usuarios y roles activos | `/admin/empleados` |
| Trimestral | Actualizar dependencias y auditar vulnerabilidades | `pnpm audit` |
| Trimestral | Archivar/borrar datos históricos > 90 días | SQL directo |

### 10.2 Endpoint de mantenimiento
`POST /api/diagnostics/maintenance` ejecuta: limpieza de eventos técnicos resueltos > 30 días, recuento de tablas, verificación de índices. Llamar desde el panel de mantenimiento o como tarea programada.

---

## 11. Versionado y despliegue

### 11.1 Versioning
- **Fichero `VERSION`** en la raíz del repositorio: versión semántica actual (`1.2.0`)
- **`CHANGELOG.md`**: historial de cambios por versión con descripción de migraciones
- **Endpoint `GET /api/admin/system/version`**: devuelve versión, fecha, migraciones aplicadas, changelog y métricas de runtime

### 11.2 Proceso de actualización segura recomendado
1. Comprobar que existe una copia de seguridad válida en las últimas 2h (`GET /api/diagnostics/status` → `backups.ok`)
2. Ejecutar `pnpm typecheck && pnpm test && bash scripts/check-codegen.sh`
3. Revisar el CHANGELOG de la nueva versión: identificar migraciones pendientes
4. Aplicar migraciones en producción: `pnpm --filter @workspace/db run push` o SQL directo
5. Desplegar el nuevo código
6. Verificar `/api/healthz` y `/api/diagnostics/status` tras el despliegue
7. Ejecutar `POST /api/admin/audit/run` para confirmar que todos los módulos están en estado esperado
8. Registrar el despliegue en `techEventsTable` con nivel `info`

### 11.3 Reversión
Replit gestiona checkpoints automáticos. En caso de fallo:
1. Abrir checkpoints desde la UI de Replit
2. Restaurar al checkpoint anterior al despliegue
3. Si hay migraciones aplicadas, ejecutar el SQL inverso manualmente (no hay migraciones down automáticas en este proyecto — añadir antes de publicar)

---

## 12. Riesgos y deuda técnica

### Riesgos altos
| ID | Descripción | Impacto | Acción |
|----|-------------|---------|--------|
| R1 | `xlsx` 0.18.5 con CVE conocido | Seguridad · Datos | Reemplazar por `exceljs` |
| R2 | Sin migraciones "down" (reversión SQL) | Operacional | Añadir scripts de rollback antes de producción real |

### Riesgos medios
| ID | Descripción | Impacto | Acción |
|----|-------------|---------|--------|
| R3 | Express 5 en pre-release | Estabilidad | Monitorizar changelog; fijar a patch version |
| R4 | Orval broken (codegen manual) | Desarrollo | Actualizar a versión compatible o migrar a openapi-typescript |
| R5 | Sin permisos granulares | Seguridad | Tabla `permissions` vinculada a roles |
| R6 | Sin tests E2E del flujo de cobro | Calidad | Playwright test suite para flujo crítico |

### Deuda técnica
- Algunos módulos (KDS, reparto) sin tests automáticos
- `execSync` bloqueante en rutas HTTP de diagnóstico
- Varios endpoints devuelven listas sin paginación (riesgo con datos históricos)
- `replit.md` estaba sin documentar (ahora actualizado)

---

## 13. Recomendaciones para el mantenimiento futuro

### Prioridad alta (antes de primera publicación en producción real)
1. **Reemplazar `xlsx`** por una librería sin vulnerabilidades
2. **Añadir scripts de rollback** para cada migración
3. **Configurar CI obligatorio**: typecheck + tests + codegen-check antes de merge
4. **Tests E2E del flujo crítico** (mesa → pedido → cobro)

### Prioridad media (próximos 30 días)
5. **Añadir índices BD** en columnas de búsqueda frecuente
6. **Webhook de alertas** para eventos críticos
7. **Monitor externo** de uptime (`/api/healthz`)
8. **Permisos granulares** por módulo y acción

### Prioridad baja (mantenimiento continuo)
9. **Vacuum automático** en tablas de alta rotación
10. **Archivar datos históricos** > 90 días
11. **Actualizar dependencias** trimestralmente
12. **Drill de recuperación** mensual desde backup

---

## 14. Preparación para futuras ampliaciones

La arquitectura actual soporta nuevos módulos sin modificar los existentes:

1. **Nuevo módulo backend**: crear `artifacts/api-server/src/routes/nuevo-modulo.ts` → importar y registrar en `routes/index.ts`
2. **Nuevo módulo frontend**: crear `artifacts/piccolo-tpv/src/pages/admin-nuevo.tsx` → añadir Route en `App.tsx` y tarjeta en `admin-dashboard.tsx`
3. **Nuevas tablas**: añadir fichero en `lib/db/src/schema/` → exportar desde `lib/db/src/schema/index.ts` → crear migración SQL idempotente
4. **Nuevos tipos de API**: añadir a la spec OpenAPI → regenerar con `pnpm codegen` (o editar manualmente mientras Orval esté roto)

### Interfaces de extensión existentes
- `requireRole(...roles)` — control de acceso plug-in para cualquier ruta
- `techEventsTable` — log estructurado para cualquier módulo
- `auditFindingsTable` — hallazgos de auditoría para cualquier módulo
- `businessConfigTable` — configuración global accesible desde cualquier módulo

---

## 15. Conclusión

Piccolo TPV es un sistema maduro y funcional con una arquitectura sólida. Los riesgos críticos son manejables (principalmente la dependencia `xlsx` y la ausencia de migraciones de reversión). El sistema está preparado para operación en producción con las siguientes condiciones previas:

- [ ] Reemplazar `xlsx` por librería segura
- [ ] Añadir scripts de rollback SQL para las 18 migraciones
- [ ] Configurar monitor externo de uptime
- [ ] Ejecutar drill de recuperación desde backup en staging
- [ ] Verificar que `backup_records.verified = true` en el entorno de producción

Una vez cumplidas estas condiciones, el sistema puede operar de forma autónoma con el plan de mantenimiento preventivo descrito en §10.

---

_Informe generado automáticamente por el agente de arquitectura de Piccolo TPV el 2026-07-17. Actualizar con cada versión mayor._
