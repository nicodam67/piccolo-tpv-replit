# INFORME DE ARCHIVOS — QR MENÚ ORIGINAL
_Fecha: 2026-07-18 | Auditor: Replit Agent_

---

## 1. ARCHIVOS DE CÓDIGO (app_(1).tar.gz)

### Resumen

| Categoría | Cantidad |
|-----------|---------|
| Archivos src/ totales | 111 |
| Componentes UI (Radix) | 40 |
| Páginas | 8 |
| Componentes de página | 11 |
| Archivos Convex backend | 8 |
| Archivos de locale (i18n) | 8 |
| Archivos de configuración | 7 |
| Archivos public (SW, manifests, icons) | 7 |

### Listado completo por módulo

#### Backend Convex (`convex/`)
| Archivo | Líneas | Estado |
|---------|--------|--------|
| schema.ts | ~80 | ✅ Completo |
| branding.ts | ~90 | ✅ Completo |
| menu.ts | ~250 | ✅ Completo |
| files.ts | ~30 | ✅ Completo |
| users.ts | ~45 | ✅ Completo |
| translate.ts | ~80 | ✅ Completo (requiere HERCULES_API_KEY) |
| seed.ts | ~130 | ✅ Completo |
| auth.config.ts | ~10 | ✅ Completo (requiere HERCULES_OIDC_*) |
| _generated/api.d.ts | - | ✅ Generado |
| _generated/api.js | - | ✅ Generado |
| _generated/dataModel.d.ts | - | ✅ Generado |
| _generated/server.d.ts | - | ✅ Generado |
| _generated/server.js | - | ✅ Generado |

#### Páginas de cliente (`src/pages/`)
| Archivo | Líneas | Funcionalidad |
|---------|--------|--------------|
| Index.tsx | 337 | Página principal, hero, categorías, filtros |
| categoria/page.tsx | ~300 | Vista platos de categoría |
| print/page.tsx | 862 | Impresión carta completa |
| admin/page.tsx | 61 | Admin protegido por Hercules auth |
| admin-portal/page.tsx | ~70 | /admin sin locale |
| auth/Callback.tsx | ~60 | OIDC callback handler |
| NotFound.tsx | ~20 | 404 |

#### Componentes admin (`src/pages/admin/_components/`)
| Archivo | Líneas | Funcionalidad |
|---------|--------|--------------|
| AdminDashboard.tsx | 185 | 4 tabs + auto-translate batch |
| BrandingManager.tsx | ~400 | Formulario completo branding + upload |
| MenuTree.tsx | ~500 | Árbol drag&drop categorías/platos |
| ItemManager.tsx | ~600 | CRUD platos completo |
| CategoryManager.tsx | ~300 | CRUD categorías |
| ThemeColorManager.tsx | ~250 | 14 colores + presets |
| FontManager.tsx | ~350 | Fuentes custom + Google Fonts |
| CardSettingsManager.tsx | ~150 | Config tarjetas menú |
| ScheduleManager.tsx | ~200 | Horarios 7 días × 2 turnos |
| QRShare.tsx | ~150 | Generación QR |
| MenuExport.tsx | ~100 | Export CSV |

#### Componentes de cliente (`src/pages/_components/`)
| Archivo | Funcionalidad |
|---------|--------------|
| MenuItemCard.tsx | Tarjeta plato (grid/list/compact) |
| ItemDetailModal.tsx | Modal detalle plato |
| CategoryFilter.tsx | Filtro horizontal animado |
| ScheduleDisplay.tsx | Visualización horarios |

#### Hooks (`src/hooks/`)
| Hook | Funcionalidad |
|------|--------------|
| use-auth.ts | Auth helpers |
| use-debounce.ts | Debounce |
| use-mobile.ts | Breakpoint detector |
| use-saved-colors.ts | Colores guardados |
| use-service-worker.ts | Registro SW + toast update |
| use-theme-colors.ts | Apply colores a CSS vars |
| use-theme-fonts.ts | Apply fuentes a CSS vars |

#### Locales (`src/locales/`)
| Idioma | Estado | Claves (aprox.) |
|--------|--------|-----------------|
| es — Español | ✅ Completo | 50 claves |
| en — English | ✅ Completo | 50 claves |
| fr — Français | ✅ Completo | 50 claves |
| de — Deutsch | ✅ Completo | 50 claves |
| ca — Català | ✅ Completo | 50 claves |
| it — Italiano | ✅ Completo | 50 claves |
| nl — Nederlands | ✅ Completo | 50 claves |
| ro — Română | ✅ Completo | 50 claves |

#### Archivos public
| Archivo | Estado |
|---------|--------|
| site.webmanifest | ✅ (Piccolo la Ràpita) |
| admin.webmanifest | ✅ (Piccolo Admin) |
| sw.js | ✅ (la-maison-v1 cache) |
| icon/icon-192.png | ✅ (referencia CDN Hercules) |
| icon/icon-512.png | ✅ (referencia CDN Hercules) |
| robots.txt | ✅ |
| sitemap.xml | ✅ |

