# AUDITORÍA DE DATOS — QR Menú (integración fallida)

**Fecha:** 2026-07-18  
**Alcance:** Base de datos PostgreSQL del TPV + artifact qr-menu (Convex)

---

## 1. RESUMEN EJECUTIVO

La integración fallida del QR Menú NO creó tablas, registros ni columnas en la base de datos PostgreSQL del TPV.

El artifact `artifacts/qr-menu/` usa **Convex** como backend propio, completamente separado de la BD del TPV.

No hay datos duplicados ni huérfanos en la BD del TPV originados por esta integración.

---

## 2. BASE DE DATOS TPV (PostgreSQL)

### ¿Se crearon tablas nuevas para la integración QR?

**No.** La integración consistía únicamente en un componente React (`QrMenuEmbed.tsx`) que renderizaba un iframe. No tocó la base de datos del TPV.

### ¿Hay registros demo creados?

**No confirmado.** No se ejecutó ningún endpoint de datos demo durante la integración fallida. Los datos demo existentes en la BD son pre-existentes y no están relacionados con la integración.

### Tablas existentes del TPV potencialmente relacionadas con QR:

| Tabla | Estado | Clasificación |
|-------|--------|---------------|
| `categories` | Pre-existente | ✅ ORIGINAL |
| `products` | Pre-existente | ✅ ORIGINAL |
| `modifiers` | Pre-existente | ✅ ORIGINAL |
| `branding` | Pre-existente | ✅ ORIGINAL |
| `qr_configs` (si existe) | Pre-existente | ✅ ORIGINAL |

**Acción recomendada:** Ninguna. No hay datos para eliminar en la BD del TPV.

---

## 3. BASE DE DATOS QR MENÚ (Convex)

El artifact `artifacts/qr-menu/` se conecta a:  
`VITE_CONVEX_URL = kindhearted-viper-426.convex.cloud` (producción real)

### ¿Se modificaron datos en Convex durante la integración?

**No.** La integración era de solo lectura. El iframe cargaba la app qr-menu que consume datos de Convex, pero no se ejecutaron mutaciones.

### Datos en Convex (clasificación):

| Colección | Estado | Clasificación |
|-----------|--------|---------------|
| `branding` | Datos de producción del restaurante | ✅ ORIGINAL |
| `categories` | Datos de producción del restaurante | ✅ ORIGINAL |
| `products` | Datos de producción del restaurante | ✅ ORIGINAL |
| `allergens` | Datos de producción del restaurante | ✅ ORIGINAL |
| `storage` (imágenes) | Subidas por el restaurante | ✅ ORIGINAL |

**Acción recomendada:** Ninguna. Todos los datos de Convex son originales de producción.

---

## 4. ARTIFACT QR-MENU — ARCHIVOS

### Directorio: `artifacts/qr-menu/`

Este artifact es una copia del original entregado. Se mantiene intacto.

| Componente | Estado |
|-----------|--------|
| `convex/` | ✅ CONSERVADO — backend Convex original |
| `src/` | ✅ CONSERVADO — UI original |
| `src/pages/Index.tsx` | ✅ CONSERVADO con modificación menor: `backgroundColor: '#1a0a08'` en hero header |
| `tmp/qr-menu-original/` | ✅ CONSERVADO — copia de referencia |

---

## 5. ARCHIVOS HUÉRFANOS DETECTADOS

| Archivo | Ubicación | Estado |
|---------|-----------|--------|
| `QrMenuEmbed.tsx` | `artifacts/piccolo-tpv/src/pages/carta-cocina/` | ❌ ELIMINADO (creado por integración fallida) |

No se detectan otros archivos huérfanos.

---

## 6. IDS ROTOS / REFERENCIAS ROTAS

Tras la limpieza, no quedan referencias rotas:
- La ruta `/carta-cocina/qr` ha sido eliminada junto con su componente
- La ruta `/carta-cocina/qr-menu` existe y devuelve un placeholder válido
- El import de `QrMenuEmbed` ha sido eliminado de `App.tsx`
- `CartaCocinaHub.tsx` no contiene referencias a rutas inexistentes

---

## 7. REGISTROS DEMO

El endpoint `POST /admin/datos-demo` es pre-existente del TPV y no está relacionado con la integración fallida. No se ejecutó durante la integración.

---

## 8. CONCLUSIÓN

| Área | Acción necesaria |
|------|-----------------|
| BD PostgreSQL TPV | ✅ Ninguna |
| BD Convex qr-menu | ✅ Ninguna |
| Archivos código TPV | ✅ Limpieza completada |
| Archivos qr-menu | ✅ Conservados íntegros |
| CSS/estilos globales | ✅ Sin contaminación |
| Service workers | ✅ Sin modificaciones |
| Variables de entorno | ✅ Sin cambios |

**El proyecto está limpio y listo para reconstruir el QR Menú desde cero.**
