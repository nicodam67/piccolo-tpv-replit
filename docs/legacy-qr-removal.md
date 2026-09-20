# Retirada segura del QR heredado

## Decision

La auditoria previa no encontro dependencias de clase D. El TPV usa su propio catalogo PostgreSQL y no importa el paquete `@workspace/qr-menu`.

## Resultado

El artefacto heredado fue eliminado del arbol activo junto con Convex, sus datos
de importacion, configuracion Replit, scripts y dependencias exclusivas. El
lockfile ya no contiene el importer `artifacts/qr-menu`.

Las referencias que permanecen en informes antiguos son historicas y no forman
parte del build, la navegacion o el despliegue.

## Alcance de retirada

- Aplicacion `artifacts/qr-menu`.
- Backend, configuracion y clientes Convex exclusivos.
- Scripts, backups, assets, fuentes y datos de importacion exclusivos.
- Configuracion Replit del artefacto.
- Importer y dependencias exclusivas del lockfile.
- Variables Convex y Hercules obsoletas.
- Importador raiz `scripts/import-convex-snapshot.mjs`.
- Regla Git LFS del backup heredado.

## Salvaguardas

- No se eliminan tablas ni columnas PostgreSQL.
- Se conservan productos, categorias, pedidos, reservas y clientes.
- Se conservan pedidos online y courier.
- Se conservan `/admin/qr-menu`, `/carta` y las APIs PostgreSQL.
- Stripe, Bizum y VeriFactu no se modifican.
- El repositorio `nicodam67/piccolo-qr-menu` no se integra en esta entrega.

## Validacion posterior

La retirada solo se considera completa cuando no quedan imports activos, el workspace no intenta compilar el artefacto y pasan TypeScript, ESLint, Vitest, PostgreSQL, Playwright, build, auditor de rutas y `pnpm audit`.

## Datos

No se ejecutaron migraciones destructivas. Se conservaron todas las tablas y
columnas QR de PostgreSQL porque pertenecen a la carta nativa, pedidos online,
CRM o fiscalidad. Su posible retirada queda aplazada a una entrega futura.
