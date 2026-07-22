# Auditoria de APIs para QR Menu v1

| Capacidad | Ruta actual | Auth / roles | Datos | Clasificacion | Recomendacion |
|---|---|---|---|---|---|
| Catalogo publico | `GET /api/public/menu` | publica | categorias, subcategorias, productos, precios, traducciones | Reutilizable con adaptacion | Reusar consultas con respuesta allowlist y token M2M |
| Branding | `GET /api/public/branding` | publica | nombre, tema, horarios, URL QR externa | Reutilizable directamente | No mezclar datos fiscales de `/config/business` |
| Productos TPV | `GET /api/products` | JWT | precio, IVA, visibilidad TPV | No apta | Contiene campos internos |
| Productos admin | `GET /api/admin/products` | admin | coste, IVA, codigos internos | No apta | Nunca exponer |
| Categorias admin | `/api/admin/categories*` | admin | CRUD completo | No apta | Solo referencia interna |
| Agotados | `PATCH /api/admin/products/:id/soldout` | manager/admin | estado agotado | Reutilizable con adaptacion | Catalogo v1 solo lee `outOfStock` |
| Disponibilidad horaria | `/api/admin/product-availability-rules` | manager/admin | reglas internas | Reutilizable con adaptacion | No exponer reglas crudas en v1 |
| Alergenos | `GET /api/menu/products` | publica | cache de alergenos | Reutilizable con adaptacion | v1 expone solo codigos normalizados |
| Reservas | `/api/reservations*` | JWT y roles | PII, notas, historial | No apta | No implementar en v1 |
| Pedidos online | `/api/public/orders/online-v2` y auxiliares | publica/control propio | pedidos, sesiones, pagos | No apta para catalogo | No modificar en esta entrega |
| Config negocio | `GET /api/config/business` | publica | incluye identidad fiscal | No apta | No reutilizar |

## Riesgos

- Las URLs de imagen almacenadas no estan validadas: v1 solo devuelve HTTPS sin credenciales.
- No existe `updated_at` en productos o categorias: `updatedAt` sera `null`.
- No existe historial incremental fiable: `/catalog/changes` queda planificado y no se implementa.
- Las reservas contienen datos personales y quedan fuera del contrato.

La integracion productiva no esta activa y no existe acceso directo entre bases de datos.
