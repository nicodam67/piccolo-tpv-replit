# Variantes del Cliente API — Piccolo TPV

> Generado por auditoría técnica — 2026-07-17

## Resumen del problema

El frontend tiene **tres variantes distintas** de cliente HTTP, usadas de forma inconsistente en 74 páginas. Esto genera:
- Diferentes comportamientos ante errores (algunas variantes silencian fallos)
- Lecturas del token JWT en múltiples sitios
- Dificultad para cambiar el endpoint base o añadir interceptores globales
- Tipos TypeScript inconsistentes en las respuestas

---

## Variante 1: `customFetch` de `@workspace/api-client-react`

**Archivos que la usan:** ~52 páginas

**Cómo funciona:**
```typescript
// lib/api-client-react/src/custom-fetch.ts
// Lee el token de localStorage["token"] automáticamente
// Lanza ApiError en respuestas !ok
// Soporta responseType: "json" | "text" | "blob" | "auto"
// Configurable con setBaseUrl() y setAuthTokenGetter()
```

**Ejemplo de uso:**
```typescript
import { useGetProducts } from "@workspace/api-client-react";
const { data, isLoading } = useGetProducts();
```

**Ventajas:**
- Tipos TypeScript generados automáticamente
- Integración TanStack Query incluida
- Manejo de errores consistente

**Desventajas:**
- Codegen (Orval) bloqueado — el cliente se mantiene manualmente
- No cubre todos los endpoints del backend

---

## Variante 2: `fetch()` directo con token manual

**Archivos que la usan:** ~70 páginas (muchas se solapan con variante 3)

**Patrón típico:**
```typescript
const token = localStorage.getItem("token");
const res = await fetch(`${BASE}/api/orders`, {
  headers: { Authorization: `Bearer ${token}` }
});
const data = await res.json();
```

**Problemas:**
- `BASE` no está definido consistentemente (ver sección de constantes)
- Sin manejo de errores: si `res.ok === false`, se intenta parsear igualmente
- Sin tipado de respuesta
- Duplicación del patrón de token en ~50 archivos

**Variante con manejo de errores (parcial):**
```typescript
const res = await fetch(...);
if (!res.ok) throw new Error("Error");
const data = await res.json();
```

---

## Variante 3: `apiFetch` / `customFetch` wrapper local

**Archivos que la usan:** ~33 páginas

**Origen:** No existe un único `lib/api.ts` — la búsqueda de `artifacts/piccolo-tpv/src/lib/api.ts` no encontró el archivo. Los wrappers `apiFetch` son definidos localmente en algunos archivos o importados desde helpers ad hoc.

**Patrón típico:**
```typescript
async function apiFetch(url: string, options?: RequestInit) {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

---

## Constante BASE — variantes detectadas

| Constante | Definición | Archivos |
|---|---|---|
| `import.meta.env.BASE_URL` | Vite, ej. `/piccolo-tpv/` | ~30 archivos |
| `""` (string vacío) | Rutas relativas sin prefijo | ~15 archivos |
| `window.location.origin` | URL dinámica | ~5 archivos |
| Sin prefijo | Rutas absolutas `/api/...` | ~20 archivos |

**Problema:** Usar `/api/...` sin `BASE_URL` puede romper el routing en entornos donde el app no está montado en `/`. En Replit, el app está en `/piccolo-tpv`, lo que significa que una petición a `/api/orders` puede no llegar al backend.

---

## Uso del token

| Patrón | Archivos |
|---|---|
| `localStorage.getItem("token")` directo | ~50 archivos |
| `customFetch` (lee token automáticamente) | ~52 archivos |
| Sin autenticación (endpoints públicos) | ~10 archivos |
| `FichajeImportarAnviz.tsx:55` — token manual explícito | 1 archivo |

---

## Inconsistencias en manejo de errores

| Patrón | Riesgo | Archivos afectados |
|---|---|---|
| `catch(r)` donde `r: unknown` — acceso a `r.message` sin type guard | TS error (build OK, runtime falla) | `admin-instalacion.tsx`, `admin-salud.tsx`, `admin-datos-demo.tsx`, `admin-permisos.tsx`, `escaner-facturas.tsx`, `facturas-proveedor.tsx` |
| `res.json()` sin comprobar `res.ok` | Datos de error parseados como datos válidos | ~20 archivos |
| `catch(() => {})` silencioso | Errores ignorados | ~8 archivos |

---

## Propuesta de cliente API único

> Esta propuesta documenta el diseño. No se implementa en esta tarea.

### Objetivo

Un único módulo `lib/api-client-react` que cubra **todos** los endpoints, con:
- Token JWT leído automáticamente desde `localStorage`
- `BASE_URL` configurada una sola vez al arrancar (`main.tsx`)
- Manejo de errores consistente (lanza `ApiError`)
- Hooks TanStack Query tipados para cada endpoint
- Compatible con el `customFetch` ya existente

### Arquitectura propuesta

```
lib/api-client-react/
├── src/
│   ├── custom-fetch.ts       ✅ Ya existe — conservar
│   ├── index.ts              Exporta todos los hooks
│   └── endpoints/
│       ├── auth.ts           getLoginList, postAuthPin
│       ├── orders.ts         getOrders, postOrder, ...
│       ├── products.ts       getProducts, postProduct, ...
│       └── ... (un archivo por dominio)
```

### Inicialización (una sola vez en `main.tsx`)

```typescript
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";

setBaseUrl(import.meta.env.BASE_URL.replace(/\/$/, ""));
setAuthTokenGetter(() => localStorage.getItem("token"));
```

### Migración gradual

1. Añadir endpoints faltantes a `lib/api-client-react` (sin romper los existentes)
2. Migrar páginas de mayor riesgo primero (las que usan `fetch` directo sin manejo de errores)
3. Eliminar los wrappers locales ad hoc
4. Centralizar el manejo de errores 401 (redirigir al login)

**Prerrequisito:** Resolver el bloqueo de Orval (ver `orval-codegen-workaround.md` en memoria) o mantener el cliente manualmente con un script de generación propio.
