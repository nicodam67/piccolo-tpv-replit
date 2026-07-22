# INVENTARIO — Módulo Carta y Cocina (antes de eliminación)

**Fecha:** 2026-07-18

---

## CLASIFICACIÓN

| Tipo | Descripción |
|------|-------------|
| **A** | Creado por la integración fallida — ELIMINAR |
| **B** | Existente antes, usado por otros módulos — CONSERVAR |
| **C** | Datos originales del QR Menú — CONSERVAR |
| **D** | Compartido con el TPV — NO TOCAR |
| **E** | Desconocido — NO TOCAR |

---

## COMPONENTES FRONTEND

| Archivo | Tipo | Acción |
|---------|------|--------|
| `carta-cocina/CartaCocinaHub.tsx` | **A** | ✅ Sustituido por placeholder mínimo |
| `carta-cocina/QrMenuPlaceholder.tsx` | **A** | ✅ Eliminado (fusionado en nuevo hub) |
| `carta-cocina/QrMenuEmbed.tsx` | **A** | ✅ Ya eliminado en tarea anterior |
| `qr-menu/QrMenuPage.tsx` | **B** | ✅ Conservado — panel admin QR |
| `qr-menu/QrMenuLayout.tsx` | **B** | ✅ Conservado |
| `qr-menu/TabMenuTree.tsx` | **B** | ✅ Conservado |
| `qr-menu/TabBranding.tsx` | **B** | ✅ Conservado |
| `qr-menu/TabPreview.tsx` | **B** | ✅ Conservado |
| `qr-menu/TabQRShare.tsx` | **B** | ✅ Conservado |
| `qr-menu/TabIdiomas.tsx` | **B** | ✅ Conservado |
| `qr-menu/TabPrint.tsx` | **B** | ✅ Conservado |
| `qr-menu/TabExport.tsx` | **B** | ✅ Conservado |
| `qr-menu/types.ts` | **B** | ✅ Conservado |
| `food-cost/FoodCostLayout.tsx` | **B** | ✅ Conservado — módulo real con datos |
| `food-cost/FoodCostVista.tsx` | **B** | ✅ Conservado |
| `pages/categorias.tsx` | **D** | ✅ Conservado — compartido con TPV |
| `pages/productos.tsx` | **D** | ✅ Conservado — compartido con TPV |
| `pages/modificadores.tsx` | **D** | ✅ Conservado — compartido con TPV |
| `pages/branding.tsx` | **D** | ✅ Conservado — compartido con TPV |
| `pages/carta-imprimir.tsx` | **D** | ✅ Conservado — compartido con TPV |
| `pages/rentabilidad.tsx` | **D** | ✅ Conservado — Food Cost |
| `pages/ingredientes.tsx` | **D** | ✅ Conservado — Food Cost |
| `pages/subrecetas.tsx` | **D** | ✅ Conservado — Food Cost |
| `pages/simulador-precios.tsx` | **D** | ✅ Conservado — Food Cost |
| `pages/admin-instalacion-qr.tsx` | **B** | ✅ Conservado — instalación QR pre-existente |

---

## RUTAS (App.tsx)

| Ruta | Componente | Tipo | Acción |
|------|-----------|------|--------|
| `/carta-cocina` | CartaCocinaHub | **A** | ✅ Sustituida → placeholder mínimo |
| `/carta-cocina/qr-menu` | QrMenuPlaceholder | **A** | ✅ Redirige a `/carta-cocina` |
| `/carta-cocina/food-cost` | (no existía) | — | ✅ Redirige a `/carta-cocina` |
| `/carta-cocina/:rest` | (catch-all) | — | ✅ Redirige a `/carta-cocina` |
| `/admin/qr-menu` | QrMenuPage | **B** | ✅ Conservada — sin cambios |
| `/admin/food-cost` | FoodCostLayout | **B** | ✅ Conservada — módulo real |
| `/categorias` | Categorias | **D** | ✅ Conservada — TPV core |
| `/productos` | Productos | **D** | ✅ Conservada — TPV core |
| `/modificadores` | Modificadores | **D** | ✅ Conservada — TPV core |
| `/admin/branding` | Branding | **D** | ✅ Conservada — TPV core |
| `/carta/imprimir` | CartaImprimir | **D** | ✅ Conservada — TPV core |
| `/carta` | Carta | **D** | ✅ Conservada — carta pública |
| `/ingredientes` | Ingredientes | **D** | ✅ Conservada — Food Cost |
| `/admin/proveedores` | Proveedores | **D** | ✅ Conservada — Food Cost |
| `/admin/pedidos-compra` | PedidosCompra | **D** | ✅ Conservada — Food Cost |
| `/admin/inventario/fisico` | InventarioFisico | **D** | ✅ Conservada — Food Cost |
| `/admin/inventario/informes` | InformesStock | **D** | ✅ Conservada — Food Cost |

---

## BOTONES EN ADMIN DASHBOARD

| Botón | href | Tipo | Acción |
|-------|------|------|--------|
| "Carta y Cocina" | `/carta-cocina` | **A** | ✅ Conservado — ahora apunta al placeholder |

---

## BASE DE DATOS — TABLAS RELACIONADAS

| Tabla | Tipo | Acción |
|-------|------|--------|
| `categories` | **D** | ✅ NO TOCAR — usada por TPV, tickets, KDS |
| `subcategories` | **D** | ✅ NO TOCAR — usada por TPV |
| `products` | **D** | ✅ NO TOCAR — usada por TPV, comandas, caja |
| `product_formats` | **D** | ✅ NO TOCAR — usada por comandas |
| `modifier_groups` | **D** | ✅ NO TOCAR — usada por TPV |
| `modifiers` | **D** | ✅ NO TOCAR — usada por TPV |
| `product_modifier_groups` | **D** | ✅ NO TOCAR — usada por TPV |
| `ingredients` | **D** | ✅ NO TOCAR — Food Cost real |
| `ingredient_categories` | **D** | ✅ NO TOCAR — Food Cost |
| `subrecipes` | **D** | ✅ NO TOCAR — Food Cost |
| `subrecipe_items` | **D** | ✅ NO TOCAR — Food Cost |
| `recipe_items` | **D** | ✅ NO TOCAR — Food Cost |
| `waste_records` | **D** | ✅ NO TOCAR — Food Cost |
| `business_config` | **D** | ✅ NO TOCAR — config global TPV + branding |

**Ninguna tabla se elimina.** Todo el catálogo es compartido con el TPV.

---

## ESTILOS / CSS

| Elemento | Tipo | Estado |
|---------|------|--------|
| CSS global del TPV (`index.css`) | **D** | ✅ Sin modificaciones — el hub usaba solo Tailwind |
| Variables CSS (`--border`, `--card`, etc.) | **D** | ✅ Sin modificaciones |
| Fuentes del TPV | **D** | ✅ Sin modificaciones — no se añadieron fuentes externas al TPV |
| `public/sw.js` | **D** | ✅ Sin modificaciones |
| `public/manifest.json` | **D** | ✅ Sin modificaciones |

---

## INTEGRACIONES EXTERNAS

| Integración | Estado |
|-------------|--------|
| Convex | Retirado del repositorio activo; solo permanece en documentación histórica |
| Hercules CDN | Retirado del código activo; las fuentes necesarias se sirven desde el TPV |
| Autenticación OIDC | No se añadió al TPV |
| iframes | Eliminado en tarea anterior |
| Microfrontend | No se implementó |
| Datos demo | No se generaron para Carta y Cocina |
