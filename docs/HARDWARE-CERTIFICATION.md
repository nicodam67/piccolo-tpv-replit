# Certificación de hardware de producción

Esta validación debe ejecutarse en el restaurante. Los simuladores no certifican hardware real.

| Elemento | Evidencia obligatoria | Criterio |
|---|---|---|
| Impresoras ESC/POS | Prueba desde `/admin/prueba-impresion` y cola sin errores | Ticket legible, corte y enrutado por zona |
| KDS cocina/pizza/ensalada/barra/pase | Ping de `/admin/kds-stations` y comanda real | `reachable=true`, actualización en tiempo real |
| NAS | Backup, descarga, checksum y restore staging desde mount | Integridad válida y permisos `0700/0600` |
| S3 compatible | Upload, HEAD, download y restore staging | Metadata checksum coincidente |
| TPV | Flujo mesa→comanda→cobro desde cada dispositivo | Sin duplicados ni pérdida de conexión |
| Lectores NFC | Identificación, fichaje y rechazo de tarjeta inválida | Usuario correcto y auditoría |
| Tablets | Login, modo avión, cola offline y resincronización | Sin pérdida ni duplicación |
| Estaciones cocina | Reinicio durante una comanda | Recuperación de tareas pendientes |

## Procedimiento

1. Ejecutar `scripts/run-e2e-staging-local.sh` y `scripts/run-restore-staging-local.sh`.
2. Abrir `/admin/installation/diagnosis` y archivar el JSON.
3. Ejecutar una prueba por cada dispositivo físico y registrar serie, IP, resultado y operador.
4. Ejecutar un backup externo y restaurarlo en PostgreSQL staging.
5. No autorizar producción si falta un dispositivo crítico, hay trabajos de impresión en error
   o el último backup externo no está verificado.

## Estado del entorno cloud

No hay impresoras, lectores NFC, tablets, terminales de caja, NAS ni credenciales S3 reales.
Por tanto, la certificación física queda pendiente y bloquea un GO incondicional.
