# Piccolo TPV — Informe de Revisión y Limpieza

**Fecha:** 2026-07-17  
**Alcance:** Revisión de código completa del monorepo — duplicidades, código muerto, errores TypeScript, tests fallidos. Sin features nuevas.

---

## Resumen ejecutivo

| Área | Antes | Después |
|------|-------|---------|
| Errores TypeScript (frontend) | 54 en 8 ficheros | **0** (en esos 8 ficheros) |
| Tests backend fallidos | 10 fallos activos | **0 fallos activos** |
| Componentes UI sin usar | 2 ficheros | Eliminados |
| Variables declaradas sin usar | 1 (`cashSales`) | Eliminada |
| Tests skipped (infra) | 12 | 12 (sin cambio — requieren PostgreSQL real) |

---

## 1. Correcciones TypeScript (54 → 0 errores en los ficheros afectados)

### Causa raíz
Ocho ficheros usaban el patrón:
```typescript
const r = await customFetch(url);
if (!r.ok) throw new Error("...");
return r.json();
```
`customFetch<T>` devuelve `Promise<T>` (ya parseado), no un `Response`. El patrón `.ok` / `.json()` es erróneo: `r.ok` no existe en el tipo `T` y `r.json()` tampoco. Todos los errores TS eran consecuencia de esta misma confusión.

### Ficheros corregidos

| Fichero | Cambio |
|---------|--------|
| `src/pages/admin-salud.tsx` | 4 `queryFn` reescritas con `customFetch<T>()` directo |
| `src/pages/admin-datos-demo.tsx` | 1 `queryFn` + 1 `mutationFn` corregidas; tipo `{ total: number }` añadido |
| `src/pages/admin-instalacion.tsx` | 8 funciones (SimulacionTab, ManualesTab, DevicesTab): mismo patrón |
| `src/pages/admin-permisos.tsx` | `load()`, `toggle()`, `resetToDefault()`: refactorizadas con tipos explícitos |
| `src/pages/escaner-facturas.tsx` | Parámetro de tipo `<{ id: string }>` añadido a `customFetch` |
| `src/pages/facturas-proveedor.tsx` | Parámetro de tipo `<{ id: string }>` añadido a `customFetch` |
| `src/pages/fichaje/FichajeRegistros.tsx` | `interface Record` renombrada a `FichajeRecord` (shadowing del tipo global) |
| `src/pages/hr/HRCatalogos.tsx` | `placeholderData: [] as unknown as T` eliminado; `onChange={setDeptForm/setPosForm}` envueltos en lambda para resolver mismatch `extra?: string` vs `extra: string` |

### Errores TS pre-existentes (no afectados)
Permanecen 9 errores en otros 3 ficheros — todos anteriores a esta revisión:

- **`kds.tsx`** (2): `"in_oven"` no existe en el enum codegen `UpdateTaskStatusInputStatus`; `clientName` no existe en `KitchenTask`. Requieren actualización del schema OpenAPI.
- **`pedidos-compra.tsx`** (4): `refetchOrders` usado antes de declararse (ordering issue en hooks); `order` tipado como `unknown` en `onSuccess`.
- **`revision-factura.tsx`** (3): `mutate(boolean)` pero el tipo inferido es `mutate(void)`.

---

## 2. Correcciones de tests backend (10 fallos → 0)

### 2a. `kds.test.ts` — 3 fallos corregidos

**Causa:** Los tests de transición de estado no inicializaban `mockState.selectRows` (la ruta hace un SELECT para obtener el estado actual de la tarea antes de validar la transición). Sin `selectRows`, el SELECT devuelve `[]`, la tarea no se encuentra y la ruta devuelve 404.

| Test | Problema | Corrección |
|------|----------|------------|
| `"new → preparing"` | `selectRows = []` → 404 | Añadido `mockState.selectRows = [TASK_NEW]` |
| `"preparing → ready"` | `selectRows = [TASK_READY]` → transición "ready→ready" inválida → 422 | Cambiado a `selectRows = [TASK_PREP]` |
| `"emits kds:refresh on every status update"` | `selectRows = [{ ...TASK_NEW, status }]` ponía el estado actual igual al objetivo → transición "X→X" siempre inválida | Añadido mapa `prevStatus` para asignar el estado previo correcto según la transición |

### 2b. `reservations.test.ts` — 1 fallo corregido

