# Entrega 66 — Impresión productiva y departamentos

## Resultado

El sistema queda **listo para iniciar certificación física de impresión**, pero ningún modelo de impresora, corte, cajón o detección de papel se declara certificado.

## Migración justificada

`0026_production_departments_printing.sql` es imprescindible porque el modelo anterior solo disponía de:

- `business_config.print_mode` global;
- listas de departamentos hardcoded;
- cola sin lease/backoff/dedupe;
- impresoras sin selección de connector.

La migración añade una única fuente de verdad (`production_departments`), configuración ESC/POS por impresora y metadatos de recuperación de cola. No modifica pedidos, pagos ni reglas fiscales.

## Arquitectura final

```text
Producto.prepZone
→ production_departments
   ├─ outputMode none/kds/printer/both
   ├─ workflowProfile standard/pizza/bar/pase/none
   └─ printerIds ordenadas por prioridad
→ envío de pedido
   ├─ kitchen_tasks si KDS efectivo
   └─ print_queue si printer efectivo
→ print worker
   ├─ simulator (dev/test)
   └─ TCP ESC/POS (producción configurada)
```

El modo global `kds_only/printers_only/both` permanece como techo de compatibilidad. Los departamentos refinan el comportamiento de forma independiente.

## Departamentos

Iniciales: Cocina, Pizza, Ensaladas, Barra y Pase; `sin_partida` se mantiene como compatibilidad oculta.

Administración permite:

- crear departamentos con código estable;
- activar/desactivar;
- sin salida, KDS, impresora o ambos;
- perfil KDS;
- prioridad;
- múltiples impresoras ordenadas;
- visibilidad KDS y asignación a productos;
- vinculación de estaciones KDS.

Las listas KDS, selector de productos y setup dejan de depender de arrays de departamentos hardcoded.

## Conector ESC/POS

- Selector por impresora: `simulator` o `tcp`.
- Producción rechaza simulador.
- TCP usa dirección/puerto configurados, timeout de conexión/escritura y límite de payload.
- Payload: inicialización, página CP858/CP437/Windows-1252, texto, feed, corte opcional y pulso de cajón explícito.
- Éxito significa bytes aceptados por el socket, no papel físicamente impreso.
- USB/agente local y protocolos específicos de fabricante no se implementan.

Estado físico: **PENDING_PHYSICAL_CERTIFICATION**.

## Cola y recuperación

- Claim optimista existente conservado.
- Orden: prioridad descendente y antigüedad.
- Lease para `sending`.
- Recuperación de lease expirado con marca `REENVIADO`.
- Backoff 5/15 segundos.
- Tres intentos y fallback único.
- Al volver el dispositivo, un job `error` puede recuperarse una vez automáticamente.
- Dedupe hash evita repetir el mismo trabajo normal; reimpresiones son copias intencionadas.
- Cola saturada se drena en lotes de diez sin eliminar jobs.

Raw TCP es semántica **at-least-once**: una caída tras aceptación del socket puede producir copia. Toda recuperación ambigua se marca visiblemente y audita.

## Reenvío y reimpresión

`POST /production/redispatch` permite:

- tarea → KDS;
- tarea → impresora del departamento u otra;
- tarea → KDS + impresora;
- trabajo impreso → misma u otra impresora.

Persistencia:

- KDS: `resentAt`, `resentBy`, `resentReason`, `resendCount`;
- impresión: nuevo trabajo prioritario con `REIMPRESIÓN` o `REENVIADO`;
- auditoría: usuario, timestamp, source, targets, motivo y destino.

Los endpoints legacy de resend/reprint/retry siguen funcionando.

## Administración unificada

Ruta: `/admin/produccion`.

Tabs:

1. Departamentos y prioridades.
2. Impresoras, plantilla y routing.
3. KDS y estado de estaciones.
4. Cola, retries y reimpresión.

Las rutas administrativas anteriores permanecen para compatibilidad.

## Evidencia software

- Migración limpia: 28 migraciones.
- API: 70 archivos / 795 tests.
- E2E: 26/26.
- Performance printing: p95 9,5 ms en certificación local.
- Tests ESC/POS: bytes, CP858, corte, cajón, copias, tamaño.
- TCP real local: write/refused/fail-closed.
- PostgreSQL: departments CRUD, redispatch, retry, fallback, lease recovery y queue batch.
- Regresiones: KDS, orders, service flow, concurrency y production gates.
- Auditoría de rutas: 64 routers sin endpoints sensibles desprotegidos.
- `pnpm audit --prod`: mantiene 2 vulnerabilidades high transitivas en `brace-expansion`.

## Pruebas físicas pendientes

Todas: **PENDING_PHYSICAL_CERTIFICATION**.

- Cada impresora y departamento.
- Papel agotado/tapa/estado según modelo.
- TCP desconectado y pérdida LAN.
- Ticket largo y caracteres españoles/catalanes/€.
- Corte y cajón.
- Fallback físico.
- Reinicio durante envío.
- KDS + impresora simultáneos.
- Reimpresión y reenvío con operador.

## Riesgos restantes

- Sin confirmación física de entrega en raw TCP.
- DLE/EOT de estado no implementado; papel/tapa dependen de prueba manual/modelo.
- Connector USB/local agent no existe.
- El admin de producción compone pantallas existentes; mantiene rutas legacy.
- OpenAPI global continúa con gate rojo previo y no se amplía en esta entrega.
