# Piccolo — Plan de certificación física

Estado de todas las pruebas de este documento: **PENDING_PHYSICAL_CERTIFICATION**.

No se incluyen marcas, IP, credenciales, certificados ni fechas. Responsable y lugar deben asignarse antes de ejecutar. La duración se mide por casos completados, no por calendario.

## Preparación común

### Hardware

- Servidor/host candidato con PostgreSQL de staging.
- Red LAN aislada representativa.
- Impresoras candidatas por cada departamento real.
- Pantallas KDS candidatas.
- Flota real de tablets/teléfonos.
- Cajón, caja automática o terminal físico únicamente si el propietario decide integrarlos.
- NAS/S3 candidato y SAI si forman parte de la arquitectura.

### Credenciales

- Cuentas de prueba por rol.
- Secretos temporales de staging.
- Credencial de backup de staging.
- Certificado/credenciales fiscales exclusivamente en entorno autorizado.

Nunca copiar credenciales a tickets, capturas, documentación o repositorio.

### Red

- VLAN/LAN y Wi‑Fi de staging.
- Direcciones estables definidas por infraestructura.
- HTTPS válido.
- Internet desconectable para pruebas de contingencia.

### Datos

- Catálogo ficticio con acentos, catalán, precios, impuestos y modificadores.
- Departamentos definitivos.
- Mesas y usuarios de prueba.
- Pedidos identificados como certificación y eliminables.

### Evidencia común

- ID de prueba y resultado.
- Hora de inicio/fin.
- Captura o vídeo sin secretos.
- IDs de pedido/trabajo/transacción.
- Extracto de auditoría.
- Firma del responsable.

## Jornada A — Impresión y KDS

**Responsables:** encargado de cocina, administrador Piccolo, técnico de red/impresión.  
**Lugar:** LAN de staging del restaurante.  
**Duración:** hasta completar todos los casos por dispositivo y zona.

| Prueba | Preparación/pasos | Resultado esperado | Evidencia | Aprobar | Rechazar | Rollback |
|---|---|---|---|---|---|---|
| Ticket por zona | Enviar un producto cocina/pizza/ensalada/barra/pase | Solo destinos configurados reciben | Trabajo, tarea y papel | 100% correcto | Falta/duplicado/zona errónea | Volver a KDS-only |
| KDS-only | Seleccionar modo y enviar | Tareas, cero trabajos print | DB/GUI | Exacto | Trabajo inesperado | Restaurar config |
| Printer-only | Seleccionar modo y enviar | Papel, cero tareas KDS | DB/papel | Exacto | Tarea/ausencia papel | Restaurar config |
| Both | Enviar una comanda | KDS y papel una vez | IDs/foto | Ambos | Falta/duplicado | KDS-only |
| Neither por departamento | Verificar requerimiento | Actualmente no soportado | Decisión | Solo si se descarta | Se necesita | Bloquear go-live |
| Impresora apagada | Apagar antes de enviar | Retry→fallback/error visible | Cola/audit | Sin pérdida silenciosa | Printed falso | Reactivar |
| Papel agotado | Retirar papel | Error detectable; recuperación | Foto/cola | Recupera una vez | Duplicado | Reprint autorizado |
| Red desconectada | Aislar printer/KDS | Fail y posterior recuperación | Red/cola | Coherente | Pérdida | Restaurar LAN |
| Reinicio API | Dejar pending/retrying/sending y reiniciar | Pending/retrying recuperan; documentar sending | DB | Sin duplicado | Job huérfano no tratado | KDS/manual |
| Reimpresión | Reimprimir con motivo | Marca visible/audit | Papel/audit | Trazable | Indistinguible | Anular copia |
| Alternativa | Fallar primaria | Fallback recibe una copia | Papel/audit | Correcto | Doble/ninguno | Primary-only |
| Ticket largo | 30+ líneas/modificadores | Legible y sin truncar | Papel | Completo | Corte contenido | Reducir temporalmente |
| Caracteres | ñ, ç, l·l, accents, €, comillas | Legibles | Papel | Todos correctos | Mojibake | Bloquear modelo |
| Corte/cajón | Ejecutar checklist físico | Acción exacta una vez | Vídeo | Correcto | Ausente/doble | Desactivar |
| Reconnect KDS | Cortar y restaurar LAN | Refetch recupera tareas | Vídeo/socket | Sin pérdida | Reenvío necesario | Ticket respaldo |

