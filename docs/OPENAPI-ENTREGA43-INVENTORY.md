# Entrega 43 — inventario previo a migración

## Dominio candidato

`documents`: plantillas, configuración de impresoras documentales, facturas, clientes,
reimpresiones y auditoría.

Se seleccionó porque es el dominio fuera de floor con mayor paridad de rutas y mayor número
de hooks históricos potencialmente migrables.

## Cobertura de rutas

| Área | Endpoints Express | Operaciones OpenAPI | Hooks manuales |
|---|---:|---:|---:|
| Plantillas | 6 | 6 | 6 |
| Impresoras documentales | 4 | 4 | 4 |
| Facturas | 3 | 3 | 3 |
| Clientes documentales | 3 | 3 | 3 |
| Reimpresiones | 1 | 1 | 1 |
| Auditoría | 1 | 1 | 1 |
| **Total** | **18** | **18** | **18** |

## Endpoints inventariados

- `GET|POST /documents/templates`
- `PUT|DELETE /documents/templates/{id}`
- `POST /documents/templates/{id}/activate`
- `POST /documents/templates/{id}/duplicate`
- `GET|POST /documents/printers`
- `PUT|DELETE /documents/printers/{id}`
- `POST /documents/invoices`
- `GET /documents/invoices/{id}`
- `POST /documents/invoices/{id}/rectify`
- `GET|POST /documents/clients`
- `PUT /documents/clients/{id}`
- `POST /documents/reprints`
- `GET /documents/audit`

## Hooks manuales candidatos

- `useGetDocumentTemplates`
- `useCreateDocumentTemplate`
- `useUpdateDocumentTemplate`
- `useDeleteDocumentTemplate`
- `useActivateDocumentTemplate`
- `useDuplicateDocumentTemplate`
- `useGetPrinterConfigs`
- `useCreatePrinterConfig`
- `useUpdatePrinterConfig`
- `useDeletePrinterConfig`
- `useCreateInvoice`
- `useGetInvoice`
- `useRectifyInvoice`
- `useGetClients`
- `useCreateClient`
- `useUpdateClient`
- `useCreateReprint`
- `useGetDocumentAuditLog`

## Bloqueos encontrados

1. Ninguna de las 18 operaciones documenta completamente sus errores reales:
   `400`, `401`, `403`, `404`, `409` y el posible `503` de sesión.
2. Los roles efectivos no están reflejados:
   - plantillas, impresoras, rectificación y auditoría requieren `admin`;
   - clientes y lectura de factura aceptan `admin|manager`;
   - creación de factura acepta `admin|manager|encargado`;
   - reimpresión acepta cualquier sesión autenticada.
3. `Invoice` omite campos devueltos por Drizzle, incluidos dirección fiscal, dirección del
   cliente, `taxBreakdown`, empleado, rectificación y `createdAt`.
4. `createReprint` devuelve `employeeId`, `employeeName` y `reason`, ausentes en el contrato.
5. Los cuerpos PUT de impresoras y clientes son más permisivos en runtime que el esquema.
6. `DELETE /documents/printers/{id}` devuelve `200 {ok:true}` incluso para un ID inexistente.
7. No existen pruebas HTTP de contrato para este dominio; solo hay un smoke E2E de creación
   de factura.
8. `/documents/printers` y `/admin/printers` son APIs diferentes y no deben confundirse.

## Clasificación

- Puede migrarse inmediatamente: **0**.
- Requiere adaptación pequeña: **0**.
- Bloqueado por diferencias reales de contrato: **18**.

## Decisión

La migración se detiene antes de modificar hooks o clientes. Corregir los contratos y añadir
pruebas de contrato debe realizarse en una entrega de documentación previa. No se generaron
clientes, no se eliminaron duplicados y no se cambió comportamiento funcional.
