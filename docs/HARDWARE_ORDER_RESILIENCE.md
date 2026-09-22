# Hardware productivo y resiliencia de comandas

## Inventario previo

### Flujo encontrado

La aplicación TPV/tablet comparte la pantalla `order.tsx`. Una mesa abre un
`order`; cada pulsación crea un `order_item` en estado `draft`. Al enviar,
`POST /api/orders/:orderId/send` toma un advisory lock por pedido, relee los
borradores bajo bloqueo y confirma en una única transacción:

- tareas KDS;
- cambio de líneas y pedido a `sent`;
- consumos y snapshot COGS;
- respuesta idempotente, cuando el cliente aporta `Idempotency-Key`.

Socket.IO solo invalida caché. PostgreSQL es la fuente autoritativa y el KDS
vuelve a consultar periódicamente, por lo que perder un evento no borra una
comanda.

### Modelos reutilizados

- `orders`, `order_items`, `kitchen_tasks`: comanda y preparación.
- `products.prep_zone`: destino de cada producto.
- `kds_stations`: pantallas registradas.
- `printers`, `print_routing`, `print_queue`, `print_audit`: impresión.
- `idempotency_keys`: repetición segura del envío HTTP.
- `audit_log`: historial operativo.

No se crea un segundo sistema de comandas. La migración 0032 añade un catálogo
canónico de departamentos y fortalece esas tablas.

### Problemas encontrados

1. El encolado de impresora ocurría después del commit del pedido y sus errores
   se ignoraban. En `printers_only` era posible aceptar una comanda sin ninguna
   salida persistente.
2. El conector era aleatorio y simulado. `printed` no significaba impresión
   física.
3. Un reinicio dejaba trabajos `sending` bloqueados para siempre.
4. No había deduplicación por comanda, lote e impresora ni backoff real.
5. Departamentos y pestañas KDS estaban hardcodeados en varios clientes.
6. El borrado de una línea enviada eliminaba por cascada la tarea cancelada.
7. Reenviar una tarea cambiaba su fecha original y no quedaba marcado en KDS.
8. “Online” podía basarse en una observación antigua o simulada.
9. La clave idempotente del envío se perdía al recargar el navegador.
10. La cola IndexedDB existente no está conectada al dominio de pedidos; por
    tanto no se considera un modo offline productivo.

## Arquitectura reforzada

### Departamentos

`production_departments` define `code`, nombre, tipo, workflow y salidas
`kds_enabled`/`printer_enabled`. Productos, estaciones e impresoras usan el
código. Un departamento nuevo puede crearse desde administración y aparecer en
producto/KDS sin modificar código.

Una partida de producción sin KDS ni impresora aparece como error en el monitor.
El tipo explícito `none` permite productos que intencionadamente no requieren
preparación. `pass` sigue siendo agregador, no destino de producción.

### Outbox transaccional

Para cada lote enviado, las filas de `print_queue` se crean dentro de la misma
transacción que KDS, stock y estado del pedido. Si impresión está habilitada y
no hay ruta activa, toda la operación devuelve 422 y no marca las líneas como
enviadas.

La clave única es:

`documentType:orderId:printerId:sorted(orderItemIds)`

Dos camareros, una reconexión o dos claves HTTP distintas no pueden crear otra
tarea KDS ni otro trabajo para el mismo lote/destino.

### Estados de impresión

- `pending`: durable, aún no reclamado.
- `sending`: lease activo de un worker.
- `retrying`: fallo conocido con próximo intento y backoff exponencial.
- `delivered`: transporte/agente aceptó el trabajo.
- `failed`: agotó intentos o configuración inválida.
- `delivery_unknown`: el proceso terminó durante un envío y repetirlo podría
  duplicar papel.
- `cancelled`: cancelación administrativa.

`delivered` no equivale necesariamente a papel impreso. `confirmation_level`
distingue `simulated`, `transport`, `spooler` y `device`. TCP 9100 solo confirma
escritura aceptada por el sistema operativo. El agente Windows puede confirmar
spooler o dispositivo si su implementación lo soporta. La confirmación física
final depende del modelo y debe probarse en restaurante.

Al arrancar, los leases vencidos pasan a `delivery_unknown`; nunca se reimprimen
silenciosamente. Los trabajos `pending` y `retrying` sí continúan.

