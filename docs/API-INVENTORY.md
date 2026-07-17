# Inventario de Rutas API — Piccolo TPV

> Generado por auditoría técnica — 2026-07-17
> Total de endpoints detectados: **586** (en 62 archivos de ruta)

## Leyenda de estado

| Estado | Descripción |
|---|---|
| ✅ Implementada | Ruta con lógica backend real, conectada a DB |
| ⚠️ Parcial | Ruta implementada pero con partes simuladas o incompletas |
| 🔶 Simulada | Responde con datos ficticios o modo simulator activo |
| ❌ Sin consumidor | Existe en backend pero ninguna página frontend la llama |

## Resumen por dominio

| Dominio | Archivo | Nº Rutas | Auth | Estado general |
|---|---|---|---|---|
| Autenticación | auth.ts | 3 | Parcial | ✅ |
| Zonas / Salas | zones.ts | ~8 | ✅ | ✅ |
| Mesas | tables.ts | 14 | ✅ | ✅ |
| Operaciones de mesa | table-operations.ts | ~6 | ✅ | ✅ |
| Alérgenos | allergens.ts | 13 | ✅ | ✅ |
| Alérgenos de mesa | table-allergies.ts | 8 | ✅ | ✅ |
| Pedidos | orders.ts | 11 | ✅ | ✅ |
| KDS | kds.ts | 10 | ✅ | ✅ |
| Pagos | payments.ts | ~8 | ✅ | ✅ |
| Caja | cash.ts | 11 | ✅ | ✅ |
| Caja automática | cash-machine.ts | 11 | ✅ | 🔶 Simulator |
| Productos | products.ts | 13 | ✅ | ✅ |
| Categorías | categories.ts | 12 | ✅ | ✅ |
| Modificadores | modifiers.ts | 9 | ✅ | ✅ |
| Ingredientes | ingredients.ts | 11 | ✅ | ✅ |
| Recetas | recipes.ts | ~10 | ✅ | ✅ |
| Subrecetas | subrecipes.ts | ~8 | ✅ | ✅ |
| Rentabilidad | profitability.ts | ~6 | ✅ | ✅ |
| Descuentos | discounts.ts | ~5 | ✅ | ✅ |
| Propinas | tips.ts | ~4 | ✅ | ✅ |
| Divisiones | splits.ts | ~4 | ✅ | ✅ |
| Documentos | documents.ts | 18 | ✅ | ✅ |
| Configuración | config.ts | ~6 | Parcial | ✅ |
| Proveedores | suppliers.ts | 11 | ✅ | ✅ |
| Pedidos de compra | purchase-orders.ts | 9 | ✅ | ✅ |
| Recepciones | goods-receipts.ts | ~8 | ✅ | ✅ |
| Facturas proveedor | supplier-invoices.ts | ~5 | ✅ | ✅ |
| Escáner facturas | invoice-scanner.ts | 12 | ✅ | ✅ |
| Informes compras | purchase-reports.ts | ~6 | ✅ | ✅ |
| Trazabilidad lotes | traceability.ts | ~6 | ✅ | ✅ |
| Mermas | waste-records.ts | ~5 | ✅ | ✅ |
| Ubicaciones almacén | storage-locations.ts | ~4 | ✅ | ✅ |
| Categ. ingredientes | ingredient-categories.ts | ~4 | ✅ | ✅ |
| Reservas | reservations.ts | ~10 | ✅ | ✅ |
| Turnos servicio | service-shifts.ts | ~4 | ✅ | ✅ |
| Lista espera | waiting-list.ts | ~4 | ✅ | ✅ |
| Fichaje | fichaje.ts | 24 | Parcial | ✅ |
| RRHH | hr.ts | 33 | ✅ | ✅ |
| Importación RRHH | hr-import.ts | 10 | ✅ | ⚠️ Solo CSV |
| VeriFactu | verifactu.ts | 13 | ✅ | 🔶 Simulator |
| CRM | crm.ts | 25 | ✅ | ✅ |
| Fidelización ext. | loyalty-extended.ts | 25 | ✅ | ✅ |
| Pedidos online | online-orders.ts | 25 | ✅ | ✅ |
| Pedidos online v2 | online-orders-v2.ts | 17 | ✅ | ✅ |
| Reparto | delivery-orders.ts | ~8 | ✅ | ✅ |
| Impresoras | printers.ts | 18 | ✅ | ✅ |
| Dashboard | dashboard.ts | ~4 | ✅ | ✅ |
| Notificaciones | notifications.ts | ~4 | ✅ | ✅ |
| Elementos canvas | canvas-elements.ts | ~5 | ✅ | ✅ |
| RRHH Director | director.ts | 14 | ✅ | ✅ |
| Director mgmt | director-management.ts | 18 | ✅ | ✅ |
| Backup | backup.ts | 19 | ✅ | ⚠️ S3/GDrive config |
| Diagnóstico | diagnostics.ts | ~6 | ✅ | ✅ |
| Offline | offline.ts | 10 | ✅ | ✅ |
| Setup | setup.ts | 11 | ✅ | ✅ |
| Auditoría | audit.ts | 3 | ✅ admin | ✅ |
| Instalación | installation.ts | 15 | ✅ | ✅ |
| Datos demo | demo-data.ts | ~6 | ✅ | ✅ |
| Sistema info | system-info.ts | ~4 | ✅ | ✅ |
| Permisos por rol | role-permissions.ts | ~6 | ✅ admin | ✅ |
| Health check | health.ts | 1 | No | ✅ |

