# AUDITORÍA QR MENÚ ORIGINAL — Piccolo la Ràpita
_Fecha: 2026-07-18 | Auditor: Replit Agent_

---

## 1. ARQUITECTURA DEL PROYECTO ORIGINAL

### Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + Vite 7 + TypeScript 5.9 |
| Backend / Base de datos | **Convex** v1.37 (BaaS real-time) |
| Autenticación | `@usehercules/auth` (Hercules OIDC) |
| Estilos | Tailwind CSS v4 + `tw-animate-css` |
| Routing | `react-router-dom` v7 |
| Internacionalización | `i18next` + `react-i18next` |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Formularios | `react-hook-form` + `zod` |
| Animaciones | `motion` (Framer Motion v12) |
| QR codes | `qrcode` |
| CSV export | `papaparse` |
| AI traducción | `openai` → Hercules AI gateway |
| PWA | Service Worker manual (`sw.js`) + dos manifests |
| Bundler plugins | `@usehercules/vite`, `@vitejs/plugin-react-swc` |

### Configuración Vite (original)
```ts
server: { host: "0.0.0.0", port: 5173, allowedHosts: true }
resolve.alias: { "@/convex": "./convex", "@": "./src" }
plugins: [react(), tailwindcss(), hercules()]
```

---

## 2. ESTRUCTURA DE CARPETAS

```
/
├── convex/                     # Backend Convex
│   ├── schema.ts               # Definición de tablas
│   ├── branding.ts             # Queries/mutations branding
│   ├── menu.ts                 # Queries/mutations menú
│   ├── files.ts                # Upload/delete archivos
│   ├── users.ts                # Gestión usuarios
│   ├── translate.ts            # Auto-traducción via OpenAI
│   ├── seed.ts                 # Datos de muestra
│   ├── auth.config.ts          # Config OIDC (Hercules)
│   └── _generated/             # Generado por Convex CLI
├── public/
│   ├── site.webmanifest        # PWA clientes
│   ├── admin.webmanifest       # PWA administradores
│   ├── sw.js                   # Service Worker
│   ├── icon/                   # icon-192.png, icon-512.png
│   ├── robots.txt
│   └── sitemap.xml
└── src/
    ├── App.tsx                 # Router principal
    ├── i18n.ts                 # Config i18next + 8 idiomas
    ├── index.css               # Tailwind + custom fonts CDN
    ├── main.tsx                # Entry point
    ├── components/
    │   ├── InstallBanner.tsx   # Banner instalación PWA
    │   ├── providers/          # ConvexProvider, AuthProvider, ThemeProvider…
    │   └── ui/                 # 40+ componentes Radix UI
    ├── hooks/
    │   ├── use-auth.ts
    │   ├── use-service-worker.ts
    │   ├── use-theme-colors.ts
    │   └── use-theme-fonts.ts
    ├── lib/
    │   ├── allergens.ts        # 14 alérgenos EU
    │   ├── dietary-tags.ts     # vegetarian, vegan, gluten-free, spicy
    │   ├── theme.ts            # applyThemeColors, applyThemeFonts
    │   ├── translations.ts     # localize(), localizeCategory()
    │   └── utils.ts            # cn()
    ├── locales/
    │   ├── es/common.json
    │   ├── en/common.json
    │   ├── fr/common.json
    │   ├── de/common.json
    │   ├── ca/common.json
    │   ├── it/common.json
    │   ├── nl/common.json
    │   └── ro/common.json
    └── pages/
        ├── Index.tsx           # Página principal clientes (337 líneas)
        ├── NotFound.tsx
        ├── _components/
        │   ├── MenuItemCard.tsx     # Tarjeta plato (grid/list/compact)
        │   ├── ItemDetailModal.tsx  # Modal detalle plato
        │   ├── CategoryFilter.tsx   # Filtro horizontal categorías
        │   └── ScheduleDisplay.tsx  # Horarios por turnos
        ├── categoria/
        │   └── page.tsx            # Vista productos de categoría
        ├── print/
        │   └── page.tsx            # Impresión carta (862 líneas)
        ├── admin/
        │   ├── page.tsx            # Admin protegido por /:lng/admin
        │   └── _components/
        │       ├── AdminDashboard.tsx    # 4 tabs + auto-translate
        │       ├── BrandingManager.tsx   # Formulario branding completo
        │       ├── MenuTree.tsx          # Árbol draggable categorías+platos
        │       ├── ItemManager.tsx       # CRUD platos + traducciones
        │       ├── CategoryManager.tsx   # CRUD categorías
        │       ├── ScheduleManager.tsx   # Horarios por turnos
        │       ├── ThemeColorManager.tsx # Paleta colores + presets
        │       ├── FontManager.tsx       # Selector fuentes (custom + Google)
        │       ├── CardSettingsManager.tsx # Config tarjetas
        │       ├── QRShare.tsx           # Generación QR + compartir
        │       └── MenuExport.tsx        # Export CSV
        ├── admin-portal/
        │   └── page.tsx            # /admin (sin locale) → igual que admin pero root
        └── auth/
            └── Callback.tsx        # OIDC callback
```

