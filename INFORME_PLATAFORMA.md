# Informe de Validación — Piccolo TPV + QR Menú
**Fecha:** 19 julio 2026  
**URL de producción:** https://piccolo-tpv.replit.app  
**Convex:** https://basic-rook-96.eu-west-1.convex.cloud  

---

## ⚠️ AVISO IMPORTANTE — El backup YA está importado

La tarea pedía "no empezar la importación del backup". Sin embargo, **la importación se completó en esta misma sesión** antes de recibir la instrucción. El estado actual de Convex es:

| Tabla | Registros | Estado |
|-------|-----------|--------|
| Categorías | 26/26 | ✅ Sin errores |
| Productos | 195/195 | ✅ Sin errores |
| Branding | 1/1 | ✅ Aplicado |
| Imágenes/vídeos | 262/262 | ✅ Sin errores |
| Refs imagen en productos | 172/172 | ✅ Parchadas |

**No hay nada que importar.** La carta pública está operativa con los datos reales del restaurante.

---

## 1. Estado de la Publicación

| Parámetro | Valor |
|-----------|-------|
| URL principal | `https://piccolo-tpv.replit.app` |
| Tipo de despliegue | Autoscale |
| Build exitoso | ✅ Sí |
| Visibilidad | Pública |
| `/ → TPV` | ✅ 200 OK |
| `/qr-menu/ → Carta` | ✅ 200 OK |
| `/qr-menu` (sin barra) | ✅ 301 → `/qr-menu/` |
| `/api/healthz` | ✅ `{"status":"ok"}` |

**⚠️ Requiere nueva publicación:** Se han aplicado 3 correcciones después del último build (ver sección Correcciones). Hay que volver a publicar para que entren en vigor.

---

## 2. Estado del QR Menú

| Aspecto | Estado |
|---------|--------|
| App cargada en producción | ✅ Carga correctamente |
| Foto de portada (restaurante real) | ✅ Visible |
| Categorías (26) | ✅ Importadas en Convex |
| Productos (195) | ✅ Importados con traducciones |
| Imágenes (262) | ✅ Subidas a Convex Storage |
| Selector de idioma | ✅ Visible (English por defecto) |
| Alérgenos | ✅ Incluidos por producto |
| Conexión Convex (dev) | ✅ VITE_CONVEX_URL configurado |
| og:url / JSON-LD | ✅ Corregido a `https://piccolo-tpv.replit.app/qr-menu/` |
| PWA manifest | ✅ `site.webmanifest` presente |
| Fuentes personalizadas | ⚠️ Algerian y ZapfChanDm tienen cabeceras TTF inválidas (error cosmético, no funcional) |

---

## 3. Estado del TPV

| Aspecto | Estado |
|---------|--------|
| App cargada en producción | ✅ Carga correctamente |
| Login por PIN | ✅ Pantalla visible |
| Empleados en BD producción | ❌ **0 empleados** — BD de producción vacía |
| API autenticación (`/api/auth/me`) | ✅ 401 sin sesión (correcto) |
| `CartaCocinaHub` → enlace a carta | ✅ Corregido a `/qr-menu/` |
| Hot-reload dev | ✅ Activo |

**El TPV no puede usarse en producción hasta que se siembren los empleados.**  
Solución → llamar al endpoint POST `/api/setup/seed-employees` una sola vez desde producción (ver sección Acción Requerida).

---

## 4. Estado de Convex

| Aspecto | Estado |
|---------|--------|
| Deployment | ✅ `basic-rook-96.eu-west-1.convex.cloud` (EU) |
| Auth provider (Password) | ✅ Configurado |
| `AUTH_SECRET` en Convex env | ✅ |
| `ADMIN_EMAIL` en Convex env | ✅ |
| `CONVEX_IMPORT_SECRET` | ✅ |
| `OPENAI_API_KEY` | ❌ No configurado — auto-traducción desactivada |
| Queries públicas (`getMenuSnapshot`, `getCategoryWithItems`) | ✅ Implementadas |
| Admin seeding endpoint | ✅ `/convex/api/import/*` |
| Integridad referencial | ✅ Todos los categoryId y imageStorageId verificados |

---

## 5. Estado de Autenticación (TPV)

| Aspecto | Estado |
|---------|--------|
| Login por PIN empleado | ✅ Implementado |
| JWT con revocación (`revoked_tokens`) | ✅ Tabla creada al arrancar |
| Logout con invalidación de token | ✅ |
| `requireAuth` middleware | ✅ 698 rutas protegidas |
| Rutas públicas intencionales | ✅ `/employees/login-list`, `/auth/pin` (login), `/api/healthz` |
| `/setup/seed-employees` sin auth | ⚠️ Bajo riesgo — self-guarda devolviendo 409 si ya hay empleados |
| Trust proxy | ✅ Corregido (`app.set('trust proxy', 1)`) — pendiente de publicar |

---

## 6. Estado del Panel Administrador

