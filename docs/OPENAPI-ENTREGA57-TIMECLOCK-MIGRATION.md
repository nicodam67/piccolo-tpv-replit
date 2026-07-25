# Entrega 57 — Migración segura de consumidores Fichaje (Timeclock)

Rama: `cursor/migrate-timeclock-hooks-a8c8`  
Base: `0a573fc` (Entrega 56)

## Objetivo

Migrar consumidores activos del dominio Fichaje al cliente OpenAPI `timeclock-generated`, vía `@workspace/api-client-react/timeclock` (`timeclock-compat.ts`), sin debilitar controles de seguridad.

## Artefactos

- `lib/api-client-react/src/timeclock-compat.ts` — reexporta cliente generado + helpers `deviceTokenRequest`, `idempotencyRequest`, `mergeRequest`, `ApiError`
- Export package: `@workspace/api-client-react/timeclock`

## Inventario de migración

| Consumidor | Operaciones migradas | Auth | Bloqueos |
|------------|---------------------|------|----------|
| FichajeConfiguracion | GET/PUT settings | Session RBAC | — |
| FichajeAuditoria | GET audit | Session RBAC | — |
| FichajePanelDiario | GET records/today | Session RBAC | — |
| FichajeInformes | GET reports/summary | Session RBAC | — |
| FichajeCostesLaborales | GET reports/summary | Session RBAC | — |
| FichajeCorrecciones | GET records, PUT record | Session RBAC | — |
| FichajeIncidencias | GET records | Session RBAC | — |
| FichajeRegistros | GET records, POST manual | Session RBAC | — |
| FichajePausas | GET records, GET breaks | Session RBAC | Riesgo ownership breaks (backend) |
| FichajeTurnos | shifts CRUD | Session RBAC | — |
| FichajePlanificacion | GET/POST/DELETE shifts | Session RBAC | Mapeo `date`↔`shiftDate` |
| FichajeAusencias | absences CRUD + approve | Session RBAC | — |
| FichajeVacaciones | GET absences, POST absence, PUT approve | Session RBAC | **Rangos multi-día** (solo `absenceDate` único) |
| FichajeEmpleados | NFC cards | Session RBAC | `/api/employees` fuera de alcance |
| FichajeDispositivos | tablet devices admin | Session RBAC | — |
| FichajeImportarAnviz | POST import/anviz, GET history | Session RBAC | — |
| FichajeImportar | GET history only | Session RBAC | **POST /fichaje/import inexistente** |
| FichajeReloj | GET clock-status only | Público | **Fichaje bloqueado** (sin deviceToken/proof) |
| FichajePortalEmpleado | GET me + records | Session | — |
| TabletHome | public employees, NFC identify | x-device-token | — |
| TabletApp | tablet register/ping/clock/verify-pin | x-device-token + proof | — |

## Bloqueos documentados

### A. FichajeReloj.tsx

La pantalla móvil pública no dispone de `deviceToken` ni `proof`. El backend exige ambos. La UI muestra estado deshabilitado y redirige a `/fichaje/tablet`. No se inventan credenciales ni se relaja el backend.

**Corrección mínima posterior:** integrar flujo tablet embebido o deep-link con pairing; no fichaje anónimo.

### B. FichajeVacaciones.tsx

Cableado corregido: `absenceType: "vacation"`, `absenceDate`, `approveTimeclockAbsence`. Creación de rangos (start≠end) bloqueada en UI: el backend solo admite un día por ausencia.

### C. FichajeImportar.tsx

`POST /fichaje/import` no existe. Pantalla marcada legacy/no operativa. Historial vía `getTimeclockImportHistory`. Importación Anviz sigue en `FichajeImportarAnviz.tsx`.

### D. Ownership pausas

`GET /fichaje/records/{id}/breaks` sin validación de ownership en backend. No ampliado desde frontend. Riesgo registrado para endurecimiento separado.

### E. deviceToken

- Solo header `x-device-token` o campo body en operaciones contratadas
- No en URLs, query strings, consola ni mensajes de error
- No persistido en ubicaciones nuevas

## Adaptadores (timeclock-compat.ts)

- `deviceTokenRequest(token)` — header seguro
- `idempotencyRequest(key)` — Idempotency-Key para clock
- `mergeRequest(...)` — combinar RequestInit
- Reexport completo del cliente generado (sin duplicar lógica HTTP)

## Mapeos en consumidores

- **FichajePausas:** `breakStart` → `startedAt` en presentación
- **FichajePlanificacion:** `shiftDate` ↔ `date` en shifts
- **FichajeVacaciones:** `TimeclockAbsenceListItem` → filas UI legacy

## Exclusiones respetadas

- Endpoints 410 sentinela
- POST /fichaje/import
- Hardware Anviz directo
- HR general (`/api/employees` sin migrar)
- Cambios backend/RBAC/migraciones DB

## Estado de consolidación

**Parcialmente consolidado con bloqueos** — todas las operaciones compatibles con las 38 de `phase56-timeclock` migradas; bloqueos seguros en Reloj, Importar universal y rangos de vacaciones.