---

## 3. MODELO DE DATOS — TABLAS CONVEX

### `users`
| Campo | Tipo | Notas |
|-------|------|-------|
| tokenIdentifier | string | índice único |
| name | string? | del identity OIDC |
| email | string? | del identity OIDC |

### `categories`
| Campo | Tipo | Notas |
|-------|------|-------|
| name | string | nombre base (sin traducir) |
| description | string? | descripción base |
| order | number | posición drag&drop |
| parentId | id("categories")? | soporte subcategorías |
| available | boolean? | visible en menú público |
| translations | record? | `{ fr: { name, description }, … }` |

### `branding`
| Campo | Tipo | Notas |
|-------|------|-------|
| restaurantName | string | |
| tagline | string? | |
| heroImageUrl | string? | URL externa |
| heroImageStorageId | id("_storage")? | Convex Storage |
| heroVideoUrl | string? | URL externa |
| heroVideoStorageId | id("_storage")? | Convex Storage |
| address, city, province, postalCode, country | string? | |
| hours | string? | texto libre (no usado en producción) |
| establishedYear | string? | |
| phone | string? | |
| themeColors | object? | 14 variables de color |
| themeFonts | object? | heading, body, headingColor, bodyColor |
| cardSettings | object? | showImage, showDescription, layout… |
| schedule | array? | 7 días × 2 turnos |

### `menuItems`
| Campo | Tipo | Notas |
|-------|------|-------|
| categoryId | id("categories") | referencia FK |
| name | string | nombre base |
| description | string? | |
| price | number | |
| imageUrl | string? | URL externa |
| imageStorageId | id("_storage")? | Convex Storage |
| videoUrl | string? | URL externa |
| videoStorageId | id("_storage")? | Convex Storage |
| quantity | string? | ej. "200g" |
| available | boolean | |
| order | number | drag&drop |
| tags | string[]? | vegetarian, vegan, gluten-free, spicy |
| halfPortionPrice | number? | media ración |
| allergens | string[]? | 14 alérgenos EU |
| translations | record? | `{ fr: { name, description }, … }` |

**Índices**: `by_category`, `by_category_and_available`

### `_storage` (Convex nativo)
Almacenamiento de archivos binarios. Las imágenes y vídeos subidos se guardan aquí y se resuelven a URL firmada en tiempo de query.

---

## 4. RUTAS DEL PROYECTO ORIGINAL

| Ruta | Componente | Acceso |
|------|-----------|--------|
| `/` | RootRedirect | público → redirige a `/:lng` |
| `/:lng` | Index.tsx | público |
| `/:lng/categoria/:categoryId` | CategoriaPage | público |
| `/:lng/admin` | AdminPage | protegido (Hercules OIDC) |
| `/admin` | AdminPortalPage | protegido (Hercules OIDC) |
| `/auth/callback` | AuthCallback | OIDC redirect handler |
| `/imprimir` | PrintPage | público |
| `/:lng/imprimir` | PrintPage | público |

---

## 5. PANTALLAS Y FUNCIONES

### Vista cliente (público, sin login)
| Pantalla | Funcionalidad |
|---------|--------------|
| Home (`/:lng`) | Hero con imagen/vídeo, grid de categorías, filtros alérgenos/etiquetas, botón llamada flotante, botón horario flotante, selector idioma, modal detalle plato, banner instalación PWA |
| Categoría (`/:lng/categoria/:id`) | Lista/grid/compact de platos filtrados, subcategorías, filtros alérgenos/etiquetas, modal detalle |
| Imprimir (`/imprimir`) | Carta completa para impresión, panel lateral con opciones (colores, fuentes, idioma, categorías, mostrar/ocultar elementos) |

