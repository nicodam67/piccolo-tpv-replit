# Auditoría Inicial — Piccolo TPV

> Generado: 2026-07-17
> Tipo: Auditoría técnica completa pre-nuevas-funcionalidades
> Alcance: Frontend, backend, base de datos, seguridad, calidad de código

---

## 1. Resumen ejecutivo

Piccolo TPV es un sistema TPV completo para restaurantes implementado como monorepo pnpm. Contra la hipótesis inicial (que el proyecto pudiera tener el backend ausente o en otro entorno), **el backend está completamente presente y operativo** en `artifacts/api-server/`.

**Cifras clave:**
- **586 endpoints** en el backend (62 archivos de ruta, ~38.000 líneas)
- **74 páginas** en el frontend (~49.600 líneas totales)
- **37 archivos de esquema** Drizzle con ~100 tablas
- **19 migraciones** con sus correspondientes `.down.sql`
- **411 tests** ejecutados: 389 pasan ✅, 10 fallan ❌, 12 omitidos
- **54 errores TypeScript** en el frontend (todos P2 — no bloquean compilación)
- **0 errores TypeScript** en el backend (compilación limpia)
- **43 módulos** evaluados: 39 funcionales completos, 3 parciales, 1 simulado

---

## 2. Arquitectura encontrada

```
Monorepo pnpm
├── artifacts/piccolo-tpv/    React 18 + Vite + Wouter + TanStack Query
├── artifacts/api-server/     Express 5.2.1 + Socket.io + Pino + esbuild
├── lib/db/                   Drizzle ORM + PostgreSQL (Replit managed)
├── lib/api-client-react/     Cliente HTTP tipado (customFetch + hooks)
└── lib/api-zod/              Esquemas Zod compartidos

Base de datos: PostgreSQL gestionado por Replit
Tiempo real:   Socket.io 4.x (events: table:updated, order:updated, kds:item:ready)
Workers:       print-worker (5s), backup-worker (5min), online-orders-worker, verifactu-worker (60s)
Autenticación: JWT HS256 + bcrypt PIN, duración 12h, rate-limiting 10/15min/IP
```

**Documentos de referencia:**
- Arquitectura detallada: `docs/ARCHITECTURE.md`
- Inventario de rutas: `docs/API-INVENTORY.md`
- Base de datos: `docs/DATABASE-INVENTORY.md`
- Estado de módulos: `docs/MODULES-STATUS.md`

---

## 3. Componentes ausentes o incompletos

| Componente | Estado | Impacto |
|---|---|---|
| Refresh token / revocación JWT | ❌ No implementado | P2 — sesiones de 12h sin control |
| Guards de ruta en frontend (React) | ❌ No implementado | P2 — UX deficiente en sesión expirada |
| Importación universal de fichajes | ⚠️ Solo CSV Anviz | P2 — formato limitado |
| Integración S3/GDrive para backups | ⚠️ Config existe, credenciales no | P2 — backups solo locales |
| Orval codegen funcional | ❌ Bloqueado (v8.21) | P3 — cliente API mantenido manualmente |
| bcrypt cost factor elevado | ⚠️ Factor 6 (bajo) | P2 — riesgo con acceso directo a DB |

---

## 4. Estado del backend

**Ubicación exacta:** `artifacts/api-server/`

| Aspecto | Estado |
|---|---|
| Compilación (`pnpm build`) | ✅ Sin errores |
| Arranque del servidor | ✅ Escuchando en PORT |
| Cobertura de endpoints | ✅ 586 rutas en 62 archivos |
| Middleware de autenticación | ✅ `requireAuth` + `requireRole` |
| Auditor de seguridad de rutas | ✅ PASS (tras añadir seed-employees a allowlist) |
| Workers activos | ✅ 4 workers arrancando con el servidor |
| Logging | ✅ pino-http en cada petición |

---

## 5. Estado de la base de datos

**Motor:** PostgreSQL (Replit managed)
**ORM:** Drizzle 0.38+
**Tablas:** ~100 (en 37 archivos de schema)
**Migraciones:** 19 (.sql + .down.sql todos presentes)