### ESC/POS

El adaptador TCP genera bytes ESC/POS con inicialización, página de caracteres,
texto, pulso de cajón opcional y corte opcional. Se configuran:

- conexión `tcp`, `windows_agent` o `simulation`;
- IP/puerto o URL del agente;
- departamento;
- papel 58/80 mm;
- CP437/CP850/CP858;
- copias, corte y cajón;
- impresora de respaldo.

El agente Windows usa HTTP saliente/local con `Idempotency-Key`; el token se
obtiene de `PRINT_AGENT_TOKEN`. El simulador queda identificado como tal y no
sirve como certificación productiva.

### KDS, anulaciones y reenvíos

Las tareas sobreviven a navegador, Socket.IO y reinicio del API. Las zonas se
cargan desde el catálogo. Las transiciones usan compare-and-set para impedir que
dos pantallas sobrescriban silenciosamente estados concurrentes.

Las tareas anuladas permanecen como snapshot aunque se elimine la línea
comercial. Una anulación con impresión habilitada debe encolar primero un
ticket `ANULADO`; si no hay ruta, no se acepta. Los reenvíos conservan la fecha
original y muestran `REENVIADO ×N`, actor, fecha y motivo en auditoría.

Las reimpresiones crean un trabajo nuevo, incluyen una cabecera inequívoca
`REIMPRESION`, exigen motivo y pueden elegir otra impresora.

### Tablet y red

La clave de `send` se guarda por pedido en `localStorage` antes del request. Si
se corta Wi-Fi tras pulsar, una recarga o repetición utiliza la misma referencia;
el servidor devuelve el resultado persistido o el estado autoritativo. El
cliente avisa que el resultado es incierto y refresca el pedido.

Esto protege el instante crítico de envío, pero **no convierte toda la toma de
pedidos en offline**: abrir mesa, añadir, editar y borrar aún requieren servidor.
La cola IndexedDB antigua no se usa porque escribe por un endpoint alternativo
que no comparte todas las reglas de dominio. Integrarla sin extraer primero
servicios transaccionales comunes sería inseguro.

## Monitor operativo

`GET /api/admin/hardware-monitor` y la pantalla de cola muestran:

- estado conocido y fuente de evidencia;
- última comprobación;
- pendientes, fallos y entregas ambiguas;
- último error;
- estaciones KDS registradas;
- departamentos sin salida;
- configuración bloqueante.

`recently_seen`, `reachable` o `last_probe` nunca se presentan como confirmación
de impresión física.

## Checklist de prueba física

Usar primero un único TPV Windows, una tablet, una impresora y un KDS.

1. Configurar un departamento de prueba con KDS + impresora.
2. Configurar la impresora real, ejecutar “Probar impresión” y comprobar
   caracteres españoles, €, ancho, corte y cajón.
3. Enviar `2 × Pizza`, `SIN CEBOLLA`, `+ EXTRA`; comparar KDS y papel.
4. Añadir después `1 × Pizza Margarita`; verificar que solo aparece/imprime
   `AÑADIDO`.
5. Anular una línea; comprobar `ANULADO`, motivo y permanencia visible.
6. Reimprimir a la misma impresora y a otra; comprobar `REIMPRESION`.
7. Apagar la impresora, enviar una comanda y comprobar alerta/fallo visible.
8. Encenderla y autorizar reintento; comprobar una sola copia.
9. Desconectar KDS, enviar y reconectar; comprobar recuperación desde servidor.
10. Cortar Wi-Fi justo después de “Enviar”, reconectar y comprobar que no se
    duplica.
11. Reiniciar API con trabajos `pending`; comprobar continuación.
12. Reiniciar API durante `sending`; comprobar `delivery_unknown` y decisión
    manual, nunca reimpresión automática.
13. Enviar simultáneamente desde dos sesiones; comprobar una sola tarea/salida.
14. Completar NUEVA → EN PREPARACIÓN → LISTA → PASE y revisar orden temporal.
15. Revisar monitor y auditoría: actor, hora, origen, destino, intentos y error.

Registrar modelo/firmware, tipo de conexión, resultados y fotografías. Solo tras
esta checklist se puede certificar el hardware físico.
