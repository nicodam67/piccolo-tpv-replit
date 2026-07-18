# Guía de instalación — Tablet de Fichaje Piccolo

Esta guía explica cómo configurar la tablet de fichaje paso a paso. No necesitas conocimientos técnicos. Si tienes dudas, pide ayuda al responsable de informática.

---

## ¿Qué es esto?

La tablet de fichaje es una pantalla fija en el restaurante que permite a los empleados registrar su entrada, salida y descansos sin entrar al sistema de caja ni ver datos de otros compañeros.

---

## Paso 1 — Abrir la aplicación

1. En la tablet, abre el navegador **Chrome**.
2. Escribe en la barra de direcciones:
   ```
   https://[tu-dominio]/fichaje/tablet
   ```
   *(Sustituye `[tu-dominio]` por la dirección real del sistema Piccolo.)*
3. Pulsa **Intro** o **Ir**.

---

## Paso 2 — Instalar como aplicación (PWA)

Instalar la aplicación permite abrirla directamente desde el escritorio, sin el navegador.

1. En Chrome, toca el menú de tres puntos (esquina superior derecha).
2. Selecciona **"Añadir a pantalla de inicio"** o **"Instalar aplicación"**.
3. Escribe el nombre **"Piccolo Fichaje"** y toca **Añadir**.
4. Aparecerá un icono en el escritorio de la tablet.

Desde ahora, abre siempre la aplicación desde ese icono.

---

## Paso 3 — Obtener el código de emparejamiento

Antes de registrar la tablet necesitas un **código de 6 dígitos** que genera el administrador. Este código es de un solo uso y caduca en 10 minutos.

1. Desde el TPV, inicia sesión como administrador.
2. Ve a **Administración → Control Horario → Dispositivos**.
3. Toca el botón **"Nueva tablet"**.
4. Anota el código de 6 dígitos que aparece en pantalla.

---

## Paso 4 — Registrar la tablet

La primera vez que abras la aplicación en la tablet aparecerá una pantalla de registro.

1. Introduce el **código de emparejamiento** de 6 dígitos del Paso 3.
2. Escribe un nombre para identificar la tablet, por ejemplo:
   - `Tablet Entrada`
   - `Tablet Cocina`
3. Escribe la ubicación, por ejemplo: `Piccolo La Ràpita`
4. Toca **"Registrar dispositivo"**.

La tablet queda registrada automáticamente. No necesitas hacer nada más.

> **Seguridad:** Solo los administradores pueden generar códigos de emparejamiento. Si alguien intenta registrar una tablet sin un código válido, el sistema lo rechaza automáticamente.

> **Si la tablet se revoca** desde administración, aparecerá un aviso y deberás pedir un nuevo código al administrador para registrarla de nuevo.

---

## Paso 5 — Activar pantalla completa

Para que la pantalla ocupe todo el espacio sin la barra del navegador:

1. Si instalaste la aplicación en el Paso 2, ya funciona en pantalla completa automáticamente.
2. Si usas el navegador directamente, pulsa el botón de menú → **"Pantalla completa"**.

---

## Paso 6 — Fijar la aplicación en Android (modo quiosco)

Para que los empleados no puedan salir de la pantalla de fichaje ni abrir otras aplicaciones:

1. Ve a **Ajustes del Android** → **Bienestar Digital** → **Fijación de pantalla** (en algunos modelos: **Seguridad** → **Fijar pantalla**).
2. Activa la opción.
3. Abre la aplicación Piccolo Fichaje.
4. Toca el botón de **"Aplicaciones recientes"** (cuadrado o tres líneas).
5. Busca la tarjeta de Piccolo Fichaje y toca el icono del pin o la chincheta.
6. La pantalla queda fija. Solo puede salirse con el PIN de administrador del Android.

---

## Paso 7 — Evitar que se apague la pantalla

1. Ve a **Ajustes** → **Pantalla** → **Tiempo de espera de pantalla**.
2. Selecciona **"Nunca"** o el tiempo más largo disponible.

Esto evita que la pantalla se apague entre fichajes.

---

## Paso 8 — Configurar la conexión Wi-Fi

1. Ve a **Ajustes** → **Wi-Fi**.
2. Conecta la tablet a la misma red del restaurante que usa la caja.
3. Asegúrate de que la red es estable. Si la conexión falla, la pantalla mostrará el aviso **"Sin conexión"**.

---

## Paso 9 — Probar un fichaje

1. Abre la aplicación.
2. Toca tu nombre en la lista o búscalo escribiendo las primeras letras.
3. Introduce tu PIN personal (4-6 dígitos).
4. Toca **"Entrada"**.
5. Aparecerá el mensaje de confirmación durante 5 segundos y la pantalla vuelve sola al inicio.

> **Si no tienes PIN configurado**, pide al responsable que te lo asigne desde **Administración → Fichaje → Empleados**.

---

## Paso 10 — Gestionar tablets desde administración

El responsable puede ver y controlar las tablets desde:

**Administración → Control Horario → Dispositivos**

Desde ahí puede:
- Ver qué tablets están conectadas y cuándo se usaron por última vez.
- Renombrarlas.
- Revocar una tablet si se pierde o se cambia.

---

## Recuperar acceso si se bloquea

### PIN incorrecto 3 veces
Después de 3 intentos fallidos la pantalla muestra un bloqueo temporal de 5 minutos. Espera o pide al responsable que reinicie el bloqueo desde administración.

### Tablet revocada
Si aparece el mensaje **"Dispositivo revocado"**:
1. Pide al administrador que reactive la tablet desde **Fichaje → Dispositivos**.
2. O toca **"Registrar nuevo dispositivo"** para registrarla de nuevo.

### La aplicación no carga
1. Comprueba que la tablet tiene conexión Wi-Fi.
2. Cierra y vuelve a abrir la aplicación.
3. Si sigue sin funcionar, abre Chrome y ve a la dirección de fichaje directamente.

---

## Preguntas frecuentes

**¿Fichar en la tablet y en el TPV son lo mismo?**
No. Fichar registra tu jornada laboral. Entrar al TPV es para atender mesas y pedidos. Son sistemas separados.

**¿Puede un empleado ver los fichajes de otro?**
No. La pantalla solo muestra el nombre del empleado y sus acciones. No muestra datos de otros compañeros.

**¿Qué pasa si se va la luz?**
Cuando se recupere la corriente y la conexión, la aplicación vuelve a funcionar automáticamente. No se pierden los fichajes ya registrados.

**¿Puedo instalar esto en más de una tablet?**
Sí. Repite el proceso en cada tablet. Aparecerán listadas en **Fichaje → Dispositivos**.

---

*Documento actualizado para Piccolo TPV v1.0 — Julio 2026.*
