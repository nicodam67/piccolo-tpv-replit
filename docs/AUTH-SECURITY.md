# Auditoría de Autenticación y Seguridad — Piccolo TPV

> Generado por auditoría técnica — 2026-07-17

## Sistema de autenticación

### Mecanismo

| Aspecto | Implementación |
|---|---|
| Tipo | JWT (JSON Web Token) stateless |
| Algoritmo | HS256 (HMAC-SHA256) |
| Secreto | `SESSION_SECRET` (env var, obligatoria) |
| Duración | 12 horas (`expiresIn: "12h"`) |
| Almacenamiento frontend | `localStorage["token"]` + `localStorage["employee"]` |
| PIN | 4 dígitos, hash bcrypt (cost factor 6) |
| Rate limiting login | 10 intentos / 15 min / IP (`express-rate-limit`) |

### Generación del token

```typescript
// artifacts/api-server/src/routes/auth.ts:71
const token = jwt.sign(
  { id: employee.id, name: employee.name, role: employee.role },
  secret,
  { expiresIn: "12h" }
);
```

### Validación del token (middleware)

```typescript
// artifacts/api-server/src/middlewares/auth.ts
// requireAuth: extrae Bearer token, verifica con SESSION_SECRET
// adjunta req.user = { id, name, role }
//
// requireRole(...roles): comprueba req.user.role contra la lista
```

---

## Rutas públicas (allowlist)

Las siguientes rutas están explícitamente exentas de `requireAuth`:

| Ruta | Razón |
|---|---|
| `GET /health` | Health check |
| `GET /employees/login-list` | Selector de empleado (sin datos de rol) |
| `POST /auth/pin` | Login con PIN (rate-limited) |
| `GET /fichaje/public/*` | Reloj de fichaje móvil |
| `GET /public/*` | Carta QR, pedidos online, etc. |
| `GET /order-status/:id` | Estado del pedido para cliente |
| `GET /driver/:id` | Vista del repartidor (token-based) |
| `GET /courier/:id` | Resumen de courier |
| `GET /menu` | Menú público |
| `GET /config/business` | Config pública para wizard y carta QR |
| `GET /setup/detect` | Detección de módulos pre-auth |
| `POST /setup/seed-employees` | Bootstrap inicial (⚠️ ver abajo) |

Definida en: `artifacts/api-server/scripts/audit-routes.ts:32-44`

---

## Resultado del auditor de rutas (`audit-routes.ts`)

```
❌ Route audit FAILED — 1 unguarded endpoint(s) detected:
  [auth.ts:87]  POST /setup/seed-employees
```

**Evaluación:** El endpoint `/setup/seed-employees` es un bootstrap de emergencia que solo actúa cuando la tabla de empleados está vacía. Es **intencionalmente público** para el caso chicken-and-egg (no hay empleados → no hay JWT → no se puede autenticar). Debe añadirse a la allowlist o eliminarse una vez que la producción tenga datos.

**Acción recomendada (P1):** Añadir `/setup/seed-employees` a `PUBLIC_ALLOWLIST` en `audit-routes.ts` Y documentar que debe desactivarse (o gatearse con `SEED_ENABLED=true`) una vez el entorno de producción esté inicializado.

---

## Protección de rutas frontend

### Situación actual

**No existe ningún componente `<PrivateRoute>` o `<AuthGuard>` global en `App.tsx`.** La protección es exclusivamente server-side. El frontend confía en que si el token ha caducado o no existe, el backend devolverá 401 y cada página individual gestionará la redirección.

### Riesgo detectado

- Un usuario puede navegar a `/admin` o `/admin/permisos` en el navegador sin token — verá la UI vacía o con errores de carga, pero no será redirigido automáticamente al login.
- No existe verificación centralizada del token al montar la aplicación.
- El campo `role` se guarda en `localStorage["employee"]` y es legible/modificable desde DevTools, pero el backend revalida el rol en cada petición protegida — este riesgo es de impersonation en frontend, no de escalada de privilegios real.

---

## Refresh token y revocación

