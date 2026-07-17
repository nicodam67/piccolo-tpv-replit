# Manual Operativo — Piccolo TPV

> Dirigido a: encargados y camareros  
> Nivel: sin conocimientos técnicos requeridos  
> Última actualización: 2026-07-17

---

## Antes de empezar

Para entrar al sistema necesitas tu **número de empleado** y tu **PIN de 4 dígitos**.  
Si no tienes PIN, pide al administrador que te lo cree desde el menú de Empleados.

La aplicación se abre en el navegador del terminal TPV. Si ves una pantalla en blanco, recarga la página (F5).

---

## 1. Abrir el restaurante (inicio de turno)

1. Enciende el terminal TPV y abre el navegador.
2. Aparece la pantalla de selección de empleado. Toca tu nombre.
3. Introduce tu PIN de 4 dígitos.
4. Verás el **plano de mesas** (pantalla principal).
5. Si hay un mensaje en amarillo de "Sin conexión", llama al encargado — el TPV funciona con conexión a la red local.

**Comprobaciones de apertura:**
- Confirma que el plano de mesas carga correctamente.
- Confirma que la pantalla de KDS (cocina) está encendida y muestra "Sin comandas pendientes".
- El encargado debe abrir la **caja** antes de cobrar (ver sección 2).

---

## 2. Abrir caja

> Solo encargados o el rol "Caja" pueden abrir y cerrar la sesión de caja.

1. Desde el plano de mesas, toca el botón **Caja** (parte superior derecha) o ve a `/caja`.
2. Si no hay sesión activa, aparece el formulario de apertura.
3. Introduce el **efectivo inicial** que hay en el cajón (ej. 200,00 €).
4. Toca **Abrir caja**.
5. Aparece el resumen de la sesión activa con el saldo inicial.

> Si ya hay una sesión abierta de ayer sin cerrar, llama al administrador para cerrarla primero.

---

## 3. Abrir una mesa

1. En el plano de mesas, localiza la mesa deseada (aparece en gris si está libre).
2. Toca la mesa.
3. Aparece un menú con "Abrir mesa". Toca el botón.
4. La mesa cambia a **naranja** (ocupada) y se abre automáticamente la pantalla de pedido.
5. Puedes introducir el **número de comensales** si lo necesitas.

> Las mesas azules tienen un pedido abierto con comanda enviada a cocina.  
> Las mesas rojas tienen un pago pendiente.

---

## 4. Enviar una comanda a cocina

1. Desde la pantalla de pedido de la mesa, toca los productos que quiere el cliente.
2. Los productos se añaden a la lista de la derecha con su precio.
3. Para añadir un modificador (sin sal, punto de cocción…), toca el producto en la lista y elige el modificador.
4. Cuando el pedido está completo, toca el botón **Enviar comanda** (en verde, parte inferior).
5. Aparece una confirmación. Toca **Confirmar**.
6. La comanda llega automáticamente a la pantalla de cocina (KDS).
7. En el plano de mesas, la mesa cambia a **azul**.

> Puedes añadir más productos después de enviar — simplemente añádelos y vuelve a enviar.  
> Los productos ya enviados no se repiten en cocina (solo los nuevos).

---

## 5. Usar el KDS (pantalla de cocina)

La pantalla de cocina muestra tarjetas con los pedidos pendientes.

1. Cada tarjeta muestra: número de mesa, productos, hora de llegada.
2. Cuando empiezas a preparar un pedido, toca **En preparación**.
3. Cuando el pedido está listo para servir, toca **Listo**.
4. La tarjeta desaparece de la pantalla y se notifica al camarero.

**Colores de las tarjetas:**
- **Gris** — nuevo pedido
- **Naranja** — en preparación
- **Verde** — listo para servir

> Si la pantalla de cocina se queda sin actualizar, recárgala (F5). Si el problema persiste, llama al encargado.

---

## 6. Cobrar un pedido

1. Desde la pantalla de la mesa, toca el botón **Cobrar** (abajo a la derecha).
2. Aparece el resumen del pedido con el total.
3. Elige el método de pago:
   - **Efectivo** → introduce el importe recibido del cliente → el sistema calcula el cambio.
   - **Tarjeta** → confirma el cobro en el datáfono → toca "Confirmar cobro con tarjeta".
   - **Pago mixto** → introduce la parte en efectivo y el resto se cobra por tarjeta.
4. Toca **Completar cobro**.
5. Aparece el ticket. Puedes imprimirlo tocando **Imprimir ticket**.
6. La mesa vuelve a gris (libre) en el plano.

