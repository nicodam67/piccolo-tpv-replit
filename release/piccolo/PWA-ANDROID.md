# Instalar Piccolo en Android

## Camareros D1–D7

1. Conecta la tablet a la Wi‑Fi del restaurante.
2. Abre Chrome y entra en `https://piccolo.local`.
3. Si Chrome avisa del certificado local, instala primero la CA entregada por el configurador.
4. Pulsa **Instalar aplicación**.
5. Confirma.
6. Abre **Piccolo TPV** desde el icono.

La PWA muestra un aviso si pierde conexión. No se guardan pedidos ni cobros offline.

## Tablet de fichaje

1. Abre `https://piccolo.local/fichaje/tablet`.
2. Pulsa **Instalar aplicación**.
3. Confirma y abre **Piccolo Fichaje**.
4. Empareja el dispositivo desde Administración → Fichaje → Dispositivos.
5. Activa la fijación de pantalla de Android.

El fichaje falla de forma cerrada sin red. NFC requiere Android Chrome, HTTPS y certificación física.

La CA se encuentra en el servidor bajo `%ProgramData%\PiccoloTPV\caddy\caddy\pki\authorities\local\root.crt`. El técnico debe copiar únicamente ese certificado público, nunca `root.key` ni `secrets.env`.

## Actualizaciones

Piccolo avisará de una versión revisada. Solo un responsable debe pulsar **Revisar y actualizar** cuando no haya servicio activo.
