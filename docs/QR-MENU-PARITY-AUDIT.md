# QR Menú — Auditoría de Paridad

> Comparación exhaustiva entre el **programa original** (app.tar.gz) y la implementación **Piccolo TPV** actual. Generada como paso previo a la reconstrucción fiel.

---

## 1. Arquitectura general

| Dimensión | Original | Piccolo (antes) | Piccolo (después — objetivo) |
|---|---|---|---|
| Backend | Convex (real-time DB) | Express + PostgreSQL | Express + PostgreSQL (mismo) |
| Rutas de carta | `/:lng`, `/:lng/categoria/:id`, `/imprimir`, `/:lng/admin` | `/carta` (scroll único) | `/carta`, `/carta/categoria/:id`, `/carta/imprimir` |
| Panel admin | `/:lng/admin` → 4 tabs unificados | Botones dispersos: `/admin/branding` + `/admin/instalacion/qr` | `/admin/qr-menu` → 7 tabs unificados |
| Idiomas soportados | 8 (es, en, fr, de, ca, it, nl, ro) | Solo español | 8 idiomas con selector visible |
| Tiempo real | Sí (Convex) | No | No (requiere guardar + refrescar) |

---

## 2. Carta pública — Página principal (Index / `/carta`)

### Original (`src/pages/Index.tsx`)

| Elemento | Estado |
|---|---|
| Hero con imagen de fondo (oscurecida) | ✅ Presente |
| Hero con vídeo de fondo (alternativo a imagen) | ✅ Presente |
| Nombre del restaurante (animado, fuente display) | ✅ Presente |
| Separador horizontal (acento) | ✅ Presente |
| Tagline (fuente script, semitransparente) | ✅ Presente |
| Año de fundación (encima del nombre) | ✅ Presente |
| Selector de idioma (esquina superior derecha del hero) | ✅ Presente |
| Barra sticky de filtros: etiquetas dietéticas | ✅ Presente |
| Barra sticky de filtros: 14 alérgenos EU | ✅ Presente |
| Botón "Borrar filtros" | ✅ Presente |
| Grid 2 columnas de categorías (sm+) | ✅ Presente |
| Tarjeta de categoría: nombre + descripción + chevron | ✅ Presente |
| Tarjeta de categoría: colores desde branding | ✅ Presente |
| Recuento de platos por categoría (filtrado) | ✅ Presente |
| Solo categorías de primer nivel (sin parentId) | ✅ Presente |
| Skeletons de carga | ✅ Presente |
| Estado vacío elegante | ✅ Presente |
| Footer: nombre, dirección completa, link Google Maps | ✅ Presente |
| Footer: teléfono (enlace tel:) | ✅ Presente |
| Footer: año de copyright | ✅ Presente |
| Botón flotante "Llamar" (inferior derecho) | ✅ Presente (si hay teléfono) |
| Botón flotante "Horario" (inferior izquierdo) | ✅ Presente (si hay horario) |
| Dialog de horario: turnos por día | ✅ Presente |
| Colores CSS custom vars (themeColors) | ✅ Presente |
| Tipografías CSS custom vars (themeFonts) | ✅ Presente |

### Piccolo (antes de reconstrucción)

| Elemento | Estado |
|---|---|
| Hero con imagen de fondo | ✅ Presente |
| Hero con vídeo | ✅ Presente |
| Nombre del restaurante | ✅ Presente |
| Tagline | ✅ Presente |
| Selector de idioma | ❌ Ausente |
| Año de fundación | ❌ Ausente |
| Filtros alérgenos (14 EU) en sticky bar | ⚠️ Parcial (en modal aparte) |
| Filtros etiquetas dietéticas en sticky bar | ✅ Presente |
| Grid de categorías + navegación a página de categoría | ❌ Ausente (scroll único) |
| Footer completo con dirección + Google Maps | ❌ Ausente |
| Botón flotante llamada | ❌ Ausente |
| Botón flotante horario | ❌ Ausente |
| Dialog de horario (turnos) | ❌ Ausente |
| CSS vars desde branding (themeColors, themeFonts) | ❌ Ausente |

---

## 3. Carta pública — Página de categoría (`/:lng/categoria/:id`)

### Original (`src/pages/categoria/page.tsx`)

| Elemento | Estado |
|---|---|
| Header sticky: botón volver + nombre categoría | ✅ |
| Barra de filtros: etiquetas dietéticas | ✅ |
| Barra de filtros: 14 alérgenos EU | ✅ |
| Subcategorías grid (si las hay) | ✅ |
| Grid de items (3 cols desktop, 2 tablet, 1 móvil) en layout grid | ✅ |
| Lista de items en layout list | ✅ |
| Lista compacta en layout compact | ✅ |
| Tarjeta: imagen | ✅ (si cardSettings.showImage) |
| Tarjeta: nombre, precio, media ración | ✅ |
| Tarjeta: descripción | ✅ (si cardSettings.showDescription) |
| Tarjeta: etiquetas dietéticas con colores | ✅ (si cardSettings.showTags) |
| Tarjeta: alérgenos EU con iconos | ✅ (si cardSettings.showAllergens) |
| Tarjeta: cantidad/volumen | ✅ (si cardSettings.showQuantity) |
| Modal de detalle al tocar | ✅ |
| Estado vacío con ícono Search | ✅ |
| Animaciones entrada staggered | ✅ |
| Traducción del nombre según idioma seleccionado | ✅ |

