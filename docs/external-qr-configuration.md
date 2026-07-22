# Configuracion del QR oficial externo

El QR oficial vive en el repositorio `nicodam67/piccolo-qr-menu`. Los dos repositorios todavia no estan integrados.

El servidor del TPV acepta:

```env
PICCOLO_QR_MENU_URL=https://menu.example.com
```

Reglas:

- solo se aceptan URLs HTTPS absolutas;
- se rechazan credenciales embebidas, rutas relativas y protocolos inseguros;
- la URL se expone mediante `/api/public/branding`;
- si no existe una URL valida, el TPV muestra un aviso administrativo y no genera un enlace;
- nunca se usa `/qr-menu/` como fallback.

La comunicacion futura entre repositorios se realizara mediante APIs versionadas. Hasta entonces no se copian codigo ni datos entre ambos.

`PICCOLO_QR_MENU_API_TOKEN` protege la futura API M2M y no sustituye a
`PICCOLO_QR_MENU_URL`: la primera es un secreto exclusivo de servidor y la
segunda es el enlace publico al proyecto externo.
