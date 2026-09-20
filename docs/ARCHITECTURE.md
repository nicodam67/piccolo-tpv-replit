# Arquitectura de Piccolo TPV

> Generado por auditoría técnica — 2026-07-17

## Carta QR oficial

La aplicacion Convex que antes vivia en `artifacts/qr-menu` fue retirada del monorepo.
El QR oficial es el repositorio independiente `nicodam67/piccolo-qr-menu`.
Todavia no existe integracion entre ambos repositorios; la futura comunicacion se
hara mediante APIs versionadas.

El TPV conserva su catalogo PostgreSQL, pedidos online, courier y las rutas
internas `/carta` y `/admin/qr-menu`. No se eliminaron datos ni migraciones.

## Diagrama de componentes reales

```
Tablets / TPV (navegador web)         Pantallas KDS (navegador web)
        │                                       │
        └───────────────────┬───────────────────┘
                            │ HTTPS + Socket.io
                   ┌────────▼────────┐
                   │  Nginx / Replit  │  (proxy inverso gestionado)
                   │  puerto 80/443   │
                   └────────┬────────┘
                            │
              ┌─────────────┼─────────────────┐
              │             │                 │
   ┌──────────▼──────┐  ┌───▼────────┐  ┌────▼──────────┐
   │  Frontend Vite  │  │  API REST  │  │  Socket.io    │
   │  React 18       │  │  Express   │  │  /api/socket  │
   │  /piccolo-tpv   │  │  5.2.1     │  │  tiempo real  │
   └─────────────────┘  └───┬────────┘  └───────────────┘
                            │
              ┌─────────────┼──────────────────┐
              │             │                  │
   ┌──────────▼──┐  ┌───────▼───────┐  ┌──────▼──────┐
   │ PostgreSQL  │  │  Workers      │  │  Stripe API  │
   │ Drizzle ORM │  │  print-worker │  │  VeriFactu   │
   │ 19 migracs. │  │  backup-wkr   │  │  Anviz (CSV) │
   └─────────────┘  │  online-wkr   │  └─────────────┘
                    │  verifactu-wk │
                    └───────────────┘
```

---

## Estructura del monorepo (pnpm workspaces)

```
/
├── artifacts/
│   ├── piccolo-tpv/          # Frontend React/Vite (SPA)
│   │   ├── src/
│   │   │   ├── pages/        # 74 páginas (.tsx)
│   │   │   ├── components/   # Componentes compartidos
│   │   │   ├── lib/          # Utilidades, api.ts, offline-db.ts
│   │   │   └── hooks/        # Custom React hooks
│   │   ├── e2e/              # Tests Playwright
│   │   └── vite.config.ts
│   │
│   ├── api-server/           # Backend Express/Node
│   │   ├── src/
│   │   │   ├── routes/       # 60+ archivos de ruta (~38.000 líneas)
│   │   │   ├── middlewares/  # requireAuth, requireRole
│   │   │   ├── lib/          # workers, socket, logger, db helpers
│   │   │   └── app.ts        # Express app + CORS
│   │   ├── scripts/
│   │   │   └── audit-routes.ts  # Auditor de seguridad de rutas
│   │   └── build.mjs         # Build con esbuild
│   │
│   └── mockup-sandbox/       # Servidor Vite para previsualizaciones Canvas
│
├── lib/
│   ├── db/                   # ORM Drizzle
│   │   ├── src/schema/       # 37 archivos de esquema
│   │   ├── migrations/       # 19 migraciones (.sql + .down.sql)
│   │   └── drizzle.config.ts
│   │
│   ├── api-client-react/     # Cliente HTTP tipado (generado / manual)
│   │   └── src/
│   │       ├── index.ts      # Exporta hooks TanStack Query
│   │       └── custom-fetch.ts  # fetch con token JWT automático
│   │
│   ├── api-zod/              # Esquemas Zod compartidos (validación)
│   └── api-spec/             # Configuración Orval (codegen — bloqueado)
│
├── scripts/                  # Scripts de monorepo
├── package.json              # workspaces: ["artifacts/*","lib/*","workers/*"]
└── tsconfig.base.json
```

---

## Tecnologías utilizadas

