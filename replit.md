# Piccolo TPV

Sistema de punto de venta (TPV) completo para restaurantes. Cubre el ciclo operativo completo: toma de pedidos en sala, cocina (KDS), cobro y facturación (verifactu), gestión de stock, reservas, reparto, pedidos online, fichaje de empleados, CRM y fidelización, cuadro de mando directivo, copias de seguridad y mantenimiento.

## Cómo ejecutar

```bash
# Servidor API (puerto asignado por $PORT, típicamente 5000)
pnpm --filter @workspace/api-server run dev

# Frontend React/Vite (puerto asignado por $PORT)
pnpm --filter @workspace/piccolo-tpv run dev

# Verificación de tipos completa
pnpm run typecheck

# Build completo
pnpm run build

# Regenerar tipos de API desde la spec OpenAPI
pnpm --filter @workspace/api-spec run codegen

# Aplicar cambios de esquema a la BD (solo desarrollo)
pnpm --filter @workspace/db run push
```

### Variables de entorno requeridas
| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Cadena de conexión PostgreSQL |
| `SESSION_SECRET` | Secreto para firmar JWT |
| `NODE_ENV` | `development` \| `production` |

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Monorepo | pnpm workspaces |
| Lenguaje | TypeScript 5.9, Node.js 24 |
| API | Express 5.x |
| BD | PostgreSQL + Drizzle ORM |
| Validación | Zod v4, drizzle-zod |
| API codegen | Orval (desde spec OpenAPI) |
| Frontend | React 18, Vite, Tailwind CSS |
| Routing | Wouter |
| Estado servidor | TanStack Query v5 |
| Componentes UI | Lucide React, Framer Motion, dnd-kit |
| Tiempo real | Socket.io |
| Logging | Pino + pino-http |
| Tests | Vitest (31 suites en api-server) |
| Build | esbuild (CJS bundle para API) |

## Mapa del repositorio

```
/
├── artifacts/
│   ├── api-server/              Express API (fuente de verdad del backend)
│   │   ├── src/
│   │   │   ├── app.ts           Configuración Express (CORS, middlewares)
│   │   │   ├── index.ts         Punto de entrada (servidor HTTP + Socket.io)
│   │   │   ├── routes/          ~60 ficheros de rutas
│   │   │   ├── middlewares/     requireAuth, requireRole
│   │   │   └── lib/             Workers (print, backup, verifactu), seeders
│   │   └── package.json
│   ├── piccolo-tpv/             Frontend React/Vite
│   │   ├── src/
│   │   │   ├── App.tsx          Router principal (wouter)
│   │   │   ├── pages/           ~60 páginas (admin-*, TPV, director, hr, fichaje…)
│   │   │   └── components/      Componentes compartidos
│   │   └── package.json
│   └── mockup-sandbox/          Sandbox de diseño (Vite, componentes aislados)
├── lib/
│   ├── db/                      Esquema Drizzle + migraciones
│   │   ├── src/schema/          35+ ficheros de esquema (162 tablas)
│   │   └── migrations/          18 migraciones SQL (0001–0018)
│   ├── api-client-react/        Hooks generados por Orval (TanStack Query)
│   ├── api-zod/                 Schemas Zod generados desde OpenAPI
│   └── api-spec/                Spec OpenAPI (fuente de verdad de la API pública)
├── scripts/
│   └── check-codegen.sh         CI: verifica que los tipos generados están en sync
├── CHANGELOG.md                 Historial de cambios por versión
├── VERSION                      Versión actual (semver)
└── PRODUCTION_REPORT.md         Informe de arquitectura y recomendaciones
```

## Módulos del sistema

| Módulo | Ruta admin | Descripción |
|--------|-----------|-------------|
| TPV core | `/` | Plano de sala, pedidos, cobro |
| Cocina (KDS) | `/kds` | Pantalla de comandas por zona |
| Caja | `/caja` | Apertura/cierre, arqueo |
| Inventario | `/admin/stock` | Ingredientes, stock, mermas |
| Reservas | `/admin/reservas` | Gestión de turnos y reservas |
| Reparto | `/admin/reparto` | Repartidores, pedidos a domicilio |
| Pedidos online | `/admin/online-*` | Configuración e informes del canal online |
| Fichaje | `/admin/fichaje` | Control de presencia, jornadas |
| CRM | `/admin/crm` | Clientes, tarjetas regalo, fidelización |
| Director | `/director` | Cuadro de mando ejecutivo |
| RRHH | `/admin/rrhh` | Contratos, nóminas, evaluaciones |
| Verifactu | `/admin/verifactu` | Firma fiscal y envío a AEAT |
| Instalación | `/admin/instalacion` | Inventario de dispositivos, asistente |
| Auditoría | `/admin/sistema` | Estado de módulos, hallazgos |
| Salud | `/admin/salud` | Panel en tiempo real (semáforos) |
| Backup | `/admin/backup` | Copias de seguridad |

## Arquitectura de base de datos

