# Piloto físico Piccolo: 1 TPV + 1 tablet + 1 ESC/POS + 1 KDS

Esta prueba valida una sola pareja impresora/KDS antes de desplegar las cinco
zonas. No certifica hardware por anticipado ni requiere pedido offline completo.

## Preparación

- [ ] TPV Windows y agente `0.1.0` instalados.
- [ ] Token del agente configurado en Windows (DPAPI) y en el servidor como
  `PRINT_AGENT_TOKEN`.
- [ ] UUID de la impresora en `config.json` idéntico al de Administración.
- [ ] Departamento piloto con KDS e impresora activados.
- [ ] Impresora con papel, dirección/cola RAW confirmada y página CP858.
- [ ] KDS abierto en el departamento piloto.
- [ ] Hora de TPV, servidor, tablet y KDS sincronizada.
- [ ] Cola de impresión y monitor hardware abiertos.

Anotar versión del agente, modelo/firmware de impresora, driver o IP/puerto,
Windows, navegador de tablet/KDS, red Wi-Fi y SHA-256 del instalador.

## Registro

Para cada caso se deben completar **dos resultados independientes**:

- **Software**: `PASS`, `FAIL` o `NO VERIFICABLE`.
- **Salida física**: `PASS`, `FAIL` o `NO VERIFICABLE`.

`transport` y `spooler` son confirmaciones software. Nunca prueban por sí solos
que salió papel.

| # | Prueba | Procedimiento y resultado esperado | Software | Salida física | Evidencia / incidencia |
|---|---|---|---|---|---|
| 1 | Diagnóstico | Agente activo; último servidor autorizado visible; impresora configurada; KDS accesible. | PENDIENTE | N/A | |
| 2 | Test local | Pulsar “Imprimir prueba”; un único ticket legible. | PENDIENTE | PENDIENTE | |
| 3 | Comanda normal | Enviar un producto; aparece una vez en KDS y una vez en papel. | PENDIENTE | PENDIENTE | |
| 4 | Caracteres | Imprimir `á é í ó ú ñ ç €`; comparar exactamente. | PENDIENTE | PENDIENTE | |
| 5 | Modificadores | Enviar extras/sin ingrediente; deben destacar y no duplicar la línea. | PENDIENTE | PENDIENTE | |
| 6 | Observaciones | Enviar nota y alergia; deben ser legibles y destacadas. | PENDIENTE | PENDIENTE | |
| 7 | AÑADIDO | Tras enviar, añadir otra línea; solo la nueva llega marcada como añadida. | PENDIENTE | PENDIENTE | |
| 8 | Anulación | Anular una línea enviada con motivo; KDS y ticket muestran anulación sin borrar historia. | PENDIENTE | PENDIENTE | |
| 9 | REENVIADO | Reenviar con motivo; queda auditado y claramente marcado. | PENDIENTE | PENDIENTE | |
| 10 | REIMPRESIÓN | Reimprimir con motivo; una copia nueva marcada, sin alterar el original. | PENDIENTE | PENDIENTE | |
| 11 | Corte | Ticket termina con corte correcto; no corta contenido. | PENDIENTE | PENDIENTE | |
| 12 | Cajón | Solo la prueba configurada genera un pulso; la comanda normal respeta configuración. | PENDIENTE | PENDIENTE | |
| 13 | Impresora apagada | Apagar antes de enviar; trabajo queda visible pendiente/fallido, nunca como papel confirmado. | PENDIENTE | PENDIENTE | |
| 14 | Reconexión | Encender y reintentar de forma controlada; sale exactamente una copia. | PENDIENTE | PENDIENTE | |
| 15 | Papel agotado | Retirar papel; registrar lo observable por driver/modelo y evitar afirmar impresión física. | PENDIENTE | PENDIENTE | |
| 16 | Wi-Fi tablet | Cortar Wi-Fi inmediatamente después de Enviar; reconectar y repetir con la misma operación; una sola comanda. | PENDIENTE | PENDIENTE | |
| 17 | Reinicio agente | Detener/reiniciar servicio con trabajo en curso; estado queda completado o ambiguo, nunca se duplica automáticamente. | PENDIENTE | PENDIENTE | |
| 18 | Reinicio servidor | Reiniciar con outbox pendiente; recupera estado y entrega una sola vez. | PENDIENTE | PENDIENTE | |
| 19 | Reinicio KDS | Reiniciar navegador/equipo KDS; recupera las tareas pendientes en orden. | PENDIENTE | N/A | |
| 20 | Doble envío concurrente | Dos acciones con el mismo identificador; una sola tarea y una sola impresión. | PENDIENTE | PENDIENTE | |
| 21 | Revisión final | Cola sin trabajos inesperados; auditoría contiene creación, entrega/fallo y acciones manuales. | PENDIENTE | N/A | |

## Criterio de salida

El piloto queda **PASS** solo si no se pierde ninguna comanda, no aparece ningún
duplicado silencioso, los fallos quedan visibles y todos los casos críticos
aplicables tienen `PASS` tanto en software como en salida física. Un estado
`NO VERIFICABLE` debe incluir el motivo (por ejemplo, el modelo no informa
“sin papel”) y la mitigación operativa acordada.