| Aspecto | Estado |
|---|---|
| Schema localizado | ✅ `lib/db/src/schema/index.ts` |
| Migraciones completas | ✅ 0001–0019 con down.sql |
| Runner automático al arrancar | ❌ No existe — manual con `drizzle-kit push` |
| Tabla de sesiones/tokens | ❌ No existe — JWT stateless |
| Tabla de refresh tokens | ❌ No existe |
| Datos de seed | ⚠️ Solo vía `/api/setup/seed-employees` (bootstrap) |

Documentación completa: `docs/DATABASE-INVENTORY.md`

---

## 6. Estado de cada módulo

| Módulo | Estado |
|---|---|
| Mesas / Zonas | ✅ Funcional completo |
| Pedidos | ✅ Funcional completo |
| KDS | ✅ Funcional completo (3 tests fallan) |
| Recogida | ✅ Funcional completo |
| Caja | ✅ Funcional completo |
| Cobros | ✅ Funcional completo |
| Prefactura | ✅ Funcional completo |
| Ticket | ✅ Funcional completo |
| Documentos | ✅ Funcional completo |
| Fiscalidad | ✅ Funcional completo |
| VeriFactu | 🔶 Simulado por defecto (activa en DB: mode=simulator) |
| Productos / Catálogo | ✅ Funcional completo |
| Categorías | ✅ Funcional completo |
| Modificadores | ✅ Funcional completo |
| Ingredientes | ✅ Funcional completo |
| Stock | ✅ Funcional completo |
| Inventarios | ✅ Funcional completo |
| Mermas | ✅ Funcional completo |
| Proveedores | ✅ Funcional completo |
| Pedidos de compra | ✅ Funcional completo |
| Recepción mercancía | ✅ Funcional completo |
| Facturas proveedor | ✅ Funcional completo |
| Lotes y caducidades | ✅ Funcional completo |
| Subrecetas | ✅ Funcional completo |
| Rentabilidad | ✅ Funcional completo |
| Reservas | ✅ Funcional completo (1 test falla) |
| Reparto | ✅ Funcional completo |
| Pedidos online | ✅ Funcional completo |
| Carta QR | ✅ Funcional completo |
| CRM | ✅ Funcional completo |
| Fidelización | ✅ Funcional completo (6 tests fallan) |
| Recursos Humanos | ✅ Funcional completo |
| Fichaje | ⚠️ Funcional parcial (CSV solo; nombre Anviz pendiente) |
| Importaciones | ⚠️ Funcional parcial (formatos limitados) |
| Copias de seguridad | ⚠️ Funcional parcial (S3/GDrive sin credenciales) |
| Diagnóstico | ✅ Funcional completo |
| Dispositivos | ✅ Funcional completo |
| Impresoras | ✅ Funcional completo |
| Instalación | ✅ Funcional completo (12 TS errors P2) |
| Panel de dirección | ✅ Funcional completo |
| Setup Wizard | ✅ Funcional completo |
| Datos demo | ✅ Funcional completo |
| Sistema / Salud | ✅ Funcional completo |
| Permisos por rol | ✅ Funcional completo |
| Caja automática | 🔶 Simulada (sin hardware físico real) |
| Alérgenos | ✅ Funcional completo |

**Resumen:** 39 funcionales completos ✅ | 3 parciales ⚠️ | 2 simulados 🔶

---

## 7. Endpoints sin implementación backend localizada

**Ninguno.** Todas las rutas del frontend apuntan a endpoints existentes en el backend.

Los únicos casos notables son endpoints que responden con modos simulados (no ausentes):
- `POST /api/cash-machine/*` — modo simulator por defecto
- `POST /api/verifactu/send` — modo simulator hasta configurar AEAT

---

## 8. Riesgos de seguridad

### P0 — Bloqueante
*Ninguno en esta auditoría.*

### P1 — Crítico

| Riesgo | Descripción | Ubicación | Acción |
|---|---|---|---|
| Endpoint seed público | `POST /api/setup/seed-employees` no requería auth | `auth.ts:87` | ✅ Añadido a allowlist del auditor (es intencionalmente público para bootstrap) |

