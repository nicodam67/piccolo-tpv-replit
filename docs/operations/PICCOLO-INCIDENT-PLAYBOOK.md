# Piccolo — Playbook de incidencias

Uso: camarero (**C**), encargado (**E**) y administrador (**A**). No ejecutar comandos de sistema ni introducir un cobro por segunda vez si el resultado es incierto. Guardar siempre hora, mesa/pedido, usuario, dispositivo y fotografía o mensaje mostrado.

## 1. La impresora no imprime

- **Síntomas:** el pedido figura enviado, pero no sale papel.
- **Comprobar (E):** cola de impresión, impresora activa, papel, tapa, alimentación y cable/red.
- **No hacer:** no pulsar “Enviar” repetidamente; no borrar el pedido.
- **Pasos:** C avisa al pase; E consulta `/admin/cola-impresion`; si está `retrying`, espera un ciclo; si está `error`, usa reintento una sola vez o reimpresión con motivo.
- **Escalar:** A si vuelve a `error` o varias impresoras fallan.
- **Evidencia:** ID del trabajo, estado, intentos, impresora, error y foto.

## 2. El KDS no recibe el pedido

- **Síntomas:** comanda enviada, tarea ausente en una partida.
- **Comprobar:** zona del producto, banner de conexión, pedido en otras partidas y `sin_partida`.
- **No hacer:** no crear otro pedido.
- **Pasos:** C confirma que el pedido está `sent`; E refresca el KDS una vez y revisa otra partida; usa reenvío KDS solo sobre la tarea existente.
- **Reintentar:** cuando API y red vuelvan; el KDS recarga desde PostgreSQL.
- **Escalar:** A si el producto tiene una zona no configurada.
- **Evidencia:** pedido, producto, `prepZone`, KDS y hora.

## 3. El pedido aparece duplicado

- **Síntomas:** dos comandas/tareas aparentemente iguales.
- **Comprobar:** IDs de pedido, mesa, marcas “AÑADIDO” o “REIMPRESIÓN”.
- **No hacer:** no cancelar ambos ni cobrar dos veces.
- **Pasos:** E identifica el ID autoritativo; conserva el pedido con movimientos/auditoría coherentes; marca manualmente el duplicado solo tras confirmar con cocina.
- **Escalar:** A antes de cualquier anulación financiera.
- **Evidencia:** IDs, capturas de KDS y tickets físicos.

## 4. El ticket no sale

- **Síntomas:** pago completado y ticket visible, pero sin impresión.
- **Comprobar:** estado del pago y cola de impresión.
- **No hacer:** no repetir el pago.
- **Pasos:** abrir el ticket existente; usar reimpresión, no nuevo cobro; si no hay conector productivo, aplicar procedimiento manual autorizado.
- **Escalar:** E/A si la cola no crea trabajo.
- **Evidencia:** paymentId, ticketId, trabajo y motivo de reimpresión.

## 5. La tablet pierde conexión

- **Síntomas:** banner offline, peticiones fallidas o socket desconectado.
- **Comprobar:** Wi‑Fi local, otros dispositivos y `/healthz` desde un terminal operativo.
- **No hacer:** no registrar cobros offline; no borrar datos del navegador.
- **Pasos:** mantener el pedido abierto; cambiar a punto de acceso autorizado; esperar reconexión; verificar mesa/pedido antes de continuar.
- **Escalar:** A si afecta a varias tablets.
- **Evidencia:** dispositivo, zona Wi‑Fi, hora y operación pendiente.

## 6. El TPV no carga

- **Síntomas:** pantalla en blanco, login inaccesible o error de red.
- **Comprobar:** otros terminales, red local, alimentación del servidor y estado comunicado.
- **No hacer:** no reinstalar ni limpiar almacenamiento.
- **Pasos:** probar otro terminal autorizado; mantener anotación manual temporal; A revisa diagnóstico y contacta soporte.
- **Escalar:** inmediato si todos los terminales fallan.
- **Evidencia:** URL, hora, captura y alcance.

## 7. El cobro físico queda incierto

- **Síntomas:** timeout, `conciliacion_pendiente` o dinero aceptado sin ticket.
- **Comprobar:** modal pendiente, transactionId y estado del dispositivo.
- **No hacer:** no iniciar otro cobro ni cambiar importe/método.
- **Pasos:** cerrar/reabrir el mismo modal para recuperar el mismo comando; si sigue incierto, E ejecuta conciliación autorizada; comprobar pedido y ledger.
- **Reintentar:** solo con la misma operación recuperada; nunca con una clave/comando nuevo.
- **Escalar:** A si requiere intervención manual.
- **Evidencia:** pedido, importe, terminal, transactionId y estado; nunca guardar la clave completa.

## 8. La caja no abre

- **Síntomas:** conflicto 409 o ausencia de sesión.
- **Comprobar:** sesión abierta en el mismo terminal y usuario/rol.
- **No hacer:** no cambiar el nombre del terminal para eludir el conflicto.
- **Pasos:** E localiza la sesión existente; la continúa o cierra correctamente; A reabre únicamente una sesión cerrada.
- **Escalar:** A si no se identifica la sesión.
- **Evidencia:** terminal, sesión, usuario y mensaje.

## 9. La caja automática no responde

- **Síntomas:** 503, desconectada o error del adaptador.
- **Comprobar:** configuración habilitada y estado; confirmar si es simulador.
- **No hacer:** no activar simulador en producción ni afirmar cobro completado.
- **Pasos:** detener nuevos comandos; recuperar/conciliar cualquier transacción pendiente; usar método manual autorizado si el propietario lo permite.
- **Escalar:** técnico del dispositivo.
- **Evidencia:** transactionId, estado y error; sin credenciales.