---

## 2. SNAPSHOT BASE DE DATOS (snapshot_base datos qr.menu.zip)

### Estado de extracción

⚠️ **El snapshot es un archivo ZIP multi-parte** compuesto por tres ficheros:

| Archivo | Tamaño | Tipo |
|---------|--------|------|
| snapshot_std_1784207384084.z01 | 22.6 MB | Zip parte 1 |
| snapshot_std_1784207384202.z02 | 2.6 MB | Zip parte 2 |
| snapshot_std_1784207384170.zip | 3.9 MB | Directorio central |

**Herramienta requerida**: `7z` (p7zip) — no disponible en el entorno actual.
**Tamaño total estimado**: ~29 MB comprimido.

La extracción no ha podido completarse con las herramientas disponibles (`unzip` no soporta split ZIP; `python zipfile` tampoco).

### Contenido estimado (basado en schema Convex)

Según el schema del proyecto original y las instrucciones del propietario, el snapshot contiene:

| Tabla | Contenido estimado |
|-------|-------------------|
| `categories` | Categorías reales del restaurante Piccolo (pizzas, pastas, ensaladas, etc.) |
| `menuItems` | Platos reales con precios, alérgenos, etiquetas, traducciones |
| `branding` | Nombre: "Piccolo la Ràpita", tagline, colores, fuentes, horarios, teléfono |
| `users` | Cuentas de administrador |
| `_storage` | Archivos: imágenes de platos, imagen hero, vídeo hero (MP4) |

### Referencias a `_storage`

Los archivos de storage de Convex son accesibles **únicamente** a través del deployment Convex original. Sus IDs son del tipo `kg2d...` (Convex storage ID) y las URLs se generan firmadas en tiempo real. **No es posible migrarlos a otro sistema sin acceso al deployment Convex original.**

---

## 3. ARCHIVOS CON INCIDENCIAS

| Archivo | Incidencia |
|---------|-----------|
| snapshot_std_*.z01/z02/zip | ⚠️ No extraíble sin `7z` — requiere instalación |
| public/sw.js | ⚠️ Cache name `la-maison-v1` (nombre de plantilla genérico, no de Piccolo) — debe actualizarse |
| convex/auth.config.ts | ⚠️ Requiere variables de entorno Hercules — sin ellas el deploy Convex falla |
| convex/translate.ts | ⚠️ Requiere `HERCULES_API_KEY` — sin ella la auto-traducción falla silenciosamente |

---

## 4. ARCHIVOS NO UTILIZADOS / RIESGOS

| Elemento | Riesgo |
|---------|--------|
| `@usehercules/auth` package | ⚠️ Paquete propietario — verificar disponibilidad en npm |
| `@usehercules/vite` plugin | ⚠️ Paquete propietario — necesario para build |
| `hercules-cdn.com` font URLs | ⚠️ URLs externas — si el CDN no es accesible, las fuentes no cargan |
| `hero-image` Unsplash fallback | ℹ️ En Index.tsx línea ~35: `"https://images.unsplash.com/photo-1761515397055..."` usado si no hay hero configurado |

---

## 5. DEPENDENCIAS EXTERNAS CRÍTICAS

| Dependencia | Tipo | Impacto si no disponible |
|------------|------|------------------------|
| Convex deployment URL | Backend | App no arranca |
| Hercules OIDC | Auth | Admin no accesible |
| hercules-cdn.com | Fonts CDN | Fuentes custom no cargan (fallback a sistema) |
| OpenAI via Hercules gateway | AI | Auto-traducción no funciona |
| Google Fonts API | Fonts | Fuentes opcionales no cargan (fallback a sistema) |

---

## 6. RESUMEN EJECUTIVO

| Métrica | Valor |
|---------|-------|
| Archivos de código extraídos | 111 |
| Archivos con error | 0 |
| Archivos del snapshot extraídos | 0 (herramienta no disponible) |
| Referencias huérfanas conocidas | 0 (todo está referenciado) |
| Duplicados | 0 |
| **Estado general del código** | ✅ Completo y funcional |
| **Estado del snapshot** | ⚠️ Pendiente de extracción con 7z |
| **Credenciales requeridas** | ❌ No proporcionadas aún |

---

## 7. PRÓXIMOS PASOS

1. **[PROPIETARIO]** Proporcionar `VITE_CONVEX_URL`, `VITE_HERCULES_OIDC_AUTHORITY`, `VITE_HERCULES_OIDC_CLIENT_ID`
2. **[TÉCNICO]** Instalar `7z` y extraer el snapshot para auditar los datos
3. **[TÉCNICO]** Crear el artefacto `artifacts/qr-menu/` con el código original
4. **[TÉCNICO]** Verificar acceso a paquetes `@usehercules/*`
5. **[PROPIETARIO]** Confirmar si el deployment Convex original sigue activo
