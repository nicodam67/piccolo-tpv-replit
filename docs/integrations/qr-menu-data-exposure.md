# Exposicion de datos QR Menu API v1

## Permitido

- identificadores de categoria, subcategoria, producto y formato;
- nombres y descripciones publicas;
- traducciones existentes;
- precios de venta en centimos;
- moneda;
- visibilidad y estado agotado;
- etiquetas dieteticas y codigos de alergenos;
- URL HTTPS de imagen sin credenciales;
- orden de presentacion.

## Excluido

- costes, margenes, escandallos, ingredientes y proveedores;
- IVA interno y configuracion fiscal;
- empleados, PIN, sesiones y tokens;
- clientes, reservas, notas internas y direcciones privadas;
- caja, pagos, adelantos y movimientos economicos;
- pedidos, comandas y datos KDS;
- certificados o claves VeriFactu.

El contrato se construye mediante una allowlist explicita. No serializa filas completas de Drizzle.