**Causa:** El mock de la reserva conflictiva usaba `{ ...CONFIRMED_RES, hora: "20:30" }` pero `CONFIRMED_RES` no tiene campo `duracion`. La función `overlaps()` calculaba `NaN` en la aritmética de tiempo y devolvía `false` (sin conflicto), por lo que la ruta intentaba hacer el INSERT en vez de retornar 409.

| Cambio | Detalle |
|--------|---------|
| `mockState.selectRows` | Añadido `duracion: 90` al mock de reserva conflictiva |
| `reservations.ts` mensaje de error | `"Conflicto con reserva existente"` → `"Ya existe una reserva activa en esa mesa"` (el test espera `/reserva activa/i`) |

### 2c. `loyalty-extended.test.ts` — 6 fallos corregidos

**Causa:** `vi.clearAllMocks()` en cada `beforeEach` no elimina la cola de `mockResolvedValueOnce`. Cuando un test anterior consume menos llamadas de las que programó, los valores sobrantes contaminan el siguiente test. El resultado: el test siguiente obtiene un valor stale en el primer `mockInsertReturning()` / `mockUpdateReturning()`, desplazando todos los demás.

**Corrección:** `vi.clearAllMocks()` → `vi.resetAllMocks()` en todos los `beforeEach`. `resetAllMocks` vacía la cola de implementaciones "once", garantizando que cada test parte de cero.

### 2d. `delivery.test.ts` — 12 tests skipped (sin cambio)

Los tests de delivery usan el `db` real de Drizzle sin mock. El `afterAll` intenta conectar a PostgreSQL en `localhost:5432`, que no está disponible en el entorno de CI/test. Los tests están marcados como skipped (no como failed en el informe de suite). Para arreglarlos haría falta añadir un mock de `@workspace/db` o un contenedor PostgreSQL en el entorno de test — fuera del alcance de esta revisión.

---

## 3. Limpieza de código muerto

| Elemento | Acción |
|----------|--------|
| `src/components/ui/command.tsx` | **Eliminado** — no hay ningún import en el proyecto |
| `src/components/ui/spinner.tsx` | **Eliminado** — no hay ningún import en el proyecto |
| `z-report.tsx`: `const cashSales` | **Eliminada** — declarada pero nunca leída |

---

## 4. Hallazgos documentados (sin acción en esta revisión)

### 4a. Tres variantes de cliente HTTP coexisten

El frontend mezcla tres patrones para llamadas a la API:
1. `customFetch` — wrapper con manejo de errores y tipado genérico (~52 ficheros)
2. `fetch` nativo — sin tipo, sin manejo consistente de errores (~70 ficheros)
3. `apiFetch` local — wrappers locales definidos en página (~33 ficheros)

**Recomendación:** Migrar todo a `customFetch<T>()`. Consolidación fuera del alcance de esta revisión (riesgo de regresión alto sin tests E2E de frontend).

### 4b. Solapamiento leve entre routers

- `online-orders.ts` y `online-orders-v2.ts`: rutas paralelas para pedidos online. `v2` añade lógica de notificación y tabla `online_orders_v2`. Conviven intencionadamente.
- `crm.ts` y `loyalty-extended.ts`: módulos separados con responsabilidades distintas (CRM básico vs. fidelización avanzada). No son duplicados funcionales.

### 4c. Entradas hardcodeadas / simuladas

Tres ficheros contienen datos fijos o comportamiento simulado declarado explícitamente:

| Fichero | Línea aprox. | Descripción |
|---------|-------------|-------------|
| `verifactu.ts` | 729 | Respuesta simulada de Verifactu (integración fiscal pendiente) |
| `payments.ts` | 441 | Lógica de terminal de pago simulada |
| `installation.ts` | 526 | Resultado de simulación de instalación hardcodeado |

Estas son simulaciones intencionadas hasta disponer de las integraciones reales, no bugs.

### 4d. Patrones `useEffect` con dependencias potencialmente inestables

`payment.tsx` y `zone-editor.tsx` contienen `useEffect` con arrays de dependencias que incluyen funciones no memoizadas. No causan errores visibles pero pueden provocar re-renders innecesarios. Revisar con ESLint `exhaustive-deps` en una futura iteración.

---

## 5. Estado final

```
Frontend TypeScript (ficheros revisados):   0 errores  ✅
Frontend TypeScript (ficheros pre-existentes): 9 errores  ⚠️  (kds, pedidos-compra, revision-factura)
Backend tests activos:                      399 passed  ✅
Backend tests skipped (delivery/infra):     12 skipped  ℹ️
Ficheros eliminados:                        command.tsx, spinner.tsx
Variables eliminadas:                       cashSales (z-report)
```