## 10. El QR no actualiza

- **Síntomas:** menú antiguo o `QR_NOT_CONFIGURED`.
- **Comprobar:** configuración de negocio, categoría/producto activo y `qrVisible`.
- **No hacer:** no habilitar fixtures/demo.
- **Pasos:** A guarda configuración real; verifica menú público en un dispositivo sin caché; espera actualización del navegador.
- **Escalar:** soporte si API pública devuelve 503 con configuración completa.
- **Evidencia:** URL pública, hora, categoría y respuesta.

## 11. PostgreSQL está caído

- **Síntomas:** múltiples 503, login/operaciones fallan.
- **Comprobar:** alcance general y panel de diagnóstico si responde.
- **No hacer:** no reintentar pagos, restore ni migraciones; no apagar el servidor.
- **Pasos:** pasar a operación manual autorizada; A informa al responsable técnico; conservar todas las anotaciones.
- **Reintentar:** solo tras confirmación técnica de recuperación.
- **Evidencia:** primera hora, última operación correcta y mensajes.

## 12. El servidor se reinicia

- **Síntomas:** desconexión breve y posterior recuperación.
- **Comprobar:** login, mesa/pedido, KDS y cola de impresión.
- **No hacer:** no duplicar envíos ni cobros.
- **Pasos:** esperar servicio estable; refrescar una vez; verificar tareas y trabajos persistidos; revisar trabajos `sending` con soporte.
- **Escalar:** si no vuelve o hay trabajos huérfanos.
- **Evidencia:** intervalo de caída e IDs pendientes.

## 13. El NAS no responde

- **Síntomas:** backup externo fallido o ruta no disponible.
- **Comprobar (A):** red, montaje y última copia verificada.
- **No hacer:** no cambiar permisos/rutas a ciegas; no borrar backups locales.
- **Pasos:** marcar destino no operativo; mantener copia local protegida; escalar al responsable de infraestructura.
- **Reintentar:** tras restaurar el montaje y verificar espacio.
- **Evidencia:** destino lógico, backupId, checksum/error; sin IP ni credenciales.

## 14. La copia falla

- **Síntomas:** estado `failed/corrupted`, checksum o manifest incorrecto.
- **Comprobar:** destino, espacio, última copia correcta y alerta.
- **No hacer:** no marcarla verificada ni restaurarla.
- **Pasos:** conservar el artefacto fallido para soporte; crear una nueva copia solo tras corregir la causa; ejecutar dry-run.
- **Escalar:** A/técnico.
- **Evidencia:** backupId, estado, checksum y manifest.

## 15. VeriFactu no responde

- **Síntomas:** pendiente/reintento/rechazo o conector no configurado.
- **Comprobar:** estado local, entorno y mensaje; no asumir aceptación AEAT.
- **No hacer:** no cambiar a simulador en producción ni reenviar repetidamente.
- **Pasos:** conservar ticket/factura; A registra incidencia y sigue contingencia fiscal aprobada externamente; reintentar solo según estado y política.
- **Escalar:** asesor fiscal/proveedor certificado.
- **Evidencia:** serie/número, registro, CSV/error; nunca certificado o contraseña.

## 16. Se corta Internet

- **Síntomas:** servicios externos fallan, LAN puede seguir.
- **Comprobar:** TPV/KDS local y router.
- **No hacer:** no usar cobro/fiscalidad externa como si estuviera confirmada.
- **Pasos:** continuar únicamente flujos locales autorizados; registrar pendientes externos; reconciliar al volver.
- **Escalar:** proveedor de Internet si excede el umbral del propietario.
- **Evidencia:** inicio/fin y operaciones externas pendientes.

## 17. Se corta la red local

- **Síntomas:** tablets, KDS e impresoras inaccesibles aunque haya Internet.
- **Comprobar:** switch, puntos de acceso y servidor.
- **No hacer:** no cambiar IPs ni resetear equipos sin autorización.
- **Pasos:** usar procedimiento manual; detener envíos/cobros ambiguos; A escala a infraestructura.
- **Evidencia:** dispositivos afectados y LEDs/estado observado.

## 18. Se corta la electricidad

- **Síntomas:** apagado general.
- **Comprobar:** seguridad de personas y SAI.
- **No hacer:** no manipular cuadros eléctricos ni reiniciar repetidamente.
- **Pasos:** activar operación manual; al volver, arrancar en orden aprobado (red, servidor/DB, KDS/impresoras, terminales); verificar última operación.
- **Escalar:** responsable del local/electricista.
- **Evidencia:** hora, duración y dispositivos sin SAI.

## 19. Cambio a operación manual

- **Síntomas:** bloqueo prolongado de infraestructura crítica.
- **Comprobar:** autorización del encargado.
- **No hacer:** no registrar después cobros ficticios ni mezclar numeraciones.
- **Pasos:** usar formularios numerados; anotar mesa, productos, impuestos, pagos y responsable; separar cobros pendientes; custodiar documentos.
- **Escalar:** A para plan de reconciliación.
- **Evidencia:** todos los formularios y totales.

## 20. Recuperar el servicio

- **Síntomas:** sistemas vuelven tras contingencia.
- **Comprobar:** DB, API, sesión de caja, mesas, KDS, cola, pagos y backups.
- **No hacer:** no volcar anotaciones automáticamente ni en paralelo.
- **Pasos:** A declara ventana de recuperación; E compara operaciones manuales con sistema; concilia una a una; identifica duplicados antes de insertar; realiza backup verificado.
- **Reabrir:** servicio normal solo tras confirmar caja, pedidos y dispositivos.
- **Evidencia:** checklist firmado, diferencias y acciones.
