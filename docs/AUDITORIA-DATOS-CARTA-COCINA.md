# AUDITORÍA DE DATOS — Carta y Cocina

**Fecha:** 2026-07-18

---

## 1. RESUMEN

Ningún dato relacionado con Carta y Cocina fue creado exclusivamente para la integración fallida.  
Todas las tablas son preexistentes y compartidas con el núcleo del TPV.

---

## 2. TABLAS DE CATÁLOGO (compartidas con TPV)

### `categories`
- **Uso**: TPV (línea de pedido), KDS (preparación), comandas, tickets, QR Menú
- **Tipo**: D — compartida
- **Acción**: NO TOCAR

### `subcategories`
- **Uso**: Estructura de carta, filtros de productos
- **Tipo**: D — compartida
- **Acción**: NO TOCAR

### `products`
- **Uso**: TPV (venta), tickets, KDS, comandas, Food Cost (recetas), entrega online
- **Tipo**: D — compartida
- **Acción**: NO TOCAR
- **Nota**: Tiene campo `qrVisible` para controlar visibilidad en carta digital

### `product_formats`
- **Uso**: Variantes de producto (medio/entero), precios diferenciados
- **Tipo**: D — compartida con comandas y TPV
- **Acción**: NO TOCAR

---

## 3. TABLAS DE MODIFICADORES

### `modifier_groups` / `modifiers` / `product_modifier_groups`
- **Uso**: Modificadores de pedido en TPV (sin azúcar, término, etc.)
- **Tipo**: D — core del TPV
- **Acción**: NO TOCAR

---

## 4. TABLAS DE FOOD COST (módulo real)

### `ingredients`
- **Estado**: Módulo funcional con lógica de coste real
- **Uso**: Cálculo food cost %, alertas cuando supera 35%, informes de rentabilidad
- **Tipo**: D — módulo independiente con datos reales
- **Acción**: NO TOCAR — Food Cost es un módulo real, no una pantalla vacía

### `ingredient_categories` / `storage_locations` (si existe)
- **Tipo**: D — soporte de ingredientes
- **Acción**: NO TOCAR

### `subrecipes` / `subrecipe_items`
- **Uso**: Preparaciones complejas (salsas, masas) como sub-ingredientes
- **Tipo**: D — Food Cost
- **Acción**: NO TOCAR

### `recipe_items`
- **Uso**: Vincula ingredientes con productos para calcular food cost teórico
- **Tipo**: D — Food Cost core
- **Acción**: NO TOCAR

### `waste_records`
- **Uso**: Registro de mermas para control de stock
- **Tipo**: D — Food Cost
- **Acción**: NO TOCAR

---

## 5. CONFIGURACIÓN (branding)

### `business_config`
- **Uso**: Config global del TPV + branding de la carta (heroImageUrl, colores, nombre)
- **Tipo**: D — global del sistema
- **Acción**: NO TOCAR

---

## 6. DATOS DEMO

No se detectan datos demo generados específicamente para la integración fallida de Carta y Cocina.  
El endpoint `/admin/datos-demo` es pre-existente y no se ejecutó durante la integración.

---

## 7. DUPLICADOS DETECTADOS

**Ninguno.** No hay tablas duplicadas ni registros duplicados originados por la integración.

---

## 8. REGISTROS HUÉRFANOS

**Ninguno detectado.** Las relaciones entre tablas (FK) están intactas.

---

## 9. ELEMENTOS SEGUROS PARA ELIMINAR

**Ninguno en la BD.** La limpieza es exclusivamente de código frontend.

---

## 10. CONCLUSIÓN

| Área | Estado | Acción |
|------|--------|--------|
| Tablas catálogo (categories, products, modifiers) | ✅ Datos reales del TPV | NO TOCAR |
| Tablas Food Cost (ingredients, recipes, waste) | ✅ Módulo funcional real | NO TOCAR |
| business_config / branding | ✅ Config global | NO TOCAR |
| Datos demo creados por integración | Ninguno | N/A |
| Tablas duplicadas | Ninguna | N/A |
| Registros huérfanos | Ninguno | N/A |

**La BD está limpia. No hay datos que eliminar.**

---

## 11. ESTADO DE FOOD COST

Food Cost **es un módulo real y funcional**, no una pantalla vacía:

- ✅ Tiene lógica de cálculo de food cost % en backend (`profitability.ts`)
- ✅ Tiene alertas cuando food cost > 35% (`food_cost_high`)
- ✅ Tiene tablas de ingredientes, recetas, subrecetas y mermas
- ✅ Tiene API real con tests (`profitability.test.ts`)
- ✅ Tiene 20+ rutas funcionales en `FoodCostLayout.tsx`
- ✅ Está accesible en `/admin/food-cost` — **ruta conservada**

**Decisión:** Food Cost se retira de la navegación de Carta y Cocina pero NO se elimina. Seguirá accesible en `/admin/food-cost` directamente.