### Vista administrador (Hercules OIDC)
| Tab | Funcionalidad |
|-----|--------------|
| **Menú** | Árbol drag&drop de categorías y platos, create/edit/delete categorías, create/edit/delete platos, subida de imágenes y vídeos, traducciones por idioma |
| **Branding** | Nombre restaurante, tagline, imagen/vídeo hero (URL o upload), dirección, teléfono, año fundación, paleta colores (14 variables + presets), fuentes (custom CDN + Google Fonts), config tarjetas, horarios por turnos |
| **QR & Share** | Generación de código QR del menú, opciones de compartir |
| **Exportar** | Export CSV de todos los platos (UTF-8 BOM para Excel) |

---

## 6. SISTEMA DE AUTENTICACIÓN

- **Proveedor**: Hercules OIDC (`@usehercules/auth`)
- **Flujo**: Authorization Code + PKCE
- **Variables requeridas**:
  - `VITE_HERCULES_OIDC_AUTHORITY` — URL del servidor OIDC
  - `VITE_HERCULES_OIDC_CLIENT_ID` — Client ID de la app
  - `VITE_HERCULES_OIDC_REDIRECT_URI` — callback URL
  - `VITE_HERCULES_OIDC_SCOPE` — scopes (openid profile email offline_access)
  - `HERCULES_API_KEY` — para el backend Convex (traducciones OpenAI)
- **Acceso sin login**: Toda la vista cliente es pública (useQuery sin auth)
- **Acceso admin**: `Authenticated` de Convex + `requireAdmin()` en mutaciones

---

## 7. SISTEMA DE INTERNACIONALIZACIÓN

- **Librería**: i18next + react-i18next
- **8 idiomas**: es, en, fr, de, ca, it, nl, ro
- **Routing basado en locale**: `/:lng/…`
- **Locale guardado**: `localStorage.setItem("locale", lng)`
- **Traducciones de UI**: archivos JSON en `src/locales/:lng/common.json`
- **Traducciones de contenido**: campo `translations` en cada categoría y plato (record por locale)
- **Auto-traducción**: action Convex `translate.autoTranslate` → OpenAI GPT via Hercules gateway
- **Regla especial**: Los nombres de platos NO se traducen (solo descripciones); los nombres de categorías SÍ se traducen

---

## 8. SISTEMA PWA

| Archivo | Propósito |
|---------|-----------|
| `public/site.webmanifest` | PWA para clientes (`start_url: "/"`, display: standalone) |
| `public/admin.webmanifest` | PWA para admin (`start_url: "/admin"`, display: standalone) |
| `public/sw.js` | Service Worker: install, fetch (network-first), activate |
| `public/icon/icon-192.png` | Icono PWA 192px |
| `public/icon/icon-512.png` | Icono PWA 512px |

El SW cachea la raíz y los iconos en instalación. Estrategia network-first. Nunca intercepta rutas `/auth/**`.

---

## 9. SISTEMA DE IMÁGENES Y VÍDEOS

- **Convex Storage**: upload via `generateUploadUrl()` mutation → POST directo al storage → guardar `storageId`
- **Resolución de URLs**: en tiempo de query (`ctx.storage.getUrl(storageId)`) → URL firmada temporal
- **Fallback**: si hay `storageId`, la URL generada sobreescribe `imageUrl`/`videoUrl`
- **Hero video**: soportado en branding → `<video autoPlay loop muted playsInline>`
- **Formatos item**: imagen o vídeo por plato
- **CDN fuentes personalizadas**: `https://hercules-cdn.com/file_*` (ZapfChan, AvantGarde, Algerian, etc.)

---

## 10. SISTEMA DE IMPRESIÓN (862 líneas)

La página de impresión es el componente más complejo del proyecto. Incluye:
- Panel lateral con 5 tabs: Elementos | Colores | Fuentes | Idioma | Páginas
- Control de elementos visibles: cabecera, descripción categoría, nombre plato, descripción, precio, media ración, cantidad, etiquetas, alérgenos, footer
- Control de colores: fondo, título categoría, nombre plato, descripción, precio, bordes
- Control de fuentes: heading + body separados, restaurar desde branding
- Control de tamaño de texto: pequeño/normal/grande
- Selector de idioma de impresión (8 idiomas)
- Selector de categorías a incluir
- Paginación visual ("— nueva página —")
- Traducciones estáticas de alérgenos y tags en 8 idiomas (embebidas en el componente)
- CSS `@media print` para ocultar panel lateral