### Piccolo (antes)

| Elemento | Estado |
|---|---|
| Página de categoría dedicada | ❌ Ausente (todo en scroll único) |
| Layout configurable (grid/list/compact) | ⚠️ Presente en carta.tsx pero sin nav |
| Modal de detalle | ❌ Ausente |
| Subcategorías | ❌ Ausente |
| Filtros en header sticky de categoría | ❌ Ausente |
| Traducciones por idioma | ❌ Ausente |

---

## 4. Página de impresión (`/imprimir`)

### Original (`src/pages/print/page.tsx`)

| Elemento | Estado |
|---|---|
| Panel lateral: selector de categorías a incluir | ✅ |
| Panel lateral: tab Elementos (mostrar/ocultar logo, nombre, dirección, teléfono, QR, descripción, precio, media ración, alérgenos, etiquetas) | ✅ |
| Panel lateral: tab Colores (fondo, texto, acento) | ✅ |
| Panel lateral: tab Tipografías (heading, body, tamaño) | ✅ |
| Panel lateral: tab Idioma (selector de 8 idiomas) | ✅ |
| Panel lateral: tab Páginas (nº columnas, orientación, tamaño) | ✅ |
| Vista previa tiempo real | ✅ |
| Botón imprimir (window.print + CSS @media print) | ✅ |
| Logo del restaurante configurable | ✅ |
| Sin imágenes de platos (solo texto) | ✅ |

### Piccolo (antes)

| Elemento | Estado |
|---|---|
| Página de impresión de carta | ❌ Ausente |

---

## 5. Panel de administración

### Original (`AdminDashboard.tsx`) — 4 tabs

| Tab | Función | Piccolo (antes) |
|---|---|---|
| **Menú** | Árbol categorías + items con DnD | ❌ Ausente (admin de TPV separado) |
| **Branding** | Nombre, tagline, hero, dirección, colores, tipografías, tarjetas, horarios | ⚠️ Parcial (`/admin/branding` sin themeColors/themeFonts/cardSettings/schedule completo) |
| **QR & Share** | Genera QR, copia URL, descarga PNG, imprime | ⚠️ Parcial (solo QR por mesa en `/admin/instalacion/qr`) |
| **Exportar** | CSV de todos los platos | ❌ Ausente (CSV de stock sí, pero no de carta) |

### Piccolo `admin/qr-menu` (después — objetivo)

| Tab | Contenido |
|---|---|
| **Carta** | Árbol categories/items con DnD, visibilidad QR, traducciones inline |
| **Branding** | Formulario completo: nombre, tagline, hero image/vídeo (URL+archivo), dirección completa, teléfono, fundación, colores (14 keys + presets), tipografías, tarjetas |
| **Horarios** | Editor por día: turno mediodía + turno noche, switch cerrado |
| **Idiomas** | Tabla de traducciones por item/categoría, 8 columnas de idioma, "Traducir todo" |
| **QR & Compartir** | QR de la URL de carta, copiar URL, descargar PNG, imprimir |
| **Vista previa** | iframe de /carta en 3 viewports (360/768/1280) |
| **Impresión** | Print panel con selección categorías, elementos, colores, tipografías, idioma, columnas, PDF |

---

## 6. Branding — Campos detallados

| Campo | Original | Piccolo (antes) | Piccolo (después) |
|---|---|---|---|
| restaurantName | ✅ | ✅ (nombreComercial) | ✅ |
| tagline | ✅ | ✅ | ✅ |
| heroImageUrl (URL manual) | ✅ | ✅ | ✅ |
| heroImageStorageId (subida de archivo) | ✅ (Convex) | ❌ | ✅ (Object Storage) |
| heroVideoUrl | ✅ | ✅ | ✅ |
| heroVideoStorageId (subida de archivo) | ✅ (Convex) | ❌ | ✅ |
| address (calle) | ✅ | ✅ | ✅ |
| city | ✅ | ❌ | ✅ |
| province | ✅ | ❌ | ✅ |
| postalCode | ✅ | ❌ | ✅ |
| country | ✅ | ❌ | ✅ |
| phone | ✅ | ✅ | ✅ |
| establishedYear | ✅ | ✅ (foundedYear) | ✅ |
| themeColors (14 keys) | ✅ | ❌ | ✅ |
| themeColors presets (6 paletas) | ✅ | ❌ | ✅ |
| themeFonts (heading + body + colores) | ✅ | ❌ | ✅ |
| cardSettings (7 toggles + layout) | ✅ | ⚠️ Solo cardLayout + accentColor | ✅ |
| schedule (DaySchedule[] con 2 turnos/día) | ✅ | ⚠️ openingHours (1 turno/día) | ✅ |

---

## 7. Árbol de menú (admin)