**Descuentos:**
- Solo encargados y caja pueden aplicar descuentos.
- Toca el icono de descuento antes de cobrar, elige porcentaje o importe fijo.

---

## 7. Emitir una factura

1. Después de cobrar (o desde el menú del pedido pagado), toca **Emitir factura**.
2. Introduce los datos del cliente: **NIF/CIF** y **razón social o nombre**.
3. Toca **Generar factura**.
4. La factura se guarda en el sistema y se puede imprimir o descargar en PDF.

> Las facturas deben emitirse en el mismo día del cobro. Si el cliente la pide después, llama al administrador (menú Admin → Fiscal → Facturas).

---

## 8. Devolución (rectificativa)

> Solo administradores y managers pueden emitir devoluciones.

1. Ve a Admin → Fiscal → Facturas (o desde el ticket correspondiente).
2. Localiza el ticket o factura que hay que rectificar.
3. Toca **Emitir rectificativa**.
4. Indica el motivo de la devolución.
5. Confirma. Se genera una nota de abono con IVA negativo.
6. Devuelve el importe al cliente por el mismo método con que pagó.

> No canceles pedidos pagados directamente — usa siempre la rectificativa para que el VeriFactu quede cuadrado.

---

## 9. Cerrar caja (informe Z)

> Solo encargados o el rol "Caja".

1. Desde la pantalla de Caja, toca **Cerrar sesión**.
2. Aparece el resumen de la sesión: cobros por método, total efectivo esperado.
3. Introduce el **efectivo real contado** en el cajón (arqueo).
4. El sistema muestra la diferencia (positiva = sobrante, negativa = faltante).
5. Toca **Confirmar cierre**.
6. Se genera el **Informe Z** con todos los movimientos del turno.
7. Puedes imprimirlo tocando **Imprimir Z**.

---

## 10. Consultar alertas del sistema

1. En la pantalla de mesas o admin, busca el icono de campana (parte superior).
2. Un número rojo indica alertas sin leer.
3. Toca la campana para ver la lista.
4. Las alertas incluyen: pedido en espera, caja sin cerrar, stock bajo, errores de impresora.
5. Toca cada alerta para ver el detalle y marcarla como resuelta.

---

## 11. Trabajar sin conexión (modo offline)

Si el TPV pierde conexión a Internet (pero sigue conectado a la red local del restaurante):

- Aparece un banner **amarillo** en la parte superior: "Sin conexión al servidor".
- Puedes seguir abriendo mesas, añadiendo productos y enviando comandas.
- Los datos se guardan localmente y se sincronizan al recuperar la conexión.

**Lo que NO funciona sin conexión:**
- Cobrar con tarjeta (requiere comunicación con el datáfono cloud)
- Pedidos online (recepción de nuevos pedidos)
- VeriFactu (el envío se aplaza al recuperar conexión)

> Si la barra roja persiste más de 5 minutos, llama al soporte técnico.

---

## 12. Fallo de impresora

Si un ticket o comanda no imprime:

1. Comprueba que la impresora está encendida y tiene papel.
2. En el menú Admin → Impresoras, verifica que el indicador de estado sea verde.
3. Si está en rojo, toca **Reconectar**.
4. Reimprime el ticket desde Admin → Cola de impresión → busca el documento → **Reintentar**.

Si el problema persiste:
- Anota el pedido a mano mientras se resuelve.
- Los tickets quedan guardados en el sistema y se pueden reimprimir desde Admin → Fiscal.

---

## 13. Fallo de Internet

Si el TPV pierde conexión a Internet (pero la red local funciona):

1. El banner amarillo aparece automáticamente.
2. El TPV sigue funcionando para operaciones de mesa y caja (modo local).
3. Los pedidos online quedan en pausa — no llegan nuevos pedidos del canal web.
4. El VeriFactu cola los registros pendientes y los envía al recuperar conexión.

Para comprobar el estado de la conexión:
- Ve a Admin → Diagnóstico técnico → Estado de red.

Cuando se recupera la conexión:
1. El banner desaparece.
2. Los datos se sincronizan automáticamente (puede tardar 1-2 minutos).
3. Comprueba Admin → Cola de sincronización para confirmar que todo está al día.

---

## Contacto de soporte

- **Encargado de turno:** Primera línea para cualquier incidencia operativa
- **Administrador del sistema:** Para problemas de configuración, permisos y datos
- **Soporte técnico:** Para fallos de hardware o problemas que persisten tras reiniciar