## Jornada B — Tablets y red

**Responsables:** siete usuarios de prueba, encargado, técnico Wi‑Fi.  
**Lugar:** todas las zonas reales.  
**Duración:** hasta completar checklist D1–D7 y terminal administrador.

Por cada dispositivo registrar: identificador interno, rol, zona Wi‑Fi, navegador/PWA, impresora/KDS asociada y resultado.

Pruebas: login/PIN, mesa, pedido, modificador, envío, cambio de orientación, pantalla pequeña, suspensión/reanudación, pérdida Wi‑Fi, reconexión, actualización PWA, logout/revocación, recuperación de pedido. Tablet fichaje: pairing, PIN, NFC, revocación y re-pair.

**Aprobar:** los siete dispositivos operan simultáneamente sin pérdida/duplicado y recuperan estado.  
**Rechazar:** cobertura insuficiente, sesión cruzada, token no revocable o pedido perdido.  
**Rollback:** retirar dispositivo fallido y mantener flota aprobada; no activar offline cash.

## Jornada C — Caja y pagos físicos

**Responsables:** encargado, administrador, proveedor del dispositivo.  
**Lugar:** caja de staging.  
**Duración:** todos los estados financieros y de error.

Pruebas: apertura, efectivo, cambio, pago parcial/mixto, doble clic, timeout, cancelación, cierre/reapertura del modal, replay, conciliación, refund autorizado, Z-report y recuento físico. Para tarjeta manual, documentar conciliación externa. Para caja automática, exigir adaptador no simulado.

**Aprobar:** una operación física produce un solo ledger y cuadra TPV/dispositivo.  
**Rechazar:** éxito ficticio, doble cobro, 503 oculto o conciliación imposible.  
**Rollback:** deshabilitar método físico y volver a proceso manual aprobado.

## Jornada D — Backup y restauración

**Responsables:** administrador y responsable de infraestructura.  
**Lugar:** staging aislado; nunca base productiva.

Ejecutar por cada arquitectura candidata: backup completo, checksum, corrupción, credencial inválida, falta de espacio, pérdida de red/destino, retención, restore limpio, restore repetido y rollback. Añadir copia/restauración separada de `uploads/invoices` e imágenes.

**Aprobar:** artefacto verificado, restauración coherente y RPO/RTO aceptados por propietario.  
**Rechazar:** checksum ignorado, archivos ausentes no documentados o secreto no rotatable.  
**Rollback:** restaurar snapshot protegido de staging.

## Jornada E — Fiscalidad

**Responsables:** asesor fiscal, propietario, integrador autorizado.  
**Lugar:** entorno AEAT de pruebas autorizado.

Pruebas: numeración/serie, impuestos, alta, hash/encadenamiento, firma/certificado, envío, aceptación/rechazo, retry, rectificación, anulación, contingencia, conciliación y auditoría.

**Aprobar:** puente ticket/factura→registro automático o procedimiento autorizado, respuesta almacenada y validación legal externa.  
**Rechazar:** simulador, certificado ausente, ticket perpetuamente pending o worker no conectado.  
**Rollback:** desactivar conector y aplicar contingencia legal aprobada.

## Jornada F — Servicio completo

**Responsables:** equipo de sala/cocina/barra/caja y observadores.  
**Lugar:** restaurante cerrado al público o staging físico equivalente.

Secuencia: login, caja, mesas simultáneas, productos/modificadores, departamentos, KDS, impresión, cambios/anulaciones, prefactura, pagos completos/parciales/split, ticket/fiscal, limpieza, cierre, backup y recuperación de una incidencia inducida.

**Aprobar:** cero pérdida/doble efecto, auditoría completa, caja cuadra y todos los PENDING relevantes quedan aprobados.  
**Rechazar:** cualquier duplicidad financiera, pérdida de pedido, falta de ticket obligatorio o bloqueo sin playbook.  
**Rollback:** detener simulación, conciliar, restaurar datos de staging y revertir configuración.

## Condición final

No cambiar a “APTO” hasta adjuntar evidencia de todas las pruebas críticas, cerrar rechazos y obtener aprobación del propietario, responsable técnico y asesor fiscal cuando corresponda.