| Mecanismo | Estado |
|---|---|
| Refresh token | ❌ No implementado |
| Blacklist de tokens | ❌ No implementado |
| Invalidación al cambiar PIN | ❌ No implementado |
| Bloqueo por inactividad | ❌ No implementado |
| Logout server-side | ❌ No implementado (solo elimina localStorage en cliente) |

**Implicación:** Si un token es robado, permanece válido durante 12 horas. No hay forma de revocarlo sin reiniciar el servidor o cambiar `SESSION_SECRET`.

---

## Protección CSRF

- La API usa CORS con lista blanca de orígenes (`app.ts:47-58`).
- `credentials: false` en CORS — no se envían cookies automáticamente.
- No se usa `SameSite` cookies ni tokens CSRF explícitos.
- **Evaluación:** El riesgo CSRF es bajo dado que la autenticación es por Bearer token en header (no cookie), y CORS bloquea orígenes no autorizados. No es una vulnerabilidad crítica en este diseño.

---

## Cost factor de bcrypt

- El PIN usa `bcrypt` con **cost factor 6** (`$2a$06$...`).
- El factor 6 es muy bajo (el estándar mínimo recomendado es 10-12).
- Con factor 6, un atacante con acceso al hash podría forzar los 10.000 PINs de 4 dígitos en segundos en hardware moderno.
- **Mitigación existente:** El rate limiting (10 intentos/IP/15 min) protege el endpoint online. El riesgo real es si alguien obtiene acceso directo a la base de datos.
- **Recomendación (P2):** Aumentar el cost factor a 10 en nuevas instalaciones.

---

## Módulo FichajeImportarAnviz — Plan de renombramiento

### Situación actual

- **Archivo:** `artifacts/piccolo-tpv/src/pages/fichaje/FichajeImportarAnviz.tsx`
- **Ruta App.tsx:** `/admin/fichaje/importar` → `<FichajeImportarAnviz>`
- **Nombre de componente:** `FichajeImportarAnviz`
- **Endpoint backend:** `POST /api/hr/import/anviz` (en `src/routes/hr-import.ts`)
- **Token:** Lee `localStorage.getItem("token")` directamente (línea 55) para la petición.

### Formatos actualmente soportados

- CSV (delimitado por coma o punto y coma)
- XLS / XLSX (via ExcelJS)

### Formatos pendientes de soporte

- TXT (texto delimitado)
- XML (exportaciones de sistemas de control de acceso)
- JSON (APIs de integración)

### Plan de renombramiento (solo documentado, no ejecutado)

| Elemento | Antes | Después |
|---|---|---|
| Archivo | `FichajeImportarAnviz.tsx` | `FichajeImportarUniversal.tsx` |
| Componente | `FichajeImportarAnviz` | `FichajeImportarUniversal` |
| Import en App.tsx | `import FichajeImportarAnviz from ...` | `import FichajeImportarUniversal from ...` |
| Route en App.tsx | `component={FichajeImportarAnviz}` | `component={FichajeImportarUniversal}` |
| Endpoint backend | `/api/hr/import/anviz` | `/api/hr/import` (genérico) |
| Texto UI | "Importar Anviz" | "Importación de fichajes" |
| Formatos | CSV, XLS, XLSX | CSV, XLS, XLSX, TXT, XML, JSON |

**Prerrequisito:** El backend `hr-import.ts` deberá actualizarse para aceptar y parsear los nuevos formatos antes de exponer la UI universal. El cambio de nombre puede hacerse de forma independiente.

---

## Resumen de riesgos de seguridad

| Riesgo | Severidad | Mitigación existente | Prioridad |
|---|---|---|---|
| Sin refresh token | Media | Token dura solo 12h | P2 |
| Sin revocación de tokens | Media | Ventana de 12h | P2 |
| Sin guards de ruta en frontend | Baja | Backend valida todo | P2 |
| bcrypt cost factor 6 | Media | Rate limiting online | P2 |
| `/setup/seed-employees` público | Media | Solo actúa si DB vacía | P1 |
| Role en localStorage | Baja | Backend revalida rol | P3 |
| Sin bloqueo por inactividad | Baja | Dispositivos físicos en restaurante | P3 |
| Sin CSRF token | Baja | Bearer token, no cookies | P3 |