---

## Rutas de autenticación (detalle)

| Método | URL | Auth | Rol | Estado |
|---|---|---|---|---|
| GET | `/api/employees/login-list` | ❌ Público | — | ✅ |
| POST | `/api/auth/pin` | ❌ Público (rate-limited) | — | ✅ |
| POST | `/api/setup/seed-employees` | ❌ Público | — | ✅ Bootstrap |

## Rutas públicas intencionadas

| URL | Razón |
|---|---|
| `GET /api/health` | Health check del servidor |
| `GET /api/employees/login-list` | Selector de PIN |
| `POST /api/auth/pin` | Login |
| `GET /api/fichaje/public/*` | Reloj fichaje móvil |
| `GET /api/public/*` | Carta QR, pedidos online |
| `GET /api/order-status/:id` | Estado pedido para cliente |
| `GET /api/driver/:id` | Vista repartidor |
| `GET /api/menu` | Menú público |
| `GET /api/config/business` | Config pública |
| `GET /api/setup/detect` | Detección pre-auth |

---

## Rutas notables con estado especial

### Caja automática (`cash-machine.ts`) — Modo simulador

El módulo de caja automática soporta un modo simulador controlado por header HTTP:
- `x-simulator-scenario` determina el escenario de prueba
- `CASH_MACHINE_SCENARIO` (env var) puede fijar el escenario por defecto
- En producción sin configuración, responde como si hubiera un cajón real

**Estado:** 🔶 Simulada en entornos sin hardware real. No hay integración con ningún fabricante específico en producción.

### VeriFactu (`verifactu.ts`) — Modo simulador AEAT

```typescript
// verifactu.ts:7
// Local simulator + test-environment adapter (no production sends)
// verifactu.ts:816
// Send record to AEAT (or simulator)
```

- La configuración en DB (`verifactu_config.mode`) determina si envía a AEAT real o al simulador.
- El simulador de la AEAT responde como si fuera producción.
- **Estado:** ⚠️ Implementación completa, pero requiere configuración explícita para producción real.

### Importación RRHH (`hr-import.ts`) — Solo CSV Anviz

- El endpoint acepta ficheros de importación pero solo procesa CSV format Anviz.
- El frontend (`FichajeImportarAnviz.tsx`) solo ofrece `.csv` en el input de archivo.
- **Estado:** ⚠️ Parcial — falta soporte XLS/XLSX/TXT/XML/JSON.

### Backup destinos S3/GDrive (`backup.ts`)

- Las rutas de configuración de destinos existen y persisten en DB.
- El worker lee los destinos, pero la integración con S3 requiere credenciales AWS no configuradas.
- Google Drive requiere OAuth2 no configurado.
- **Estado:** ⚠️ Parcial — local funciona, S3/GDrive pendiente de credenciales.

---

## Rutas sin consumidor frontend detectado

Las siguientes rutas existen en backend pero no se ha detectado llamada desde el frontend:

| Método | URL | Archivo |
|---|---|---|
| GET | `/api/admin/audit/modules` | audit.ts |
| POST | `/api/admin/audit/findings` | audit.ts |
| GET | `/api/purchase-reports/*` | purchase-reports.ts |
| GET | `/api/online-orders/v1/*` | online-orders.ts (v1 deprecado) |
| POST | `/api/backup/demo-data` | backup.ts |
| GET | `/api/system-info/*` | system-info.ts |

> Nota: Esta lista es indicativa. El análisis se basa en búsqueda de strings; pueden existir llamadas dinámicas no detectadas.

---

## Rutas del frontend sin backend localizado

**No se han detectado rutas frontend que llamen a endpoints inexistentes.** Todas las páginas del frontend consumen rutas presentes en el backend. Sin embargo, hay páginas que llaman a rutas con datos simulados:

| Página | Ruta llamada | Tipo de respuesta |
|---|---|---|
| `admin-salud.tsx` | `/api/diagnostics/status` | Real (métricas del sistema) |
| `admin-sistema.tsx` | `/api/admin/audit/*` | Real |
| `verifactu.tsx` | `/api/verifactu/*` | Real + simulator según config |
| `caja-automatica.tsx` | `/api/cash-machine/*` | Simulator por defecto |

---

## Resultado del auditor de seguridad de rutas

```bash
node --experimental-strip-types scripts/audit-routes.ts

❌ Route audit FAILED — 1 unguarded endpoint(s) detected:
  [auth.ts:87]  POST /setup/seed-employees
```

**Acción:** Este endpoint es intencionalmente público (bootstrap). Debe añadirse a la allowlist.
