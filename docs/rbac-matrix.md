# Matriz RBAC efectiva

La autorización de UI es informativa. La decisión autoritativa se toma en las
rutas API mediante `requireAuth`, `requireRole` o `requirePermission`.
`requirePermission` consulta primero `role_permissions` y falla cerrado si no
puede verificar un override.

## Matriz resumida

| Dominio | admin | manager | encargado | waiter | cashier | kitchen |
|---|---:|---:|---:|---:|---:|---:|
| Caja: abrir/ver | ✓ | ✓ | ✓ | ver | ✓ | — |
| Caja: cerrar | ✓ | ✓ | ✓ | — | — | — |
| Arqueos/anulaciones | ✓ | según ruta | — | — | — | — |
| Cobros | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Devoluciones | ✓ | ✓ | — | — | — | — |
| Facturas completas | ✓ | ✓ | ✓ | — | — | — |
| Rectificativas/fiscal | ✓ | según ruta | — | — | — | — |
| Descuentos | ✓ | ✓ | ✓ | según permiso | según permiso | — |
| Cortesías | ✓ | ✓ con elevación | elevación | — | — | — |
| Inventario: ver | ✓ | ✓ | ✓ | — | — | — |
| Inventario: modificar | ✓ | ✓ | — | — | — | — |
| Proveedores | ✓ | ✓ | — | — | — | — |
| Usuarios/empleados | ✓ | ✓ | consulta | — | — | — |
| Fichaje administrativo | ✓ | ✓ | ✓ | propio | — | — |
| Configuración | ✓ | ✓ limitada | — | — | — | — |
| KDS | ✓ | ✓ | ✓ | operación de pase | — | ✓ |

Los detalles de permisos por string están en
`artifacts/api-server/src/lib/permissions.ts`. Las rutas fiscales,
proveedores, configuración, caja e inventario conservan guards específicos más
restrictivos cuando corresponde.

## Reglas negativas destacadas

- waiter no crea facturas completas;
- waiter/cashier no cierran caja ni emiten devoluciones;
- waiter no administra stock, proveedores, empleados o configuración;
- kitchen no accede a pedidos, caja ni pagos;
- un override explícito `allowed=false` prevalece sobre el rol.

## Pruebas

```bash
pnpm --filter @workspace/api-server exec vitest run \
  src/middlewares/rbac.test.ts \
  src/routes/service-flow.test.ts
```

`rbac.test.ts` recorre permisos positivos y negativos de los seis roles, prueba
overrides de concesión/denegación y fallo cerrado de almacenamiento.
