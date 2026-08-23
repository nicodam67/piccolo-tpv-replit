# SIF / VERI*FACTU 2027 — Fase 1: núcleo fiscal transaccional

## Alcance

Esta fase garantiza que una factura emitida por Piccolo (ticket/factura
simplificada F2, factura completa F1 o rectificativa R1) y su Registro de
Facturación de Alta se confirman en el mismo `COMMIT` PostgreSQL.

Una prefactura sigue siendo un documento interno: no recibe identidad fiscal,
no consume `invoice_series`, no genera RF y no entra en la cadena.

Esta fase no declara Piccolo legalmente listo. Quedan fuera la validación final
del XML, transporte/certificado AEAT, QR impreso, pruebas integradas con AEAT y
declaración responsable.

## Piezas existentes reutilizadas

- `tickets`, `invoices` e `invoice_series`: documentos e identidad correlativa.
- `verifactu_records`, `verifactu_config` y `verifactu_audit_log`: contenido,
  configuración, estados persistentes y auditoría fiscal.
- `idempotency_keys` y el middleware de idempotencia: replay durable de
  peticiones HTTP con `Idempotency-Key`.
- Las transacciones Drizzle sobre PostgreSQL y el cálculo multi-IVA existente.
- El worker VeriFactu: consume `pendiente_envio`/`pendiente_reintento`; ahora
  recibe RF reales creados durante la emisión, no estados huérfanos en tickets.

No se ha creado una tabla fiscal paralela.

## Momento fiscal

### Prefactura

`POST /orders/:id/prefactura/print` conserva su función informativa. No llama a
`createFiscalRecord()` ni al contador fiscal.

### Factura emitida

El punto único de creación del RF es `createFiscalRecord()` en
`artifacts/api-server/src/lib/fiscal-issuance.ts`. Se invoca dentro de la misma
transacción que inserta `tickets` o `invoices`.

El cierre definitivo de un cobro ejecuta, en orden:

1. bloquea la fila `orders` con `FOR UPDATE`;
2. valida saldo/pagos bajo ese bloqueo;
3. inserta el pago;
4. adquiere el siguiente número mediante `invoice_series`;
5. inserta el ticket;
6. bloquea la cabecera de cadena en `fiscal_chain_state`;
7. calcula e inserta el RF;
8. avanza la cabecera de cadena;
9. inserta auditoría;
10. marca pedido pagado y libera la mesa;
11. confirma el `COMMIT`.

Un error en cualquier paso revierte pago, número, factura, RF, cadena,
auditoría y cierre. La API responde con error recuperable y no presenta la
emisión como completada.

La emisión de factura completa y rectificativa sigue el mismo patrón.

## Numeración, locking e idempotencia

- `invoice_series (serie, document_type)` usa `INSERT ... ON CONFLICT DO
  UPDATE ... RETURNING` dentro de la transacción. El incremento se revierte con
  el resto del trabajo.
- `tickets (serie, ticket_number)` e `invoices (serie, invoice_number)` tienen
  índices únicos.
- La migración adelanta cada contador a `MAX(numero)` antes de activarlo, por lo
  que una instalación con tickets `bigserial` previos no vuelve a empezar en 1.
- Sólo puede existir una factura F por pedido; el índice parcial
  `invoices_one_full_per_order` actúa como última barrera.
- Triggers cruzados impiden que el mismo pedido reciba a la vez una F2 y una F1.
  Si se emitió la F1 antes del cierre, el cobro reutiliza ese documento y no
  crea un ticket adicional, también en caja automática y reintentos.
- El bloqueo de `orders` serializa caja, tablet, doble clic y procesos Node que
  intenten cerrar el mismo pedido.
- `tickets.order_id` sigue siendo único.
- Los endpoints de emisión admiten `Idempotency-Key`, persistida en PostgreSQL.
  El TPV también conserva una `reference` UUID por intento y la inserta con el
  pago en la propia transacción; una respuesta HTTP perdida no duplica pagos
  parciales al reintentar.
- La caja automática inserta su pago, ticket y RF en una transacción y vuelve a
  intentar la conciliación de transacciones `completada` que aún no cerraron el
  pedido.

## Encadenamiento y huella

Cada SIF usa una clave:

`NIF emisor | IdSistemaInformatico | NumeroInstalacion`

`fiscal_chain_state` contiene la secuencia y huella de cabecera. La fila se
bloquea con `SELECT ... FOR UPDATE`; por ello dos procesos sólo pueden anexar
registros en serie. `(chain_key, chain_sequence)` y `huella` son únicos.
`verifactu_config` queda limitado a una sola fila para que dos configuraciones
no puedan seleccionar identidades SIF distintas.