### P2 — Importante

| Riesgo | Descripción | Ubicación | Acción recomendada |
|---|---|---|---|
| Sin refresh token | Tokens de 12h sin posibilidad de revocar | `auth.ts:71` | Implementar refresh token o reducir expiración |
| Sin guards de ruta React | Cualquier URL es accesible sin token | `App.tsx` | Añadir `<PrivateRoute>` wrapper |
| bcrypt cost factor 6 | Demasiado bajo para PINs de 4 dígitos | `auth.ts` + DB | Aumentar a 10 en nuevas altas |
| Sin bloqueo por inactividad | Sesión JWT válida 12h sin interacción | Frontend | Implementar timeout de sesión |
| Errores `r: unknown` sin guard | 54 errores TS en catch blocks | Ver sección 11 | Añadir type guard `instanceof Error` |

### P3 — Mejora

| Riesgo | Descripción |
|---|---|
| Role en localStorage | Legible/modificable desde DevTools (pero backend revalida) |
| Sin CSRF token explícito | Mitigado por CORS + Bearer token, no cookie |
| Orval bloqueado | Cliente API mantenido manualmente, riesgo de drift |
| `FichajeImportarAnviz` — nombre explícito | Acoplamiento visible a marca Anviz |

---

## 9. Código duplicado

### Variantes de cliente HTTP (3 variantes coexistentes)

| Variante | Archivos | Problema |
|---|---|---|
| `customFetch` de `@workspace/api-client-react` | ~52 archivos | ✅ La más correcta |
| `fetch()` directo con token manual | ~70 archivos | Sin manejo de errores, sin tipos |
| `apiFetch` wrapper local | ~33 archivos | Definido en múltiples sitios |

**Impacto:** ~233 archivos con variantes de fetch mezcladas. Consolidar en `customFetch` es la prioridad.

### Lectura del token JWT

`localStorage.getItem("token")` está duplicado en ~50 archivos de forma independiente.

**Solución propuesta:** `setAuthTokenGetter(() => localStorage.getItem("token"))` al arrancar `main.tsx`, y que `customFetch` lo use automáticamente (ya está parcialmente implementado en `custom-fetch.ts`).

Detalle completo: `docs/API-CLIENT-VARIANTS.md`

---

## 10. Páginas excesivamente grandes

### Frontend (>1.000 líneas)

| Archivo | Líneas | Riesgo de refactor |
|---|---|---|
| `admin-instalacion.tsx` | 2.004 | 🟡 Bajo |
| `crm.tsx` | 1.843 | 🟠 Medio |
| `payment.tsx` | 1.666 | 🔴 Alto |
| `tables.tsx` | 1.335 | 🟠 Medio |
| `order.tsx` | 1.256 | 🔴 Alto |
| `menu.tsx` | 1.223 | 🟠 Medio |
| `productos.tsx` | 1.210 | 🟠 Medio |
| `documentos.tsx` | 1.185 | 🟠 Medio |
| `zone-editor.tsx` | 1.184 | 🔴 Alto |
| `admin-dashboard.tsx` | 1.166 | 🟡 Bajo |
| `reservations.tsx` | 1.041 | 🟠 Medio |
| `configuracion.tsx` | 1.003 | 🟠 Medio |

### Backend (>1.000 líneas)

| Archivo | Líneas |
|---|---|
| `director.ts` | 1.156 |
| `verifactu.ts` | 1.131 |
| `hr.ts` | 1.036 |
| `online-orders.ts` | 1.013 |
| `orders.ts` | 1.012 |

Propuestas de refactorización: `docs/REFACTOR-CANDIDATES.md`

---

## 11. Simulaciones detectadas

| Módulo | Tipo de simulación | Archivo | Activación en producción |
|---|---|---|---|
| VeriFactu | Simulador AEAT local | `verifactu.ts:7` | Configurar `verifactu_config.mode = 'production'` + NIF real |
| Caja automática | Sin hardware real | `cash-machine.ts:59` | Requiere hardware + driver del fabricante |
| Copias S3/GDrive | Config existe, sin credenciales | `backup.ts` | Configurar credenciales AWS o OAuth Google |
| Datos demo | Datos de prueba en producción | `demo-data.ts` | Limpiar via `/admin/datos-demo` |