| Capa | Tecnología | Versión |
|---|---|---|
| Frontend framework | React | 18.x |
| Build tool | Vite | 5.x |
| Routing frontend | Wouter | 3.x |
| State / queries | TanStack Query | 5.x |
| UI components | shadcn/ui + Radix | — |
| Estilos | Tailwind CSS | 3.x |
| Backend framework | Express | 5.2.1 (pinned) |
| Runtime | Node.js | 20+ |
| ORM | Drizzle | 0.38+ |
| Base de datos | PostgreSQL | Gestionado Replit |
| Tiempo real | Socket.io | 4.x |
| Auth | jsonwebtoken + bcryptjs | — |
| Rate limiting | express-rate-limit | — |
| Logger | pino / pino-http | — |
| Build backend | esbuild (via build.mjs) | — |
| Testing | Vitest + Supertest | — |
| E2E | Playwright | — |
| Validación | Zod | 3.x |
| Hojas de cálculo | ExcelJS | 4.x |

---

## Cómo arranca el frontend

**Workflow Replit:** `pnpm --filter @workspace/piccolo-tpv run dev`

```
vite.config.ts
  base: process.env.BASE_URL || "/"
  server.port: process.env.PORT (asignado por Replit)
  server.allowedHosts: true
```

El frontend es una SPA que se sirve completa en `/piccolo-tpv`. Todas las rutas de página son manejadas por Wouter en el cliente. No hay SSR.

**Punto de entrada:** `src/main.tsx` → `src/App.tsx` → `<Switch>` de Wouter con 80+ rutas.

---

## Cómo arranca el backend

**Workflow Replit:** `pnpm --filter @workspace/api-server run dev`

```bash
# dev = build + start
export NODE_ENV=development && pnpm run build && pnpm run start

# build usa esbuild (via build.mjs) → dist/index.mjs
# start: node --enable-source-maps ./dist/index.mjs
```

**Puerto:** `process.env.PORT` (por defecto 8080 si no se define).

**Arranque de workers** (dentro de `src/index.ts`):
- `startPrintWorker()` — polling cada 5 s
- `startBackupWorker()` — polling cada 5 min
- `startOnlineOrdersWorker()` — polling externo
- `startVerifactuWorker()` — polling cada 60 s

---

## Cómo se conecta la base de datos

```typescript
// lib/db/drizzle.config.ts
defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
})
```

- **Variable:** `DATABASE_URL` (obligatoria, gestionada por Replit)
- **Migraciones:** `drizzle-kit push` aplica las migraciones. No hay runner automático al arrancar; se aplican manualmente o en CI.
- **Baseline:** No existe `0000_initial.sql`. El esquema base se infiere del estado actual de la DB o se reconstruye aplicando todas las migraciones en orden.
- **Pool:** Drizzle usa el driver `postgres` de `drizzle-orm/postgres-js`. Sin pool explícito configurado — usa el default de postgres.js.

---

## Cómo se autentican los usuarios

### Flujo completo

```
1. GET /api/employees/login-list  →  lista de empleados activos (sin rol, pública)
2. Usuario selecciona empleado + introduce PIN de 4 dígitos
3. POST /api/auth/pin  →  bcrypt.compare(pin, hash)
4. Backend emite JWT:  jwt.sign({id, name, role}, SESSION_SECRET, {expiresIn:"12h"})
5. Frontend almacena token en localStorage["token"] y employee en localStorage["employee"]
6. Peticiones posteriores: Authorization: Bearer <token>
7. requireAuth middleware verifica y adjunta req.user = {id, name, role}
```

### Protección de rutas

- **Backend:** `requireAuth` en todas las rutas excepto allowlist pública.
- `requireRole("admin")` / `requireRole("manager","admin")` para rutas sensibles.
- **Frontend:** NO hay wrappers de ruta protegida en React (App.tsx). La protección es exclusivamente server-side. Las páginas individuales comprueban `localStorage["token"]` para redirigir al login, pero no de forma centralizada.

### Limitaciones documentadas

- Token de 12h sin refresh token.
- Sin revocación de tokens (no hay blacklist).
- Sin protección CSRF (la API acepta peticiones CORS solo desde orígenes permitidos).
- Sin bloqueo por inactividad en frontend.
- El rol del usuario en localStorage puede ser inspeccionado (pero el backend lo revalida en cada petición).

---

## Cómo funciona la API REST

