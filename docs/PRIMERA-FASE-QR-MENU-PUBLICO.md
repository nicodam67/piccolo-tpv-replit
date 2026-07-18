# Primera Fase — QR Menú Público · Informe de diseño

**Fecha:** 2026-07-18  
**Ruta:** `/carta-cocina/qr-menu`  
**Estado:** ✅ Fase 1 completada — pendiente de aprobación visual

---

## 1. QUÉ SE HA CONSTRUIDO

Una primera versión navegable de la carta pública del QR Menú, completamente aislada del panel TPV, sin conexión a bases de datos ni servicios externos.

### Archivos creados

```
artifacts/piccolo-tpv/src/pages/carta-publica/
├── CartaPublicaApp.tsx   — raíz, gestión de estado de navegación
├── CartaInicio.tsx       — hero · info rápida · filtros · categorías · footer
├── CategoriaVista.tsx    — detalle de categoría con lista de productos
├── ProductoCard.tsx      — tarjeta de producto individual
├── IdiomaSelector.tsx    — selector visual de idioma (8 idiomas)
├── AlergenosLeyenda.tsx  — barra sticky de filtros dietéticos y alérgenos
├── carta-publica.css     — estilos con scope .qr-pub (sin contaminación del TPV)
└── fixtures.ts           — datos estáticos de prueba (no entran en BD)
```

---

## 2. DECISIONES VISUALES

### Fuentes
- **Nombre restaurante**: font Algerian (Hercules CDN) → fallback Cormorant Garamond
- **Categorías y menú**: ZapfChan Dm/Md (Hercules CDN) → fallback Cormorant Garamond
- **Tagline**: American Text BT (Hercules CDN) → italic Cormorant Garamond
- **Labels, UI**: AvantGarde Bk (Hercules CDN) → DM Sans
- ✅ Las fuentes de Hercules CDN se cargan correctamente desde Replit
- ✅ Las mismas fuentes que usa la versión de producción en `onhercules.app`

### Colores (copiados del original)
| Token | Valor | Uso |
|-------|-------|-----|
| `--qr-bg` | `#f8f4ef` | Fondo marfil/pergamino |
| `--qr-card` | `#ffffff` | Tarjetas categoría/producto |
| `--qr-primary` | `#7b1c1c` | Precios (borgoña) |
| `--qr-accent` | `#c9a96e` | Detalles dorados, divider hero |
| `--qr-hero-bg` | `#1a0808` | Fallback oscuro del hero |
| `--qr-muted` | `#7a6e65` | Textos secundarios |

### Hero
- Imagen de restaurante elegante con overlay `brightness(0.32)` — misma técnica que el original
- "FUND. 2007" en oro con letra espaciada uppercase
- "PICCOLO LA RÀPITA" en Algerian · sin negrita · gran escala
- Divisor dorado horizontal
- "cocina con sabor italiano" en American Text BT · italic

### Estructura (idéntica al original)
1. Hero (imagen + overlay + nombre + tagline)
2. Barra info rápida (dirección + horario)
3. Filtros sticky: etiquetas dietéticas / alérgenos EU 14
4. Grid 2 columnas de categorías
5. Footer con dirección y enlace Google Maps

---

## 3. ELEMENTOS COPIADOS DEL ORIGINAL

| Elemento | Copiado |
|---------|---------|
| Mismas 8 fuentes (Algerian, ZapfChan, AvantGarde, American Text BT + Google Fonts fallbacks) | ✅ |
| Paleta de colores (ivory, borgoña, dorado) | ✅ |
| Estructura hero: establecido + nombre + divisor + tagline | ✅ |
| Overlay de imagen: brightness(0.32) | ✅ |
| Selector de idioma top-right (8 idiomas: ES EN IT FR DE RU CA ZH) | ✅ |
| Barra sticky de filtros: etiquetas dietéticas + alérgenos EU 14 | ✅ |
| Grid 2 columnas de categorías con chevron | ✅ |
| Nombre del restaurante: "Piccolo la Ràpita" | ✅ |
| Tagline: "cocina con sabor italiano" | ✅ |
| Año de fundación: 2007 | ✅ |
| Dirección: Avinguda del Port, La Ràpita | ✅ |
| Modal de horario | ✅ |
| Footer con enlace Google Maps | ✅ |
| Comportamiento filtros (toggle alérgeno/tag, limpiar) | ✅ |

