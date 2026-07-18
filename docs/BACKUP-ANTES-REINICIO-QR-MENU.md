# BACKUP — Estado antes del reinicio del QR Menú

**Fecha:** 2026-07-18  
**Motivo:** La integración iframe del QR Menú ha fallado visualmente. Se elimina para reiniciar desde cero.

---

## 1. ARCHIVOS ORIGINALES CONSERVADOS (NO TOCAR)

| Archivo | Ruta | Estado |
|---------|------|--------|
| `app (1).tar.gz` | Raíz del proyecto | ✅ CONSERVADO — fuente original |
| `snapshot_base datos qr.menu.zip` | Raíz del proyecto | ✅ CONSERVADO — snapshot Convex |

---

## 2. ARCHIVOS CREADOS POR LA INTEGRACIÓN FALLIDA (ELIMINADOS)

### Eliminados definitivamente:
| Archivo | Ruta | Motivo |
|---------|------|--------|
| `QrMenuEmbed.tsx` | `artifacts/piccolo-tpv/src/pages/carta-cocina/QrMenuEmbed.tsx` | Componente iframe — fallido |

---

## 3. ARCHIVOS MODIFICADOS (RESTAURADOS)

### `artifacts/piccolo-tpv/src/App.tsx`
**Cambios revertidos:**
- Eliminado: `import QrMenuEmbed from './pages/carta-cocina/QrMenuEmbed';` (línea 118)
- Eliminada: ruta `/carta-cocina/qr` → `<QrMenuEmbed />`
- Añadido: `import QrMenuPlaceholder from './pages/carta-cocina/QrMenuPlaceholder';`
- Añadida: ruta limpia `/carta-cocina/qr-menu` → `<QrMenuPlaceholder />`

### `artifacts/piccolo-tpv/src/pages/carta-cocina/CartaCocinaHub.tsx`
**Cambios revertidos:**
- Eliminado: primer item QR_ITEMS `{ title: 'Carta QR', href: '/carta-cocina/qr' }` (navegación a iframe)
- Eliminada: lógica `isQrMain` que destacaba ese botón en azul
- Añadido: banner "QR Menú pendiente de reconstrucción" en la sección QR

### `artifacts/qr-menu/src/pages/Index.tsx`
**Cambio menor conservado:**
- Añadido `backgroundColor: '#1a0a08'` al `<header>` hero como fallback CSS.  
  Este cambio es correcto y no daña el original — el archivo fuente original está en `app (1).tar.gz`.

---

## 4. ARCHIVOS PRE-EXISTENTES NO TOCADOS

Estos archivos ya existían en el TPV ANTES de la integración fallida. No se han modificado:

| Archivo | Ruta | Descripción |
|---------|------|-------------|
| `QrMenuPage.tsx` | `src/pages/qr-menu/QrMenuPage.tsx` | Panel admin QR — pre-existente |
| `QrMenuLayout.tsx` | `src/pages/qr-menu/QrMenuLayout.tsx` | Layout QR — pre-existente |
| `TabMenuTree.tsx` | `src/pages/qr-menu/TabMenuTree.tsx` | Tab árbol menú — pre-existente |
| `TabBranding.tsx` | `src/pages/qr-menu/TabBranding.tsx` | Tab branding — pre-existente |
| `TabPreview.tsx` | `src/pages/qr-menu/TabPreview.tsx` | Tab preview — pre-existente |
| `TabQRShare.tsx` | `src/pages/qr-menu/TabQRShare.tsx` | Tab compartir QR — pre-existente |
| `TabIdiomas.tsx` | `src/pages/qr-menu/TabIdiomas.tsx` | Tab idiomas — pre-existente |
| `TabPrint.tsx` | `src/pages/qr-menu/TabPrint.tsx` | Tab imprimir — pre-existente |
| `types.ts` | `src/pages/qr-menu/types.ts` | Tipos QR — pre-existente |
| `admin-instalacion-qr.tsx` | `src/pages/admin-instalacion-qr.tsx` | Instalación QR — pre-existente |

---

## 5. RUTAS EN EL TPV — ANTES Y DESPUÉS

| Ruta | Antes | Después |
|------|-------|---------|
| `/carta-cocina/qr` | → `QrMenuEmbed` (iframe) | ❌ **ELIMINADA** |
| `/carta-cocina/qr-menu` | No existía | ✅ **CREADA** → `QrMenuPlaceholder` |
| `/admin/qr-menu` | → `QrMenuPage` (pre-existente) | Sin cambios |
| `/admin/instalacion/qr` | → `AdminInstalacionQR` (pre-existente) | Sin cambios |

---

## 6. VARIABLES DE ENTORNO RELACIONADAS

No se crearon variables de entorno específicas para la integración fallida.  
El iframe usaba `window.location.origin` + path-based routing dinámico.

---

## 7. BASE DE DATOS

No se crearon tablas nuevas en la BD del TPV para la integración fallida.  
La integración usaba el artifact `artifacts/qr-menu/` con su propia BD Convex.  
Ver: `docs/AUDITORIA-DATOS-QR-MENU-FALLIDO.md`

---

## 8. SERVICE WORKERS / MANIFEST

| Archivo | Estado |
|---------|--------|
| `artifacts/piccolo-tpv/public/sw.js` | Pre-existente del TPV — no modificado |
| `artifacts/piccolo-tpv/public/manifest.json` | Pre-existente del TPV — no modificado |
| `artifacts/qr-menu/public/sw.js` (si existe) | Pertenece al artifact qr-menu — no modificado |

---

## 9. CSS / ESTILOS

No se añadieron estilos globales al TPV para la integración.  
`QrMenuEmbed.tsx` usaba únicamente clases Tailwind existentes.  
No quedan selectores CSS externos mezclados con el TPV.

---

## 10. CÓMO RECUPERAR LA INTEGRACIÓN FALLIDA

Si en el futuro se necesita recuperar el componente iframe eliminado, está disponible en:
- El historial de Git del repositorio
- Los checkpoints de Replit anteriores a esta limpieza

El archivo eliminado era:  
`artifacts/piccolo-tpv/src/pages/carta-cocina/QrMenuEmbed.tsx`