- **Base path:** `/api` (montado en `app.ts`: `app.use("/api", router)`)
- **Router raíz:** `src/routes/index.ts` — importa y monta 62 sub-routers
- **Total de archivos de ruta:** 62 (sin contar tests)
- **Total de líneas de lógica backend:** ~38.000
- **Formato:** JSON exclusivo. `express.json()` + `express.urlencoded()`.
- **CORS:** Lista blanca de orígenes. En producción: `piccolo-tpv.replit.app`. En dev: `REPLIT_DEV_DOMAIN`. Extensible via `ALLOWED_ORIGINS`.
- **Logging:** pino-http en cada petición (método, URL sin query, status code).

---

## Cómo funcionan los WebSockets (Socket.io)

- **Servidor:** `src/lib/socket.ts` — instancia `socket.io` montada sobre el servidor HTTP.
- **Path:** `/api/socket.io`
- **Cliente:** `socket.io-client` en el frontend, en las páginas `tables.tsx` y `kds.tsx`.
- **Eventos conocidos:**
  - `order:updated` — pedido modificado
  - `table:updated` — estado de mesa cambiado
  - `kds:item:ready` — ítem marcado listo en KDS
  - `notification:new` — nueva notificación
- **Autenticación socket:** El token JWT se envía en el handshake (query param o auth header). El servidor lo verifica en el middleware de conexión.

---

## Cómo funcionan KDS e impresión

### KDS (Kitchen Display System)

- **Backend:** `src/routes/kds.ts` (414 líneas) + `src/schema/kds-stations.ts`
- **Tablas:** `kds_stations`, `kitchen_tasks`
- **Flujo:** Al confirmar un pedido, se crean `kitchen_tasks` por ítem. El KDS los consulta y los marca completados.
- **Página frontend:** `/kds/:zone` (`src/pages/kds.tsx`, 863 líneas)
- **Tiempo real:** Socket.io emite cuando hay nuevos ítems o cambios de estado.
- **Configuración:** `/admin/kds-stations` permite gestionar estaciones por zona de cocina.

### Impresión

- **Worker:** `src/lib/print-worker.ts` — polling cada 5 segundos a la tabla `print_queue`.
- **Tablas:** `printers`, `print_queue`, `print_routing`, `print_audit`
- **Flujo:** Las acciones (ticket, comanda, prefactura) insertan en `print_queue`. El worker procesa la cola y envía al servidor de impresión configurado (IP/puerto).
- **Protocolos soportados:** ESC/POS sobre TCP (impresoras de red).
- **Admin:** `/admin/impresoras`, `/admin/cola-impresion`, `/admin/prueba-impresion`

---

## Cómo funciona el modo offline

- **Biblioteca:** `src/lib/offline-db.ts` — wrapper sobre IndexedDB (via `Promise.resolve` pattern).
- **Banner:** `src/components/OfflineBanner.tsx` — detecta `navigator.onLine` y eventos `offline`/`online`.
- **Backend:** `src/routes/offline.ts` (568 líneas) — gestión de dispositivos offline, cola de sincronización.
- **Tablas:** `offline_devices`, `offline_queue`, `device_audit_log`
- **Flujo:** Cuando el dispositivo pierde red, las operaciones críticas se almacenan en IndexedDB. Al reconectar, se sincronizan con el backend via `/api/offline/sync`.

---

## Cómo se publica la aplicación

1. El usuario pulsa "Publish" en la UI de Replit.
2. Replit construye ambos artefactos (`piccolo-tpv` y `api-server`) y los despliega en infraestructura gestionada.
3. URL de producción: `https://piccolo-tpv.replit.app`
4. Variables de entorno de producción se configuran en Replit Secrets (no en `.env`).
5. La base de datos de producción es una instancia PostgreSQL separada gestionada por Replit.
6. No hay CD/CI externo configurado. El despliegue es manual desde la UI.

---

## Dependencias críticas entre paquetes

```
piccolo-tpv
  → @workspace/api-client-react  (hooks tipados de la API)
  → @workspace/api-zod            (tipos Zod compartidos)

api-server
  → @workspace/db                 (Drizzle + esquemas)
  → @workspace/api-zod            (validación de entrada)

api-client-react
  → @workspace/api-zod            (tipos de respuesta)
  (Nota: lib/api-spec/orval.config.ts existe pero orval v8.21 no puede
   cargar la config en este entorno — el cliente se mantiene manualmente)
```
