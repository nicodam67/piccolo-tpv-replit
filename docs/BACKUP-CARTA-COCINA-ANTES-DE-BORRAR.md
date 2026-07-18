# BACKUP — Estado de Carta y Cocina antes de la eliminación

**Fecha:** 2026-07-18  
**Motivo:** El módulo Carta y Cocina en su estado actual no ha sido aprobado. Se elimina el hub visual y todos sus accesos fragmentados. La base limpia se usará para reconstruir desde cero.

---

## 1. CÓMO RESTAURAR EL ESTADO PREVIO

El estado previo a esta limpieza está disponible en:

- **Checkpoints de Replit** — antes de esta tarea
- **Historial Git** — los archivos eliminados están en el historial

### Archivos eliminados (para restaurar manualmente):
```
artifacts/piccolo-tpv/src/pages/carta-cocina/CartaCocinaHub.tsx   (versión hub)
artifacts/piccolo-tpv/src/pages/carta-cocina/QrMenuPlaceholder.tsx
```

### Archivos modificados (para restaurar desde Git):
```
artifacts/piccolo-tpv/src/App.tsx                (rutas carta-cocina)
```

---

## 2. RUTAS QUE EXISTÍAN

| Ruta | Componente | Estado |
|------|-----------|--------|
| `/carta-cocina` | `CartaCocinaHub` | ✅ Sustituida por placeholder |
| `/carta-cocina/qr-menu` | `QrMenuPlaceholder` | ✅ Redirige a `/carta-cocina` |
| `/carta-cocina/food-cost` | No existía como ruta | ✅ Redirige a `/carta-cocina` |
| `/admin/qr-menu` | `QrMenuPage` (pre-existente) | Sin cambios |
| `/admin/food-cost` | `FoodCostLayout` (pre-existente) | Sin cambios |
| `/categorias` | `Categorias` (pre-existente) | Sin cambios |
| `/productos` | `Productos` (pre-existente) | Sin cambios |
| `/modificadores` | `Modificadores` (pre-existente) | Sin cambios |
| `/admin/branding` | `Branding` (pre-existente) | Sin cambios |
| `/carta/imprimir` | `CartaImprimir` (pre-existente) | Sin cambios |

---

## 3. COMPONENTES QUE EXISTÍAN EN CARTA Y COCINA

### Creados durante la integración fallida (eliminados ahora):
| Archivo | Descripción |
|---------|-------------|
| `carta-cocina/CartaCocinaHub.tsx` | Hub visual con 13 tarjetas (QR Menú + Food Cost) |
| `carta-cocina/QrMenuPlaceholder.tsx` | Placeholder iframe (ya era 2ª versión) |

### Pre-existentes conservados intactos:
| Archivo | Descripción |
|---------|-------------|
| `qr-menu/QrMenuPage.tsx` (355 líneas) | Panel admin QR Menú |
| `qr-menu/QrMenuLayout.tsx` | Layout panel QR |
| `qr-menu/TabMenuTree.tsx` (970 líneas) | Árbol de menú |
| `qr-menu/TabBranding.tsx` (179 líneas) | Branding QR |
| `qr-menu/TabPreview.tsx` | Preview QR |
| `qr-menu/TabQRShare.tsx` (128 líneas) | Compartir QR |
| `qr-menu/TabIdiomas.tsx` (247 líneas) | Idiomas |
| `qr-menu/TabPrint.tsx` (351 líneas) | Impresión |
| `qr-menu/TabExport.tsx` (169 líneas) | Exportación |
| `qr-menu/types.ts` (200 líneas) | Tipos TypeScript |
| `food-cost/FoodCostLayout.tsx` (187 líneas) | Layout Food Cost |
| `food-cost/FoodCostVista.tsx` (54 líneas) | Dashboard Food Cost |

---

## 4. VARIABLES DE ENTORNO RELACIONADAS

No se crearon variables de entorno para el módulo Carta y Cocina.  
El módulo usaba únicamente:
- API del backend propio del TPV (autenticación JWT)
- Rutas Wouter internas

---

## 5. SERVICE WORKER Y MANIFEST

Los archivos del TPV no fueron modificados:
- `artifacts/piccolo-tpv/public/sw.js` — sin cambios
- `artifacts/piccolo-tpv/public/manifest.json` — sin cambios

No se añadieron service workers adicionales para Carta y Cocina.

---

## 6. CSS Y ESTILOS

No se añadieron estilos globales. El hub usaba exclusivamente:
- Clases Tailwind CSS ya presentes en el TPV
- Variables CSS del sistema de diseño (`--border`, `--card`, `--foreground`, etc.)

No hay CSS que limpiar en el TPV.

---

## 7. BASE DE DATOS

Todos los datos del TPV están intactos. Ver `docs/INVENTARIO-CARTA-COCINA-ACTUAL.md` y `docs/AUDITORIA-DATOS-CARTA-COCINA.md`.

---

## 8. ARCHIVOS ORIGINALES CONSERVADOS

| Archivo | Estado |
|---------|--------|
| `app (1).tar.gz` | ✅ Intacto |
| `snapshot_base datos qr.menu.zip` | ✅ Intacto |
| `artifacts/qr-menu/` completo | ✅ Intacto |
| Documentación previa en `docs/` | ✅ Intacta |
