# Entrega 43A — contratos Documents

## Resultado

El dominio `documents` queda contratado y validado en sus 18 operaciones. No se migraron hooks.

## Contratos completados

- Plantillas: listado, creación, actualización, activación, duplicación y borrado.
- Impresoras documentales: listado, creación, actualización y desactivación idempotente.
- Facturas: emisión, lectura enriquecida y rectificación.
- Clientes fiscales: listado, creación y actualización.
- Reimpresiones y auditoría paginada.

Todas las operaciones incluyen autenticación, roles efectivos y respuestas reales
`400`, `401`, `403`, `404`, `409` y `503` cuando corresponden.

## Esquemas alineados

- `DocumentTemplate`, incluida la marca `deletedAt`.
- `PrinterConfig`, `CreatePrinterConfigInput` y `UpdatePrinterConfigInput`.
- `Invoice`, con todos los campos Drizzle, desglose fiscal, rectificación y VeriFactu.
- `Client`, `CreateClientInput` y `UpdateClientInput`.
- `DocumentReprint`, con empleado, motivo y fecha.
- Fechas, UUID e importes comunes.

## Evidencia

- `documents-openapi-contract.test.ts` recorre 18/18 operaciones.
- Las pruebas PostgreSQL realizan requests reales para templates, printers, invoices,
  clients, reprints y audit y validan sus respuestas contra OpenAPI.
- El cliente aislado se genera en `documents-generated` dos veces con hash idéntico.
- API completa: 671 pruebas.
- E2E: 26 pruebas.
- TypeScript, ESLint y builds correctos.

## Preparación

El dominio está listo para migrar sus 18 hooks manuales en una entrega posterior.
La semántica idempotente de `DELETE /documents/printers/{id}` permanece documentada y sin cambios.