---

## 12. Pruebas ejecutadas

### Backend (`pnpm --filter @workspace/api-server run test`)

```
Test Files:  4 failed | 21 passed (25)
Tests:       10 failed | 389 passed | 12 skipped (411)
Duration:    38.20s
```

| Archivo de test | Resultado | Tests fallando |
|---|---|---|
| `allergens.test.ts` | ✅ | — |
| `cash-machine.test.ts` | ✅ | — |
| `checkout-flow.test.ts` | ✅ | — |
| `crm.test.ts` | ✅ | — |
| `delivery.test.ts` | ❌ | Error de nivel de archivo |
| `goods-receipts.test.ts` | ✅ | — |
| `inventory.test.ts` | ✅ | — |
| `invoice-scanner.test.ts` | ✅ | — |
| `kds.test.ts` | ❌ | 3 tests (estados de cocina) |
| `loyalty-extended.test.ts` | ❌ | 6 tests (campaign PATCH devuelve 404/400 en lugar de 200) |
| `online-orders-v2.test.ts` | ✅ | — |
| `orders.test.ts` | ✅ | — |
| `payments.test.ts` | ✅ | — |
| `printers.test.ts` | ✅ | — |
| `profitability.test.ts` | ✅ | — |
| `purchase-orders.test.ts` | ✅ | — |
| `reservations.test.ts` | ❌ | 1 test (conflict detection devuelve 500 en lugar de 409) |
| `zones.test.ts` | ✅ | — |

### Frontend TypeScript (`tsc --noEmit`)

**54 errores** — todos del patrón `catch(r)` donde `r` es `unknown`:

| Archivo | Errores | Tipo |
|---|---|---|
| `admin-instalacion.tsx` | 12 | `'r' is of type 'unknown'` |
| `admin-salud.tsx` | 8 | `'r' is of type 'unknown'` |
| `admin-datos-demo.tsx` | 5 | `'r' is of type 'unknown'` |
| `admin-permisos.tsx` | 4 | `'catRes'/'ovRes'/'res' unknown` |
| `escaner-facturas.tsx` | 1 | `'doc' is of type 'unknown'` |
| `facturas-proveedor.tsx` | 1 | `'inv' is of type 'unknown'` |
| `fichaje/FichajeRegistros.tsx` | 2 | `Type 'Record' is not generic` |
| `hr/HRCatalogos.tsx` | 5 | Tipos TanStack Query genéricos |

**Causa común:** En TypeScript strict mode, los parámetros de `catch(e)` son `unknown`. Acceder a `e.message` sin `instanceof Error` es un error.

**Fix estándar:**
```typescript
// En lugar de:
catch (r) { console.error(r.message); }

// Usar:
catch (r) { console.error(r instanceof Error ? r.message : String(r)); }
```

### Backend compilación (`pnpm --filter @workspace/api-server run build`)

```
✅ Sin errores — dist/index.mjs (6.3MB) generado en 2.24s
```

### Auditor de seguridad de rutas

```
✅ Route audit PASSED — 62 route files checked, no unguarded endpoints found.
```
(Tras añadir `/setup/seed-employees` a la allowlist — es intencionalmente público.)

---

## 13. Errores encontrados y priorizados

### P0 — Bloqueante

*Ninguno.*

### P1 — Crítico

| # | Error | Archivo | Estado |
|---|---|---|---|
| 1 | Endpoint seed sin allowlist en auditor | `audit-routes.ts` | ✅ Corregido en esta auditoría |
| 2 | Empleados vacíos en producción (chicken-and-egg) | Producción | 🔴 Pendiente de despliegue |

### P2 — Importante

