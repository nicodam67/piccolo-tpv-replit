# KDS en modo kiosco

## Asignación

1. Administración → Producción → Estaciones KDS.
2. Asigna nombre y departamento.
3. Abre `https://piccolo.local/kds/<departamento>`.
4. Inicia sesión con el perfil autorizado.

## Android

1. Abre la URL en Chrome.
2. Pulsa **Instalar aplicación**.
3. Abre **Piccolo KDS**.
4. Activa orientación horizontal y fijación de pantalla.

## Windows

El acceso puede ejecutarse con:

```text
msedge.exe --kiosk https://piccolo.local/kds/cocina --edge-kiosk-type=fullscreen
```

También puede usarse Chrome con `--kiosk`. Configura el inicio de sesión de Windows para lanzar ese acceso automáticamente.

## Navegador

Pulsa F11 para pantalla completa. El KDS reconecta Socket.IO automáticamente y reconsulta tareas. La etiqueta de conexión no certifica que una comanda sea visible: completa las pruebas `KDS-*`.
