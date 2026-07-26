# Guía rápida

## Servidor

1. En el ordenador principal, ejecutar `Piccolo-Server-Setup.exe` como administrador.
2. Elegir **Instalación nueva**.
3. Al abrirse **Configurar servidor**, responder a las preguntas en español.
4. Si PostgreSQL 16 no existe, aceptar la apertura del instalador oficial.
5. Indicar la contraseña de PostgreSQL creada en ese instalador.
6. Confirmar el nombre `piccolo.local`, salvo que el técnico haya asignado otro.
7. Esperar el mensaje “instalado — solo para pruebas”.
8. Completar `/setup` y después `/admin/instalacion/asistente`.

Nunca edites `.env`: el configurador genera y protege los secretos.

## TPV del ordenador principal

1. Ejecutar `Piccolo-TPV-Setup.exe`.
2. Introducir `https://piccolo.local` o la dirección indicada por el configurador.
3. Abrir **Piccolo TPV** desde el escritorio.

## Red

- Tablets y KDS deben llegar al servidor por HTTPS 443.
- El servidor debe llegar a las impresoras por TCP 9100.
- Instalar en cada dispositivo el certificado CA que genera Caddy, siguiendo `PWA-ANDROID.md`.
