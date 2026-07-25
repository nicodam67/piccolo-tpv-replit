# Entrega 56 — contratos Fichaje (Timeclock)

## Resultado

El dominio Fichaje queda contratado en **38 operaciones** con tag `phase56-timeclock`.
Cliente Orval aislado: `timeclock-generated`. **No se migraron consumidores** (Entrega 57).

## Inventario del dominio

### Routers backend

| Archivo | Alcance |
|---------|---------|
| `artifacts/api-server/src/routes/fichaje.ts` | Registros, turnos, ausencias, informes, import Anviz, settings, auditoría, NFC, endpoints públicos `/fichaje/public/*` |
| `artifacts/api-server/src/routes/tablet.ts` | Dispositivos tablet, emparejamiento, PIN, clock desde quiosco |

### Agrupación por función

| Función | Operaciones |
|---------|-------------|
| Configuración fichaje | `GET/PUT /fichaje/settings` |
| Empleados habilitados para fichar | `GET /fichaje/public/employees` |
| Entrada / salida / pausas | `POST /fichaje/public/clock`, `POST /tablet/clock` |
| Estado actual empleado | `GET /fichaje/public/my-status/{id}`, `GET /fichaje/me` |
| Historial y registros | `GET /fichaje/records`, `GET /fichaje/records/today`, `GET /fichaje/records/{id}/breaks` |
| Correcciones administrativas | `POST /fichaje/records/manual`, `PUT /fichaje/records/{id}` (+ `time_corrections`) |
| Incidencias | Consumidor `FichajeIncidencias.tsx` reutiliza `GET /fichaje/records` (sin endpoint propio) |
| Aprobación / validación | `PUT /fichaje/absences/{id}/approve` |
| Informes | `GET /fichaje/reports/summary` |
| Importaciones | `POST /fichaje/import/anviz`, `GET /fichaje/import/history` |
| Tablet / PIN / NFC | Rutas `/tablet/*`, `POST /tablet/verify-pin`, `POST /fichaje/public/nfc/identify`, admin NFC cards |
| Fichaje móvil (PWA) | `GET /fichaje/public/clock-status` — **fail-closed** (`mobileClockEnabled: false` siempre) |
| Turnos planificados | `GET/POST/PUT/DELETE /fichaje/shifts` (integrados en módulo fichaje TPV) |
| Ausencias | `GET/POST/DELETE /fichaje/absences` |

### Excluidos

| Ruta | Motivo |
|------|--------|
| `ALL /tablet/device/:token` | Sentinela 410 — credenciales en URL deshabilitadas |
| `ALL /tablet/device/:token/ping` | Sentinela 410 |
| `POST /fichaje/import` | **No existe en backend** — consumidor `FichajeImportar.tsx` desalineado; funcionalidad futura |
| Integración hardware Anviz directa | Solo importación de filas pre-parseadas (`/import/anviz`) |

### Consumidores identificados (sin migrar)

18 páginas en `artifacts/piccolo-tpv/src/pages/fichaje/` + tablet (`TabletApp.tsx`, `TabletHome.tsx`, `FichajeDispositivos.tsx`). Todas usan `api.get/post/put` o `fetch` directo.

### Hooks manuales

Ningún hook Orval/React Query para fichaje — migración pendiente Entrega 57.

### Pruebas existentes del dominio

| Archivo | Cobertura |
|---------|-----------|
| `tablet-security.test.ts` | PIN proof flow vía `/api/tablet/verify-pin` |
| `clock-authorization.test.ts` | Emisión/consumo de proofs |
| `timeclock-openapi-contract.test.ts` | Metadata 38 ops + integración opcional |

## Contratos

- Tags: `timeclock` + `phase56-timeclock`
- JWT: `bearerAuth` + `cookieAuth` en operaciones protegidas
- Dispositivo: `deviceTokenAuth` (`x-device-token`) o `x-device-credential: body`
- RBAC documentado en `x-roles` según runtime
- Idempotencia opcional: `Idempotency-Key` en `POST /fichaje/public/clock` y `POST /tablet/clock`
- Zona horaria: campo `timezone` en `fichaje_settings` (default `Europe/Madrid`); timestamps en `timestamptz`
- Auditoría correcciones: `time_corrections.correctedBy` + `fichaje_audit` con `performedByName`

## Seguridad documentada (sin rediseño)

| Área | Comportamiento runtime |
|------|------------------------|
| PIN | 3 intentos, lockout 5 min; mensaje genérico fail-closed; proofs efímeros ~90s |
| NFC | Hash SHA-256; anti-debounce 5s; tarjetas revocadas rechazadas |
| Tablet | Registro con código emparejamiento admin; `deviceToken` nunca en listados admin |
| Móvil | `mobileClockEnabled` siempre `false` en `/public/clock-status` |
| Historial otros empleados | Managers (`admin`/`manager`/`encargado`) filtran por `employeeId` |
| Exportaciones | Solo `GET /fichaje/reports/summary` (JSON); sin endpoint de export CSV |

## Desalineaciones consumidor/backend (documentadas, no corregidas)

- `FichajeReloj.tsx`: envía `{ source: "pin" }` sin `deviceToken`/`proof`
- `FichajeVacaciones.tsx`: usa `type=vacation` y `PUT /absences/{id}` — backend usa `absenceType` y `PUT /absences/{id}/approve`
- `FichajeImportar.tsx`: llama `POST /fichaje/import` inexistente

## Artefactos

| Artefacto | Ruta |
|-----------|------|
| Fragmento paths | `lib/api-spec/timeclock-openapi-section.yaml` |
| Fragmento schemas | `lib/api-spec/timeclock-openapi-schemas.yaml` |
| Splice script | `scripts/splice-timeclock-openapi.mjs` |
| Orval config | `lib/api-spec/orval.timeclock.config.ts` |
| Cliente generado | `lib/api-client-react/src/timeclock-generated/` |
| Tests metadata | `artifacts/api-server/src/routes/timeclock-openapi-contract.test.ts` |

## Validaciones

```bash
node scripts/splice-timeclock-openapi.mjs   # idempotente
pnpm --filter @workspace/api-spec codegen:timeclock
pnpm --filter @workspace/api-client-react exec tsc --noEmit
pnpm --filter api-server build
pnpm --filter api-server test -- timeclock-openapi-contract tablet-security clock-authorization
pnpm --filter api-server audit-openapi -- --strict
```

## Preparación Entrega 57

Listo para crear `timeclock-compat.ts` y migrar las 18+ páginas de `fichaje/` a hooks de `timeclock-generated`.
