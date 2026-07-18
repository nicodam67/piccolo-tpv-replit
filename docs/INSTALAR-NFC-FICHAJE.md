# Guía de instalación NFC — Fichaje por tarjeta

> ⚠️ **IMPLEMENTACIÓN PREPARADA — PENDIENTE DE VALIDACIÓN FÍSICA CON HARDWARE REAL**
> Esta guía asume que la tablet tiene NFC y Chrome 89+ instalado.
> Sin hardware real, el sistema cae automáticamente al modo PIN.

---

## Requisitos previos

- Tablet Android con NFC (ver `COMPATIBILIDAD-NFC-TABLET.md` para modelos)
- Chrome 89 o superior instalado
- La tablet ya registrada como dispositivo de fichaje (ver `INSTALAR-TABLET-FICHAJE.md`)
- Tarjetas o llaveros NFC para los empleados (NTAG213 o MIFARE)
- Conexión HTTPS activa

---

## Paso 1 — Activar NFC en la tablet

1. Abre **Ajustes** en la tablet.
2. Ve a **Conexiones** → **NFC y pagos sin contacto**.
3. Activa el interruptor de NFC.
4. Confirma que la luz indicadora (si existe) se activa.

> **Nota:** En algunos modelos la ruta es **Ajustes → Dispositivo conectado → NFC**.

---

## Paso 2 — Abrir la PWA de fichaje

1. Abre Chrome en la tablet.
2. Ve a la dirección de tu sistema Piccolo TPV, por ejemplo:
   `https://tu-restaurante.piccolo.app/fichaje/tablet`
3. Si la PWA está instalada, ábrela directamente desde el escritorio.
4. La pantalla mostrará:
   - **"Acerque su tarjeta NFC"** con icono animado → NFC detectado ✅
   - **"NFC no disponible"** con cuadrícula de empleados → el dispositivo no tiene NFC o el navegador no lo soporta ❌

---

## Paso 3 — Asignar una tarjeta NFC a un empleado

> Este paso requiere estar autenticado como administrador o encargado.

1. Desde el TPV, inicia sesión.
2. Ve a **Personal y Fichaje → Empleados**.
3. Busca al empleado y pulsa el icono de editar.
4. En el modal de edición, abre la pestaña **Tarjetas NFC**.
5. Pulsa **"Asignar tarjeta NFC"**.
6. Aparecerá el mensaje **"Acerque la tarjeta al dispositivo"**.
7. Acerca la tarjeta NFC al lector del dispositivo desde el que estás gestionando.
8. El sistema leerá el UID, lo hasheará y lo guardará asociado al empleado.
9. Opcionalmente, escribe un alias descriptivo (p. ej. "Llavero azul María").
10. Pulsa **Guardar**.

> ⚠️ **Requiere hardware NFC real.** Esta operación no se puede simular.

---

## Paso 4 — Probar un fichaje con NFC

1. Ve a la pantalla de la tablet (`/fichaje/tablet`).
2. Acerca la tarjeta recién asignada al lector NFC de la tablet.
3. El sistema debería:
   - Reconocer la tarjeta → mostrar el nombre del empleado
   - Mostrar las acciones disponibles (Entrada / Salida / Pausa)
   - Confirmar la acción seleccionada con la hora del servidor
4. Si aparece **"Tarjeta no reconocida"**, asegúrate de que la tarjeta está asignada al empleado (Paso 3).
5. Si aparece **"Tarjeta revocada"**, la tarjeta fue desactivada — asigna una nueva.

---

## Paso 5 — Fichaje con PIN como alternativa

Si el empleado no tiene tarjeta o la olvidó:

1. En la pantalla de espera NFC, pulsa **"Fichar con PIN"**.
2. Selecciona el nombre del empleado en la cuadrícula.
3. Introduce el PIN de 6 dígitos.
4. El fichaje se registra igual que con NFC.

---

## Paso 6 — Revocar una tarjeta perdida

1. Ve a **Personal y Fichaje → Empleados**.
2. Edita el empleado correspondiente.
3. Pestaña **Tarjetas NFC** → localiza la tarjeta.
4. Pulsa **Revocar** e introduce el motivo (p. ej. "Tarjeta perdida").
5. La tarjeta queda bloqueada inmediatamente en todos los dispositivos.
6. Asigna una nueva tarjeta siguiendo el Paso 3.

---

## Recuperar si la tablet no lee NFC

1. Comprueba que NFC está activado en Ajustes.
2. Reinicia Chrome.
3. Verifica que la URL usa **HTTPS** (Web NFC no funciona en HTTP).
4. Comprueba que la tablet tiene Chrome 89+: `chrome://version`.
5. Limpia caché de Chrome: **Ajustes → Privacidad → Borrar datos de navegación**.
6. Si el problema persiste, usa el modo PIN como fallback permanente.

---

## Auditoría de lecturas NFC

Todos los eventos NFC quedan registrados en la auditoría de fichaje:

| Evento | Descripción |
|--------|-------------|
| `nfc_identified` | Tarjeta reconocida → empleado identificado |
| `nfc_unknown` | UID no registrado en el sistema |
| `nfc_revoked` | Tarjeta revocada intentó fichar |
| `nfc_debounced` | Segunda lectura de la misma tarjeta en < 5 s (ignorada) |
| `nfc_assigned` | Nueva tarjeta asignada a empleado |
| `nfc_revoked_admin` | Administrador revocó una tarjeta |

Para consultar el historial: **Personal y Fichaje → Configuración → Auditoría**.
