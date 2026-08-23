# Plan de pruebas físicas — Piccolo TPV 0.9.0-rc.2

> VERSIÓN DE PRUEBAS — NO USAR PARA FACTURACIÓN FISCAL REAL.

Todos los resultados se anotan en `REGISTRO-RESULTADOS-HARDWARE.md`.

## Preparación

- [ ] Commit del paquete coincide con `BUILD-MANIFEST.json`.
- [ ] Servidor conectado por Ethernet y con IP/reserva DHCP estable.
- [ ] Router, switch y Wi-Fi local identificados.
- [ ] Datos, empleados, productos y cobros marcados como PRUEBA.
- [ ] VeriFactu está en `simulador` o `pruebas`, nunca `produccion`.
- [ ] Backup inicial verificado.

## Windows TPV

- [ ] Instalación y desinstalación preservando datos.
- [ ] Inicio, login y URL del servidor.
- [ ] Salas, mesas, productos, modificadores y notas.
- [ ] Apertura/cierre de caja.
- [ ] Comanda, cobro de prueba y ticket.
- [ ] Reinicio con operación ya confirmada: no duplica pago/factura.

## Tablets camarero

- [ ] Android Chrome/PWA sobre LAN.
- [ ] Login y selección de camarero.
- [ ] Abrir mesa, añadir/modificar, enviar comanda.
- [ ] Restricciones por rol.
- [ ] Pérdida y recuperación de Wi-Fi.

## KDS

- [ ] `/kds/cocina`
- [ ] `/kds/pizza`
- [ ] `/kds/ensalada`
- [ ] `/kds/barra`
- [ ] `/kds/pase`
- [ ] Modos `kds_only`, `printers_only` y `both`.
- [ ] “Ninguno” se valida dejando sin estación/impresora activa para la partida;
      no existe un valor global `none` en la configuración actual.
- [ ] Reenvío KDS conserva usuario, hora y auditoría.

## Impresoras ESC/POS TCP

- [ ] IP fija y puerto 9100 accesibles.
- [ ] Prueba 80 mm.
- [ ] Prueba 58 mm.
- [ ] `€`, `ñ`, `áéíóú`, `¿?`, `¡!`.
- [ ] Corte automático.
- [ ] Copias configuradas.
- [ ] Producto/categoría → departamento → impresora.
- [ ] Desconectar: cola pasa a reintento/error.
- [ ] Reconectar y reintentar.
- [ ] Impresora de respaldo.
- [ ] Reimpresión muestra `REIMPRESIÓN`, actor y motivo.

## Fichaje

- [ ] Emparejar `/fichaje/tablet`.
- [ ] PIN correcto e incorrecto.
- [ ] Entrada, descanso, retorno y salida.
- [ ] Historial administrativo.
- [ ] LAN sin Internet.

## Sin Internet WAN

1. Desconectar sólo WAN.
2. Mantener servidor/router/switch/Wi-Fi.
3. Abrir mesa y enviar comanda.
4. Confirmar KDS e impresora.
5. Cobrar operación de PRUEBA.
6. Confirmar ticket y RF persistentes con envío pendiente.
7. Reiniciar un cliente.
8. Restaurar WAN.
9. Confirmar que no hubo envío AEAT producción.

## Fallos controlados

| Fallo | Esperado |
|---|---|
| Tablet apagada | El resto continúa; recupera al volver |
| TPV reiniciado | Estado confirmado persiste; no duplica |
| Impresora caída | Cola/auditoría registran error |
| KDS caído | Comanda persiste y reaparece |
| Wi-Fi perdido | Aviso; no comunica éxito falso |
| Servidor reiniciado | Indisponibilidad temporal y recuperación persistente |
| Internet perdido | LAN operativa; RF pendiente |

## Diagnóstico

- [ ] Descargar ZIP desde Administración → Diagnóstico.
- [ ] Verificar que no contiene secrets, tokens, certificados ni base de datos.
- [ ] Adjuntar hora, dispositivo, pasos y fotos del hardware si procede.