| Feature | Original | Piccolo (antes) |
|---|---|---|
| Árbol visual categorías > items | ✅ | ❌ (UI plana de TPV) |
| Drag-and-drop reordenación | ✅ | ❌ |
| Subcategorías anidadas | ✅ | ✅ (en DB) |
| Toggle visibilidad por item | ✅ | ❌ |
| Toggle visibilidad por categoría | ✅ | ❌ |
| Añadir item desde árbol | ✅ | ❌ |
| Editar item: básico, imagen, traducciones, alérgenos | ✅ | ❌ (TPV tiene su propio editor) |
| Media ración | ✅ | ✅ |
| Cantidad/volumen | ✅ | ✅ |
| Imagen/vídeo por item | ✅ | ✅ |
| 14 alérgenos EU con iconos | ✅ | ⚠️ (texto libre en TPV) |
| 4 etiquetas dietéticas | ✅ | ✅ (campos booleanos) |
| Traducciones por item (8 idiomas) | ✅ | ❌ |

---

## 8. Sistema de idiomas

| Feature | Original | Piccolo (antes) |
|---|---|---|
| Selector de idioma en carta pública | ✅ | ❌ |
| 8 idiomas: es, en, fr, de, ca, it, nl, ro | ✅ | ❌ |
| Traducciones por item (nombre + descripción) | ✅ | ❌ (solo nameEn en categorías) |
| Traducciones por categoría | ✅ | ⚠️ Solo nameEn |
| Auto-traducción (AI) | ✅ | ❌ |
| Editor de traducciones en admin | ✅ | ❌ |
| Parámetro URL `/:lng/` | ✅ | ❌ |

---

## 9. Navegación — Pasos para tareas clave

### Tarea A: Editar descripción de un producto en el original

1. Ir a `/:lng/admin`
2. Tab "Menú"
3. Expandir categoría → encontrar producto → botón lápiz
4. Dialog: tab "Básico" → editar descripción → Guardar

### Tarea A: Editar descripción de un producto en Piccolo (antes)

1. Ir a `/admin` → módulo "Productos" (diferente sección del TPV)
2. Buscar producto → editar → guardar

### Tarea B: Cambiar paleta de colores en el original

1. Ir a `/:lng/admin` → Tab "Branding"
2. Sección "Colores" → elegir preset o personalizar → botón Guardar general

### Tarea B: Cambiar colores en Piccolo (antes)

1. Ir a `/admin/branding` → solo accentColor (un picker simple)

### Tarea C: Imprimir la carta en el original

1. Ir a `/:lng/admin` → Tab "Exportar" (para CSV) o al botón Imprimir en QRShare
2. O navegar a `/imprimir` → configurar → imprimir/PDF

### Tarea C: Imprimir en Piccolo (antes)

1. No es posible — no existe la función.

### Tarea D: Ver cómo queda el cambio de branding en el original

1. Ir a `/:lng/admin` → Tab "QR & Share" → abrir URL de carta en nueva pestaña

### Tarea D: Ver cambios en Piccolo (antes)

1. Ir a `/carta` manualmente en otra pestaña.

---

## 10. Cambios en el backend requeridos (Piccolo)

| Cambio | Tipo |
|---|---|
| Añadir columnas themeColors, themeFonts, cardSettings, qrSchedule, city, province, postalCode, country a `business_config` | Migración DB |
| Añadir columna `translations` jsonb a `categories` | Migración DB |
| Añadir columna `translations` jsonb a `products` | Migración DB |
| Actualizar `GET /public/branding` para devolver formato completo | API |
| Crear `GET/PUT /admin/qr-branding` para gestionar el nuevo formato | API |
| Actualizar `GET /public/menu` para incluir traducciones | API |
| Añadir `GET/PATCH /admin/qr-menu/categories/:id` | API |
| Añadir `GET/PATCH /admin/qr-menu/items/:id` (traducciones) | API |
| Object Storage para hero image/vídeo subidos | Infrastructure |

---

## 11. Criterios de aceptación finales

- [ ] `/carta` muestra hero fiel al original (imagen/vídeo, colores CSS vars, tipografías, año fundación, tagline)
- [ ] `/carta` tiene botones flotantes llamada + horario
- [ ] `/carta` tiene grid de categorías con filtros de alérgenos + etiquetas en sticky bar
- [ ] `/carta` tiene selector de idioma visible
- [ ] `/carta/categoria/:id` muestra items con los 3 layouts configurables
- [ ] `/carta/categoria/:id` tiene modal de detalle
- [ ] `/admin/qr-menu` existe como módulo unificado con menú lateral
- [ ] Tab Branding guarda y refleja todos los campos
- [ ] Tab Horarios permite 2 turnos por día
- [ ] Tab Menú muestra árbol con DnD y toggles de visibilidad
- [ ] Tab Idiomas permite editar traducciones por item/categoría
- [ ] Tab QR & Compartir genera QR real, permite copiar URL y descargar PNG
- [ ] Tab Vista previa muestra iframe de `/carta` actualizado
- [ ] Tab Impresión genera PDF real via `window.print()`
- [ ] Todo funciona en móvil (375px)
- [ ] No hay datos hardcodeados — todo viene del backend
