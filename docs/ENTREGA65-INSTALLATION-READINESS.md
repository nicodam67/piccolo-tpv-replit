# Entrega 65 — Preparación de implantación real

## Decisión

**LISTO PARA CERTIFICACIÓN FÍSICA**, no para producción.

El software central está validado. Impresión, hardware, destinos externos y fiscalidad permanecen pendientes o bloqueados. El inventario autoritativo es `inventories/entrega65-hardware-capabilities.json`.

## Clasificación por bloque

| Bloque | Clasificación | Evidencia | Siguiente acción | Responsable | Cierre |
|---|---|---|---|---|---|
| TPV navegador | LISTO PARA PRUEBA FÍSICA | 752 tests + 26 E2E | D1–D7 | Propietario/IT | Flota aprobada |
| KDS software | LISTO PARA PRUEBA FÍSICA | FSM/socket/polling tests | Jornada A | Cocina/IT | Todas las zonas |
| Impresión productiva | NECESITA CORRECCIÓN DE SOFTWARE + HARDWARE | Cola lista; solo simulador | Elegir transporte y connector | Propietario/desarrollo | Matriz física aprobada |
| Departamentos | NECESITA DECISIÓN DEL PROPIETARIO | Modo global; zonas hardcoded | Definir departamentos/modos | Propietario | Diseño firmado |
| Tablets/PWA | NECESITA HARDWARE | Navegador/PWA no certificado | Jornada B | IT | D1–D7 |
| NFC/fichaje físico | NECESITA HARDWARE | API validada, lector no | Jornada B | RRHH/IT | PIN+NFC aprobados |
| Caja manual | LISTO PARA PRUEBA FÍSICA | E2E/locks/arqueo | Jornada C | Encargado | Cuadre real |
| Caja automática | BLOQUEADO | Solo SimulatorAdapter | Proveedor+adapter | Propietario | Hardware real |
| Cajón | BLOQUEADO | Sin ESC/POS kick | Connector impresión | Propietario | Apertura física |
| Tarjeta | NECESITA DECISIÓN DEL PROPIETARIO | Registro manual, sin TPE | Definir proceso/proveedor | Propietario | Conciliación aprobada |
| PostgreSQL | NECESITA CONFIGURACIÓN | 27 migraciones/restore OK | Topología/monitor/SAI | IT | Staging igual prod |
| NAS | NECESITA HARDWARE | Adapter mount software | Drill real | IT | Restore desde NAS |
| S3 | NECESITA CREDENCIALES | SDK mockeado | Bucket staging | IT | Restore real |
| Backup/restore local | LISTO PARA PRUEBA FÍSICA | 164 tablas, rollback | Jornada D externa | IT | Destino real |
| Rollback esquema | NECESITA DECISIÓN DEL PROPIETARIO | Forward-only | Aprobar forward-fix | Propietario/IT | Runbook firmado |
| Fiscal core | NECESITA CORRECCIÓN DE SOFTWARE | Hash/XML/QR listos | Puente y queue | Fiscal/desarrollo | Tests integración |
| VeriFactu AEAT | NECESITA CREDENCIALES + BLOQUEADO | Prod disabled | Jornada E | Fiscal/proveedor | Certificación externa |
| Offline cash | BLOQUEADO | Falla cerrado explícitamente | Mantener desactivado | Propietario | Solo futura entrega |
| Codegen global | NECESITA CORRECCIÓN DE SOFTWARE | Stamp rojo | Gate por dominio/monolito | Desarrollo | CI verde |
| Vulnerabilidades | NECESITA CORRECCIÓN DE SOFTWARE | 2 high transitivas | Upgrade compatible | Desarrollo | `pnpm audit` sin high |

## Impresión real

### Flujo actual

1. `POST /orders/:id/send` bloquea y consolida la comanda.
2. Según `business_config.printMode`, crea tareas KDS y/o llama a `dispatchKitchenPrint`.
3. Routing: producto → categoría → `prepZone` hardcoded.
4. Se insertan trabajos en `print_queue`.
5. Worker reclama `pending/retrying`, marca `sending` y usa `print-connector-sim`.
6. Éxito: `printed`; fallo: retry hasta 3, fallback opcional o `error`.
7. `print_audit` registra sent/failed/fallback/retry/reprint.

### Requisitos de departamentos

| Requisito | Estado |
|---|---|
| KDS global only | Implementado |
| Printers global only | Implementado, sin connector productivo |
| Ambos global | Implementado, sin connector productivo |
| Ninguno global | No modelado |
| KDS/printer/both/neither por departamento | Inexistente |
| Activar varias impresoras por categoría/producto | Implementado |
| Nuevos departamentos sin código | No; zonas/enrutamiento hardcoded |
| Reimpresión | Implementada como trabajo nuevo y auditado |
| Reimpresión a impresora alternativa | No es una selección explícita demostrada; existe fallback |
| Cancelación/modificación impresa | Builders sin call sites |
| Recuperación de `sending` tras crash | No implementada |
| ESC/POS/corte/cajón | No implementado |

Toda compatibilidad de impresora: **PENDING_PHYSICAL_CERTIFICATION**.

## Flujo completo de servicio — evidencia software

