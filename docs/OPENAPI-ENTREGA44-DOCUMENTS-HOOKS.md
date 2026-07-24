# Entrega 44 — migración de hooks Documents

## Resultado

Los 18 hooks manuales del dominio `documents` fueron sustituidos por exports del cliente
generado desde OpenAPI.

## Hooks migrados

- Seis hooks de plantillas.
- Cuatro hooks de impresoras documentales.
- Tres hooks de facturas.
- Tres hooks de clientes fiscales.
- Un hook de reimpresiones.
- Un hook de auditoría.

Quince hooks tienen consumidores activos en cuatro pantallas. `useGetInvoice`,
`useRectifyInvoice` y `useUpdateClient` se conservan en la API pública aunque actualmente no
tengan consumidor interno.

## Compatibilidad

`documents-compat.ts` reexporta las funciones, hooks y tipos generados bajo los nombres
históricos. No fue necesario crear adaptadores porque las firmas de variables de consulta y
mutación son compatibles.

`migrate-documents-generated-hooks.mjs` elimina de forma AST e idempotente las declaraciones
duplicadas del cliente histórico. La regeneración doble incluye el cliente, la poda y el barrel
de compatibilidad en el hash de determinismo.

## Estado acumulado

- Hooks manuales antes de Entrega 44: 141.
- Hooks Documents eliminados: 18.
- Hooks manuales restantes: 123.
- Hooks sin contrato fuera de alcance: 120.
- Hooks Documents pendientes: 0.

No se modificaron endpoints, OpenAPI, comportamiento de negocio ni base de datos.