---

## 11. FUENTES PERSONALIZADAS

El proyecto usa fuentes propietarias alojadas en `hercules-cdn.com`:

| Nombre | URL CDN | Uso |
|--------|---------|-----|
| ZapfChan Dm | `file_wcGGxdhmcY2DhGJwliFkA2Zk` | `--font-serif` (títulos) |
| ZapfChan Md | `file_m7I6BY3ReSetMGf7AFZss0PC` | `--font-menu` |
| AvantGarde Bk | `file_uqU2VMlywYy4NMAsQ7WtxSwQ` | `--font-sans` (body) |
| American Text BT | `file_gbeYYgRhfigXSrnw8dJ0hCA3` | `--font-script` |
| Algerian | `file_XRcUszIICfe5N0l0B0EiHqeN` | `--font-display` |

El administrador puede elegir fuentes adicionales de Google Fonts (Playfair Display, Lora, Cormorant Garamond, Raleway, Montserrat, etc.) y aplicarlas dinámicamente via CSS custom properties.

---

## 12. VARIABLES DE ENTORNO REQUERIDAS

### Frontend (Vite — `VITE_*`)
| Variable | Descripción |
|----------|-------------|
| `VITE_CONVEX_URL` | URL del deployment Convex (ej: `https://xxx.convex.cloud`) |
| `VITE_HERCULES_OIDC_AUTHORITY` | URL servidor OIDC Hercules |
| `VITE_HERCULES_OIDC_CLIENT_ID` | Client ID de la app |
| `VITE_HERCULES_OIDC_REDIRECT_URI` | Callback URL (ej: `https://dominio.com/auth/callback`) |
| `VITE_HERCULES_OIDC_SCOPE` | (opcional, default: openid profile email offline_access) |
| `VITE_HERCULES_OIDC_PROMPT` | (opcional, default: select_account) |
| `VITE_HERCULES_OIDC_RESPONSE_TYPE` | (opcional, default: code) |

### Backend Convex
| Variable | Descripción |
|----------|-------------|
| `HERCULES_OIDC_AUTHORITY` | Mismo que frontend pero para el servidor Convex |
| `HERCULES_OIDC_CLIENT_ID` | Mismo que frontend |
| `HERCULES_API_KEY` | API key para el gateway AI de Hercules (auto-traducción) |

---

## 13. DIFERENCIAS FRENTE AL QR MENÚ ACTUAL DE REPLIT

| Aspecto | Original (Convex/Hercules) | Actual en Piccolo TPV |
|---------|--------------------------|----------------------|
| Backend | Convex (BaaS real-time) | Express + PostgreSQL |
| Auth | Hercules OIDC | JWT/PIN (sesión TPV) |
| Tablas | categories, menuItems, branding, users | products, categories, business_config |
| Tiempo real | Sí (WebSocket Convex) | No |
| Traducciones | 8 idiomas en BD + auto-translate IA | Sin implementar realmente |
| Routing público | `/:lng`, `/:lng/categoria/:id` | `/carta`, `/carta/categoria/:id` |
| Routing admin | `/:lng/admin` o `/admin` | `/admin/qr-menu` |
| Imágenes | Convex Storage (upload directo) | URL externa o Object Storage |
| Vídeo hero | Sí (upload a Convex Storage) | Sí (URL externa) |
| Impresión | 862 líneas, panel completo, 8 idiomas | Básica |
| PWA | 2 manifests + SW manual | No |
| Auto-traducción IA | Sí (OpenAI via Hercules) | Placeholder (no funcional) |
| Fonts custom | ZapfChan, AvantGarde, Algerian (CDN) | Heredadas del TPV |
| Seed automático | Sí (seedIfEmpty al cargar) | No |
| Subcategorías | Sí (parentId) | No |
| Export CSV | Sí (Papa.parse, UTF-8 BOM) | Básico |

---

## 14. RIESGOS DE INTEGRACIÓN