| Paso | Módulo / endpoint | Evento | Persistencia/auditoría | Recuperación | Física | Resultado |
|---:|---|---|---|---|---|---|
| 1 | Auth `/auth/pin` | sesión | JWT/revocation/audit | login nuevo | Tablet | Validado software |
| 2 | Cash `/cash-sessions/open` | caja abierta | cash_sessions/audit | 409/reopen | Cajón | Validado software |
| 3 | Tables `/tables/:id/open` | mesa ocupada | order/table | lock/refetch | Tablet | E2E |
| 4 | Orders items | pedido | order_items | socket/refetch | Tablet | E2E |
| 5 | Modifiers | detalle | JSON/line item | relectura | Tablet | Tests |
| 6 | `/orders/:id/send` | comanda | sentAt/KDS/stock | idempotencia | LAN | E2E |
| 7 | `/kds/:zone` | recepción | kitchen_tasks | socket+poll | KDS | Tests/list E2E |
| 8 | print dispatch | trabajos | print_queue/audit | retry/fallback | Printer | Solo software |
| 9 | KDS PATCH/pase | estados | kitchen_tasks/audit | resend | KDS | Tests |
| 10 | Pase | collected/served | tasks/order | refetch | KDS | Tests |
| 11 | Prefactura | documento previo | prefactura_prints/audit | reprint | Printer | Software |
| 12 | Payments | pago | payments/order/table | locks/replay | TPE/cash | E2E manual methods |
| 13 | Ticket | ticket T | tickets/audit | reprint | Printer | E2E software |
| 14 | Fiscal | pending | ticket/invoice/verifactu | retry parcial | AEAT | Incompleto |
| 15 | Tables clean | mesa libre | table state | refetch | Tablet | E2E |
| 16 | Cash close | arqueo | session/Z/audit | idempotencia | Efectivo | E2E |

No se considera validada la impresión, KDS físico ni fiscalidad externa por estos resultados.

## Tablets y dispositivos

- Arquitectura inicial codificada: cinco tablets + PC principal; siete dispositivos no son una restricción certificada.
- El TPV funciona en navegador; PWA existe, pero el manifest está orientado a fichaje.
- Cada D1–D7 debe ejecutar pedido, reconexión, actualización y recuperación.
- NFC exige HTTPS, Chrome Android y lector físico.
- Device tokens de fichaje soportan pairing/revoke; deben probarse físicamente.
- Offline IndexedDB existe, pero las páginas no encolan operaciones de pedido; no anunciar TPV offline.
- `cash_payment` offline devuelve fallo explícito y no crea ledger.

## Escenarios de servidor y copias

| Escenario | Componentes | Ventajas | Riesgos/Internet | Recuperación | Dificultad | Compatibilidad actual |
|---|---|---|---|---|---|---|
| A Local + NAS | API/PG local, NAS mount | LAN independiente de Internet | Energía/NAS/LAN | Restore desde mount | Media | Adapter local/NAS; físico pendiente |
| B Cloud + S3 | API/PG cloud, S3 | Operación remota/off-site | Dependencia Internet/credenciales | Restore staging S3 | Media | SDK implementado, solo mock |
| C Local + copia externa | API/PG local, disco rotado | Simple y control local | Operación manual/pérdida | Restore desde mount | Media | local_mount; rotación manual |
| D Híbrida | Componentes local/cloud | Redundancia potencial | Split-brain, archivos fuera de DB | Runbook específico | Alta | Un destino por schedule; sin restore unificado |

El TerraMaster F4-424 es únicamente candidato para A; Piccolo lo vería como mount SMB/NFS y no valida RAID/TOS.

Backups son snapshots completos aunque el tipo diga incremental/config/docs. `uploads/invoices` e imágenes externas requieren copia separada.

## Mapa fiscal exacto

```text
Pedido
→ pago
→ ticket T (verifactuStatus=pending)
→ [NO HAY PUENTE]
→ factura F/R opcional y manual
→ POST admin/verifactu/records(invoiceId)
→ record estado=validado
→ envío manual
→ simulador no-prod / producción bloqueada
→ respuesta y audit si se enviara
```

| Componente | Estado |
|---|---|
| Numeración T/F/R y impuestos | Implementado |
| Prefactura no fiscal | Implementado |
| Hash/encadenamiento/XML/QR | Validado software |
| Ticket→record fiscal | No conectado |
| Invoice→record | API manual, sin automatización/UI |
| Record→worker | Misalineado: `validado` no entra en cola |
| Firma XAdES/mTLS | No implementada |
| Certificado/AEAT test/prod | Bloqueado externo |
| Rectificación/anulación | Parcial/manual |
| Contingencia | No implementada |
| Conformidad legal | No afirmada |

## Riesgos altos de Entrega 64

### Vulnerabilidad `brace-expansion`

`exceljs@4.4.0 → archiver@5 → minimatch@3/5 → brace-expansion@1/2`. El parche disponible es 5.0.8, pero forzarlo sobre consumidores antiguos puede romper export Excel. No se aplica override sin un smoke XLSX compatible.

Resultado real: `pnpm audit --prod` mantiene 2 high. `pnpm audit` completo informa 7 vulnerabilidades (5 high, 1 moderate, 1 low), incluyendo además React Router, PostCSS y esbuild en herramientas/otros artefactos.

### Offline cash

El stub que antes aparentaba éxito ahora queda `failed` con `offline_cash_payment_unsupported`; PostgreSQL confirma cero pagos nuevos y reintento estable.

### NAS/S3

Lógica local/checksum/restore validada; NAS real y S3 real siguen pendientes.

### Rollback SQL

El runner es forward-only. Restore transaccional de datos pasa; downgrade de esquema no existe.

### Codegen global

- Gate rojo por drift entre `openapi.yaml` y `.codegen-stamp`.
- Cobertura 46,5% es un problema distinto.
- Gates por dominio son deterministas.
- No actualizar stamp sin regenerar y validar clientes globales.

## Criterio de salida de Entrega 65

La documentación y software quedan preparados para ejecutar certificación física. Producción permanece bloqueada hasta cerrar impresión/department modes, hardware elegido, destino externo, puente fiscal, vulnerabilidades y codegen global.
