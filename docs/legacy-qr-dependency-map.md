# Mapa de dependencias del QR heredado

Auditoria realizada el 2026-07-22 antes de eliminar codigo.

## Sistemas diferenciados

- Heredado: `artifacts/qr-menu`, aplicacion Vite/Convex servida en `/qr-menu/`.
- Vigente: modulo PostgreSQL del TPV en `artifacts/piccolo-tpv/src/pages/qr-menu` y carta publica `/carta`.

Solo se elimina el primero.

## Clasificacion

| Area | Clase | Evidencia |
|---|---|---|
| Productos, categorias y precios | A | El TPV usa PostgreSQL y `/api/public/menu`. |
| Imagenes y branding | A | El TPV usa `products` y `business_config`, no Convex Storage. |
| Pedidos online y courier | A | Pertenecen al API y PostgreSQL del TPV. |
| Reservas y clientes | A | No importan ni consultan el artefacto heredado. |
| Autenticacion TPV | A | Usa JWT/cookie del API; Convex Auth es independiente. |
| Paquete `@workspace/qr-menu` | B | Ningun paquete del TPV depende de el. |
| Convex, scripts, datos y assets del artefacto | B | Todas sus referencias son internas. |
| Variables Convex/Hercules en `.replit` y `.env.example` | B | No son consumidas por el TPV. |
| Importador `scripts/import-convex-snapshot.mjs` | B | Herramienta puntual ya obsoleta. |
| Enlace de `CartaCocinaHub` a `/qr-menu/` | C | Debe sustituirse por una URL externa validada. |
| Dependencias clase D | Ninguna | No existe acoplamiento de compilacion, datos o API. |

## Elementos que deben permanecer

- `artifacts/piccolo-tpv/src/pages/qr-menu/**`
- `/carta`, `/carta/categoria/*` y `/carta/imprimir`
- `/api/public/menu`, `/api/public/branding` y `/api/admin/qr-branding`
- migraciones 0001, 0007 y 0020
- productos, categorias, pedidos, reservas, clientes y sesiones de mesa
- `qr_content` fiscal y `qr_token` de CRM

No se ejecutaran migraciones destructivas ni se borraran datos PostgreSQL.