---

## 4. DIFERENCIAS RESPECTO AL ORIGINAL

| Diferencia | Motivo |
|-----------|--------|
| Categorías con emoji en vez de foto real | Sin conexión a Convex Storage · Fase 1 |
| Productos estáticos (fixtures.ts) | Sin conexión a BD · Fase 1 |
| Sin traducción automática activa | Sin i18next · Fase 1 |
| Sin PWA / service worker | Fase posterior |
| Sin botón "Llamar" (teléfono) | Solicitado así en tarea |
| Sin "Productos destacados" | Solicitado así en tarea |
| El selector de idioma es visual (no cambia textos todavía) | Fase posterior |
| Sin panel de administración | Fase posterior |
| Sin impresión | Fase posterior |
| Imagen hero: Unsplash placeholder (foto de restaurante elegante) | Sin Convex Storage · Fase 1 |

---

## 5. DATOS TODAVÍA SIMULADOS

Todos los datos de `fixtures.ts` son de prueba:

### Categorías (8)
Entrantes · Ensaladas · Pasta · Pizza · Carnes · Postres · Bebidas · Cafés

### Productos por categoría
| Categoría | Nº productos |
|-----------|-------------|
| Entrantes | 4 |
| Ensaladas | 3 |
| Pasta | 4 |
| Pizza | 4 |
| Carnes | 3 |
| Postres | 3 |
| Bebidas | 4 |
| Cafés | 3 |
| **Total** | **28** |

Cada producto incluye: nombre, descripción, precio, imagen Unsplash, alérgenos, etiquetas dietéticas.  
Los datos de branding usan la dirección y nombre reales del restaurante.

---

## 6. FUNCIONES TODAVÍA NO IMPLEMENTADAS

| Función | Estado | Fase |
|---------|--------|------|
| Conexión Convex (datos reales) | ⏳ Pendiente | Fase 2 |
| Traducción automática i18next | ⏳ Pendiente | Fase 2 |
| Panel de administración | ⏳ Pendiente | Fase 3 |
| Imágenes reales de productos | ⏳ Pendiente | Fase 2 |
| PWA / instalación | ⏳ Pendiente | Fase 4 |
| Impresión de carta | ⏳ Pendiente | Fase 3 |
| Sincronización con TPV | ⏳ Pendiente | Fase 3 |
| Pedidos online | ⏳ Pendiente | Fase 5 |
| Autenticación (panel admin) | ⏳ Pendiente | Fase 3 |

---

## 7. AISLAMIENTO TÉCNICO

- ✅ Todos los estilos bajo `.qr-pub` — sin contaminación del TPV
- ✅ Sin modificación de CSS global del TPV
- ✅ Sin Convex, sin Hercules, sin iframe
- ✅ Ruta pública: sin RequireRole (accesible sin login)
- ✅ TypeScript 0 errores
- ✅ 0 errores de consola en el navegador
- ✅ Sin datos en la BD del TPV
- ✅ Navegación interna por estado (no router externo)

---

## 8. CAPTURAS

- `docs/screenshots/qr-menu-mobile-inicio.jpg` — móvil 390px, pantalla de inicio
- Tablet 768px — disponible en historial de sesión

---

## 9. PRÓXIMOS PASOS (pendientes de aprobación visual)

1. **Aprobación visual** del propietario sobre esta Fase 1
2. **Fase 2**: conectar Convex para datos reales (categorías, productos, branding, imágenes)
3. **Fase 3**: panel de administración + traducción automática
4. **Fase 4**: PWA + service worker
5. **Fase 5**: sincronización con TPV (precios, disponibilidad)