La identidad canónica compartida es `SERIE-NNNN` (por ejemplo `T-0001`); es la
misma representación que entra en el RF y en su huella.

Para RegistroAlta se aplica SHA-256 sobre UTF-8 y hexadecimal en mayúsculas:

`IDEmisorFactura=...&NumSerieFactura=...&FechaExpedicionFactura=...&TipoFactura=...&CuotaTotal=...&ImporteTotal=...&Huella=...&FechaHoraHusoGenRegistro=...`

Se corrigieron tres causas del vector fallido anterior:

- faltaban los nombres y signos `=` de cada campo;
- `FechaHoraHusoGenRegistro` estaba en orden día-mes-año, no ISO 8601;
- el huso dependía del timezone del servidor; ahora se genera explícitamente
  para `Europe/Madrid`.

El test usa el ejemplo oficial:

- entrada: emisor `89890001K`, número `12345678/G33`, fecha `01-01-2024`;
- resultado:
  `3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60`.

Referencia:
[FAQ de huella AEAT](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/huella-hash.html)
y “Detalle de las especificaciones técnicas para la generación de la huella o
hash de los registros”, citado por la propia AEAT.

## Identidad e inmutabilidad

La migración `0026_sif_transactional_core.sql` añade:

- FK opcional `ticket_id`;
- unicidad de un alta por `invoice_id` o `ticket_id`;
- unicidad de
  `(emisor_nif, num_serie_factura, fecha_expedicion)` para altas;
- secuencia única por cadena;
- triggers que impiden cambiar contenido fiscal o eliminar RF;
- auditoría fiscal append-only;
- protección de los campos fuente de tickets/facturas que ya tienen RF;
- bloqueo del contenido económico de líneas, modificadores y descuentos cuando
  el pedido queda facturado;
- snapshot inmutable del nombre de producto usado para visualizar/reimprimir el
  documento, independiente de cambios posteriores en el catálogo;
- constraint triggers diferidos que rechazan al `COMMIT` todo ticket o factura
  emitida sin RF.

Sólo los campos operativos de transmisión (estado, respuesta, reintentos,
payload enviado y timestamps de envío) pueden evolucionar. El contenido fiscal
que produjo la huella no puede cambiar.

La migración evalúa duplicados históricos antes de crear constraints. Si los
encuentra, aborta sin borrar ni modificar información y explica el grupo que se
debe reconciliar. Los documentos históricos sin RF y los pedidos que ya tengan
F1+F2 se inventarían, sin alterarlos, en `sif_migration_findings`. La estrategia
segura es determinar su validez con asesoría fiscal, conservar todos los
originales y registrar la corrección mediante anulación/rectificación; nunca
deduplicar con `DELETE`. Esos documentos históricos quedan congelados aunque no
tengan RF; no pueden eliminarse, reescribirse ni volver a borrador.

Los RF históricos no se rehashean: cambiar su huella destruiría evidencia. Una
instalación con enlaces o huellas históricas incompatibles hace abortar la
migración y debe documentar el corte y su plan de subsanación antes de activar
remisión.

## Estado persistente y trabajo sin Internet

Todo RF nuevo nace como `pendiente_envio` dentro del mismo commit. Esto no
requiere conexión a Internet ni contacto con AEAT. Con PostgreSQL/LAN
disponibles:

- factura y RF quedan guardados;
- la cadena avanza una sola vez;
- el estado sobrevive reinicios;
- el worker puede recuperarlo y reintentar posteriormente.

La indisponibilidad del transportador no revierte una factura ya persistida ni
elimina el RF. Si PostgreSQL no está disponible, no hay emisión: la API responde
`503`, `recoverable: true`, y el operador debe reintentar.

## Anulación y limitaciones restantes

La antigua ruta de anulación modificaba el registro original y anexaba sin lock.
Se bloquea con `501 FISCAL_CANCELLATION_PHASE2` para preservar inmutabilidad
hasta implementar una anulación completa, transaccional y validada.

Pendiente para fases posteriores:

- XML conforme al XSD vigente y validaciones semánticas AEAT;
- SOAP/HTTP, mTLS, certificado, producción y tratamiento completo de respuestas;
- cola/leases de envío robustos para varios workers;
- QR fiscal impreso y leyendas;
- flujo final de anulación y todos los tipos rectificativos;
- reconciliación formal de posibles registros históricos;
- pruebas de aceptación contra servicios externos AEAT;
- declaración responsable final.