| Riesgo | Severidad | Descripción |
|--------|-----------|-------------|
| **R1 — Credenciales Hercules** | 🔴 CRÍTICO | Sin `VITE_CONVEX_URL`, `VITE_HERCULES_OIDC_AUTHORITY`, `VITE_HERCULES_OIDC_CLIENT_ID` el app no puede arrancar. Deben ser proporcionadas por el propietario. |
| **R2 — Datos Convex** | 🔴 CRÍTICO | Los datos (categorías, platos, branding, imágenes) están en la BD Convex del deployment original. Sin el deployment real no hay datos. |
| **R3 — Two catalogs** | 🟡 ALTO | El TPV usa PostgreSQL y el QR Menú usaría Convex. Son dos catálogos separados que podrían desincronizarse. Requiere estrategia de sincronización. |
| **R4 — Storage IDs** | 🟡 ALTO | Las imágenes en el snapshot usan IDs de Convex Storage. Solo son accesibles en el deployment Convex original. |
| **R5 — Hercules CDN fonts** | 🟠 MEDIO | Las fuentes custom están en `hercules-cdn.com`. Si el propietario no tiene acceso a ese CDN, hay que re-hospedar las fuentes. |
| **R6 — `@usehercules/*` paquetes** | 🟠 MEDIO | `@usehercules/auth`, `@usehercules/vite` son paquetes propietarios del ecosistema Hercules. Si no están en npm público puede haber problemas de instalación. |
| **R7 — Conflicto puertos** | 🟢 BAJO | El original usa port 5173; en el monorepo deberá leer `process.env.PORT`. |
| **R8 — React 19 vs monorepo** | 🟢 BAJO | El original usa React 19; el monorepo ya usa React 18/19 según el artefacto. |

---

## 15. ESTRATEGIA RECOMENDADA DE INTEGRACIÓN

### Fase 1 (Inmediata): Crear artefacto separado

El QR Menú original es una app autónoma. La estrategia correcta es:

```
Piccolo TPV (/piccolo-tpv)
└── "Carta y Cocina" hub
    └── Botón "QR Menú" → abre /qr-menu (URL del artefacto)

/qr-menu (artifacts/qr-menu/)
├── Vista cliente: /:lng, /:lng/categoria/:id
├── Vista admin: /admin
├── Backend: Convex (instancia original del propietario)
└── Auth: Hercules OIDC
```

**Pendiente del propietario**: Las credenciales de Convex y Hercules son imprescindibles para que el app funcione.

### Fase 2 (Posterior): Sincronización de datos

Ver `docs/COMPARACION-VISUAL-QR-MENU.md` y estrategia de datos en sección 16.

---

## 16. ESTRATEGIA DE DATOS — RECOMENDACIÓN

**Recomendación: Opción A — Fuente maestra en Convex, sincronización hacia PostgreSQL**

| Parámetro | Detalle |
|-----------|---------|
| Fuente maestra | Convex (QR Menú) — es donde el propietario gestiona categorías, platos e imágenes con la UI original |
| Destino | PostgreSQL (TPV) — recibe los datos via webhook o polling |
| Sincronización | Un webhook Convex → API del TPV cuando cambian productos/categorías |
| Conflictos | El TPV puede añadir campos adicionales (food cost, stock) sin tocar el catálogo maestro |
| Imágenes | Las URLs de Convex Storage son temporales; el TPV debería guardar las URLs públicas cuando estén disponibles |

**Esta estrategia NO debe implementarse hasta que el QR Menú original esté funcionando.**

---

## 17. PROCEDIMIENTO DE RESTAURACIÓN (ROLLBACK)

Para volver al QR Menú actual de Replit:
1. El código actual se conserva íntegro en `artifacts/piccolo-tpv/src/pages/qr-menu/`
2. Las rutas en `App.tsx` ya están definidas
3. La tabla `business_config` en PostgreSQL contiene los datos actuales de branding
4. No se borra ningún código hasta confirmación del propietario

---

## 18. PENDIENTE DE PROPIETARIO

Para avanzar con la integración real se necesita:

1. ✅ Código original — `app_(1).tar.gz` — **recibido**
2. ❓ `VITE_CONVEX_URL` — URL del deployment Convex activo
3. ❓ `VITE_HERCULES_OIDC_AUTHORITY` — URL servidor OIDC
4. ❓ `VITE_HERCULES_OIDC_CLIENT_ID` — Client ID
5. ❓ Snapshot base de datos — `snapshot_base datos qr.menu.zip` — mencionado pero archivo multi-parte no accesible con herramientas disponibles (ver informe archivos)
6. ❓ Confirmación: ¿el deployment Convex original sigue activo y tiene datos?
7. ❓ ¿El dominio público actual del QR Menú está en `piccolo-la-rapita.onhercules.app`?