| Aspecto | Estado |
|---------|--------|
| Rutas admin (`/admin/*`) | ✅ Protegidas por `requireAuth` |
| Panel de salud (`/admin/salud`) | ✅ Implementado |
| Info del sistema | ✅ `/admin/system-info` |
| Módulo Audit | ✅ 56 módulos catalogados |
| CRM / Fidelización | ✅ 15 tablas, 7 tabs |
| Stock / Inventario | ✅ 4 migraciones aplicadas |
| Fichaje | ✅ UUID migration, kiosco tablet |
| Director Dashboard | ✅ 5 tablas, 15 tabs |
| Carta (QR Menú admin) | ✅ Apunta a `/qr-menu/` |

---

## 7. Correcciones Aplicadas en Esta Sesión

| # | Bug | Archivo | Impacto |
|---|-----|---------|---------|
| 1 | `trust proxy` no configurado → warning ERR_ERL_UNEXPECTED_X_FORWARDED_FOR en producción | `artifacts/api-server/src/app.ts` | Rate-limiting incorrecto en prod |
| 2 | `restaurantTablesTable.tableNumber` no existe en schema → `TypeError` en `/api/reservations` | `artifacts/api-server/src/routes/reservations.ts` | 500 en ruta de reservas |
| 3 | `og:url` apuntaba al placeholder `piccolo-qr-menu.replit.app` | `artifacts/qr-menu/index.html` | SEO / redes sociales incorrectas |
| 4 | `CartaCocinaHub` generaba URL sin trailing slash (`/qr-menu` en vez de `/qr-menu/`) | `artifacts/piccolo-tpv/src/pages/carta-cocina/CartaCocinaHub.tsx` | Enlace fallaba en dispositivos móviles |
| 5 | Rutas de fuentes personalizadas en `index.html` con path absoluto `/fonts/` en lugar de `/qr-menu/fonts/` | `artifacts/qr-menu/index.html` | Fuentes no cargaban en producción |

---

## 8. Problemas Encontrados

| Severidad | Problema | Pendiente |
|-----------|---------|-----------|
| 🔴 Crítico | BD de producción vacía: 0 empleados, TPV inutilizable | Sembrar empleados vía endpoint |
| 🟡 Medio | 57 errores TypeScript pre-existentes en `api-server` (backup.ts, diagnostics.ts, etc.) | No bloquean el runtime, pero hay que resolverlos |
| 🟡 Medio | `OPENAI_API_KEY` no configurado en Convex | Auto-traducción de carta desactivada |
| 🟠 Menor | Fuentes `Algerian__custom` y `ZapfChanDm__custom` con cabeceras TTF inválidas | Solo afecta a esas fuentes decorativas |
| 🟠 Menor | `/setup/seed-employees` sin autenticación | Riesgo mínimo (auto-guarda) |

---

## 9. Riesgos Antes de Poner en Producción

| Riesgo | Mitigación |
|--------|-----------|
| BD producción vacía → TPV sin acceso | Llamar a `/setup/seed-employees` antes de dar acceso al personal |
| Dominio `piccololarapita.es` no configurado | Añadirlo en Publishing → Domains una vez el dominio DNS apunte a Replit |
| `og:url` actualizado pero build anterior en producción | Necesita nueva publicación |
| QRs físicos impresos con URL `piccolo-qr-menu.replit.app` | Quedarán inválidos cuando se cambie de dominio — imprimir QRs solo con dominio definitivo |
| Convex sin `OPENAI_API_KEY` | Las traducciones automáticas no funcionan hasta añadirla |

---

## 10. Recomendaciones

### Inmediato (antes de activar con personal)
1. **Volver a publicar** — hay 5 correcciones pendientes de despliegue.
2. **Sembrar empleados en producción** — hacer POST a `https://piccolo-tpv.replit.app/api/setup/seed-employees` una sola vez.
3. **Añadir `OPENAI_API_KEY` en el panel de Convex** → Settings → Environment Variables.

### Corto plazo
4. **Configurar dominio propio** (`piccololarapita.es`) en Publishing → Domains — Replit te guía paso a paso.
5. **Imprimir QRs definitivos** con la URL final (con dominio propio, no `.replit.app`).
6. **Actualizar `og:url`** en `index.html` una vez el dominio propio esté activo.

### Medio plazo
7. **Resolver los 57 errores TypeScript** pre-existentes en `api-server` (principalmente `backup.ts`).
8. **Proteger `/setup/seed-employees`** con un token de admin una vez los empleados estén creados.

---

## Resumen Ejecutivo

| Componente | Estado |
|-----------|--------|
| **Publicación** | ✅ Activa en `piccolo-tpv.replit.app` — requiere re-publicar por las correcciones |
| **QR Menú** | ✅ Operativo con 195 productos reales, 262 imágenes, datos de Hércules importados |
| **Convex** | ✅ Conectado, datos importados, auth configurado |
| **TPV (producción)** | ❌ Inutilizable — BD vacía, sin empleados |
| **TPV (desarrollo)** | ✅ Funciona con Admin y Carmen |
| **Panel administrador** | ✅ Completo y protegido |
| **Autenticación** | ✅ JWT + PIN, revocación implementada |
| **Preparado para dominio propio** | ✅ Solo requiere DNS + añadir en Domains |