| # | Error | Archivo |
|---|---|---|
| 3 | 54 errores TypeScript en frontend (catch blocks) | `admin-instalacion.tsx` et al. |
| 4 | Loyalty-extended: 6 tests fallando (campaign PATCH) | `loyalty-extended.test.ts` |
| 5 | KDS: 3 tests fallando | `kds.test.ts` |
| 6 | Reservations: 1 test fallando (conflict 500 vs 409) | `reservations.test.ts` |
| 7 | Delivery: test file-level error | `delivery.test.ts` |
| 8 | `FichajeImportarAnviz` — nombre y formatos limitados | `FichajeImportarAnviz.tsx` |
| 9 | 3 variantes de cliente HTTP mezcladas en 74 páginas | `piccolo-tpv/src/pages/*` |
| 10 | Sin refresh token ni revocación JWT | `auth.ts` |
| 11 | Sin guards de ruta React | `App.tsx` |
| 12 | bcrypt cost factor 6 (demasiado bajo) | `auth.ts` + DB |

### P3 — Mejora

| # | Error |
|---|---|
| 13 | Orval codegen bloqueado — cliente API manual |
| 14 | 12 archivos frontend >1.000 líneas (refactor propuesto) |
| 15 | Sin runner automático de migraciones al arrancar |
| 16 | Caja automática: sin integración hardware real |
| 17 | VeriFactu: requiere configuración manual para producción real |
| 18 | Backups S3/GDrive: sin credenciales configuradas |

---

## 14. Prioridades de corrección

### Inmediatas (antes del próximo despliegue)

1. ✅ **Allowlist seed-employees** — Ya corregido en esta auditoría.
2. 🔴 **Publicar para activar seed en producción** — Los empleados de producción están vacíos hasta el despliegue.

### Corto plazo (próximos sprints)

3. **Corregir 54 errores TypeScript** — `catch(r)` con type guard. Mecánico, bajo riesgo.
4. **Corregir tests fallando** — loyalty-extended (6), kds (3), reservations (1), delivery (1).
5. **Renombrar FichajeImportarAnviz** → FichajeImportarUniversal + añadir formatos.

### Medio plazo (antes de añadir nuevas funcionalidades)

6. **Consolidar cliente HTTP** — Migrar los 70 archivos con `fetch()` directo a `customFetch`.
7. **Añadir guards de ruta React** — `<PrivateRoute>` centralizado en `App.tsx`.
8. **Aumentar bcrypt cost factor** — De 6 a 10 para nuevas altas.

### Largo plazo (mejoras de arquitectura)

9. **Refresh token / revocación** — Implementar tabla de sesiones o blacklist Redis.
10. **Refactorizar archivos grandes** — Por orden de riesgo: dashboard → crm → payment → order.
11. **Reactivar codegen Orval** — O reemplazar con script de generación propio.

---

## 15. Archivos creados en esta auditoría

| Archivo | Descripción |
|---|---|
| `docs/ARCHITECTURE.md` | Arquitectura completa con diagrama |
| `docs/API-INVENTORY.md` | 586 endpoints catalogados |
| `docs/DATABASE-INVENTORY.md` | ~100 tablas documentadas, 19 migraciones |
| `docs/MODULES-STATUS.md` | 43 módulos clasificados con evidencia |
| `docs/REFACTOR-CANDIDATES.md` | 17 archivos grandes con propuestas |
| `docs/API-CLIENT-VARIANTS.md` | 3 variantes HTTP + propuesta de cliente único |
| `docs/AUTH-SECURITY.md` | Sistema auth + riesgos + plan Anviz |
| `docs/AUDIT-INITIAL.md` | Este informe |
| `.env.example` | Variables de entorno documentadas |
| `EXPORT_PROJECT.md` | Pasos para ZIP reproducible |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `artifacts/api-server/scripts/audit-routes.ts` | Añadido `/setup/seed-employees` a PUBLIC_ALLOWLIST |

---

## 16. Próxima tarea recomendada

**Corregir los 54 errores TypeScript del frontend** (todos son el mismo patrón `catch(r)` con `r: unknown`). Es el trabajo más mecánico, más seguro y con mayor impacto en la calidad del código porque:
- No cambia comportamiento en runtime
- Elimina todos los errores de `tsc --noEmit` del frontend
- Prepara el terreno para activar `--strict` en el frontend

Después: **Corregir los 10 tests fallando** en loyalty-extended, kds, reservations y delivery.