- **162 tablas** en PostgreSQL vía Drizzle ORM
- **18 migraciones** aplicadas (0001–0018), todas idempotentes (IF NOT EXISTS)
- Esquema dividido en 35+ ficheros bajo `lib/db/src/schema/`
- Fuente de verdad: `lib/db/src/schema/` → compilado en `lib/db/dist/`
- Tras cambios de esquema: ejecutar `tsc --build lib/db` para regenerar declaraciones

### Tablas clave por área
| Área | Tablas principales |
|------|--------------------|
| Pedidos | `orders`, `order_items`, `restaurant_tables`, `zones` |
| Caja | `cash_sessions`, `payments`, `payment_methods` |
| Stock | `ingredients`, `ingredient_categories`, `storage_locations`, `waste_records` |
| Fichaje | `fichaje`, `fichaje_breaks`, `fichaje_incidents` |
| CRM | `crm_customers`, `gift_cards`, `loyalty_points`, `promotions`, `campaigns` |
| Backups | `backup_records`, `backup_schedules` |
| Auditoría | `audit_findings`, `audit_runs` |
| Instalación | `installation_devices`, `network_registry`, `manuals` |
| RRHH | `contracts`, `payroll_records`, `absences`, `evaluations` |

## API

- **Base URL**: `/api`
- **Autenticación**: JWT Bearer — `requireAuth` middleware
- **Control de acceso**: `requireRole(...roles)` con roles: `admin`, `manager`, `encargado`, `waiter`, `cashier`
- **~60 ficheros de rutas** con ~59 grupos registrados
- **Codegen**: la spec OpenAPI en `lib/api-spec/` genera automáticamente hooks React (`lib/api-client-react/`) y schemas Zod (`lib/api-zod/`)
- **CI**: `scripts/check-codegen.sh` verifica que los tipos generados están en sync con la spec

### Rutas de monitorización
| Endpoint | Auth | Descripción |
|----------|------|-------------|
| `GET /healthz` | Público | Health check básico |
| `GET /diagnostics/status` | manager+ | Estado completo del sistema |
| `GET /diagnostics/connectivity` | manager+ | Latencia BD, uptime |
| `GET /diagnostics/events` | manager+ | Log de eventos técnicos |
| `POST /diagnostics/maintenance` | admin | Tarea de mantenimiento |
| `GET /admin/system/version` | manager+ | Versión, changelog, migraciones |
| `GET /admin/audit/modules` | manager+ | Estado de los 56 módulos |
| `POST /admin/audit/run` | admin | Ejecutar auditoría automática |

## Decisiones arquitectónicas

- **Orval está roto en este entorno** (v8.21 no puede cargar la config). Los ficheros generados se editan manualmente y luego se reconstruye con `tsc --build lib/api-client-react`. Ver `.agents/memory/orval-codegen-workaround.md`.
- **Express params**: siempre usar `const id = req.params.id as string` — sin cast da `string | string[]` que rompe Drizzle `eq()`.
- **Reconstrucción de lib/db**: tras cambios de esquema, ejecutar `tsc --build lib/db` antes de que api-server compile.
- **Imports React (no Preact)**: en el frontend usar siempre `import { useState } from 'react'`, no `preact/hooks`.
- **SVG attrs**: en TSX usar camelCase (`strokeWidth`, no `stroke-width`).
- **Zod en api-server**: añadir `zod` explícitamente a las deps de `api-server/package.json` — no se hereda del workspace.

## Seguridad

- JWT firmado con `SESSION_SECRET` (env secret, nunca en código)
- CORS: solo orígenes Replit + `ALLOWED_ORIGINS`
- Rate limiting: aplicado en rutas de autenticación (`express-rate-limit`)
- Sin secretos hardcodeados detectados
- Sin permisos granulares por acción (pendiente — ver `PRODUCTION_REPORT.md`)
- Auditoría de accesos: `techEventsTable` registra eventos críticos

## Tests

- **31 suites Vitest** en `artifacts/api-server/`
- Cubren: allergens, cash-machine, delivery, CRM, goods-receipts, tax, installation, simulation
- Ejecutar: `pnpm --filter @workspace/api-server run test`
- CI pre-publicación: `scripts/check-codegen.sh` + type-check + tests

## Preferencias del usuario

- Idioma de la interfaz: español
- Sin emojis en respuestas
- Código TypeScript estricto, sin `any` salvo en interop de drizzle
- Todos los módulos deben respetar el sistema de roles existente
- Las migraciones deben ser idempotentes (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
- No romper módulos existentes al añadir nuevos

## Notas operativas (Gotchas)

- **Reconstruir lib/db** después de cada cambio de esquema: `tsc --build lib/db`
- **Codegen manual**: editar los ficheros generados directamente, luego `tsc --build lib/api-client-react`
- **Migraciones**: aplicar con `pnpm --filter @workspace/db run push` (dev) o SQL directo (producción)
- **Socket.io**: el servidor HTTP se crea en `index.ts`, no en `app.ts` — no mover
- **Workers**: print-worker, backup-worker y verifactu-worker arrancan automáticamente en `index.ts`
- **Seeder de demo**: `POST /api/admin/demo-data/seed` crea datos de prueba; usar `isDemo: true` en órdenes de simulación
