# Contrato QR Menu API v1

Base futura: `/api/v1/qr-menu`.

Implementado:

- `GET /status`
- `GET /catalog`

Planificado, no operativo:

- `GET /catalog/changes`

El catalogo es un snapshot de PostgreSQL. Su `catalogVersion` es el SHA-256 del contenido publico canonicalizado; no es una version monotona. `catalogUpdatedAt` y `product.updatedAt` son `null` mientras el modelo no disponga de timestamps fiables.

Los precios son enteros en centimos y la moneda se expresa como codigo ISO. Productos inactivos u ocultos para QR no aparecen. Productos agotados permanecen visibles con `outOfStock=true`.

Idioma predeterminado: `es`. Las traducciones ausentes no se inventan; el consumidor aplica fallback al valor español y puede detectar la ausencia por locale.

Especificacion: `lib/api-spec/contracts/qr-menu-api.v1.yaml`.
