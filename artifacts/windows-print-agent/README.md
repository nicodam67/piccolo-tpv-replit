# Piccolo Print Agent para Windows

Agente local que recibe bytes ESC/POS ya preparados por Piccolo y los entrega
por TCP o a una cola Windows en modo `RAW`. La versión actual es `0.1.0`.

## Instalar y configurar

1. Ejecute `Piccolo-Print-Agent-Windows-0.1.0.exe` como administrador.
2. Abra **Piccolo Print Agent → Configurar**. Indique el UUID lógico exacto de
   cada impresora y un destino:
   - `tcp`: `address` en formato `host:puerto`, normalmente `192.168.x.x:9100`.
   - `windows_raw`: `queueName` exactamente igual al nombre de la cola Windows.
3. El configurador genera o acepta `PRINT_AGENT_TOKEN`. Si lo genera, cópielo
   en el entorno del servidor Piccolo como `PRINT_AGENT_TOKEN`. Es la única vez
   que el agente lo muestra.
4. Ejecute `piccolo-print-agent.exe validate` como administrador y arranque el
   servicio `PiccoloPrintAgent`.
5. Abra **Diagnóstico** y haga una impresión de prueba por impresora.

El token no se guarda en texto plano: `token.dpapi` usa Windows DPAPI con ámbito
`LocalMachine`. `%PROGRAMDATA%\Piccolo\PrintAgent` tiene herencia ACL
desactivada y acceso completo únicamente para `SYSTEM` y administradores
(`S-1-5-18` y `S-1-5-32-544`). El servicio, instalador y configurador deben
ejecutarse elevados. No copie el token a `config.json`, scripts ni logs.

El instalador registra un servicio automático con inicio retrasado y tres
reinicios progresivos. Las actualizaciones conservan `%PROGRAMDATA%`. La
desinstalación pregunta antes de eliminar configuración, recibos y logs. No se
crea ninguna regla de firewall.

## Contrato HTTP

El API escucha por defecto en `127.0.0.1:17321`. Ambos endpoints requieren
`Authorization: Bearer <PRINT_AGENT_TOKEN>`.

- `GET /health`
- `POST /v1/print`, con `Idempotency-Key` y:

```json
{
  "printerId": "123e4567-e89b-42d3-a456-426614174000",
  "payloadBase64": "G0BQUlVFQkEK",
  "copies": 1
}
```

La respuesta de impresión siempre contiene:

```json
{"accepted":true,"confirmationLevel":"spooler","error":""}
```

`copies` admite de 1 a 10. El agente decodifica Base64 y entrega exactamente
esos bytes; no cambia codificación, no inicializa la impresora y no añade corte
ni pulso de cajón.

### Idempotencia y estados

No existe una segunda cola de impresión. Antes de llamar al transporte se
persiste atómicamente un recibo `in_progress` con el hash de impresora, copias y
payload. Después de la aceptación se convierte en `completed`.

- Repetir clave y payload completados devuelve el recibo sin reimprimir.
- Repetir una clave con payload distinto devuelve HTTP `409`.
- Un `in_progress` encontrado después de un reinicio es ambiguo: devuelve
  HTTP `409` y nunca se reimprime automáticamente.
- Un fallo conocido antes de entregar bytes elimina el recibo y permite retry
  con la misma clave.
- Un fallo después de una entrega posible conserva `in_progress`.

Los recibos completados se eliminan al superar `receiptRetentionHours` o
`maxReceipts` (por defecto 7 días y 10.000). Los ambiguos no se eliminan
automáticamente; si llenan el límite, el agente rechaza trabajos nuevos en vez
de perder protección anti-duplicado.

`confirmationLevel=transport` significa que un socket TCP aceptó todos los
bytes. `confirmationLevel=spooler` significa que Winspool aceptó el documento
RAW. `device` queda reservado para una confirmación física correlacionada que
esta versión no afirma. Ningún resultado actual confirma que salió papel.

## Conectividad local y remota

`127.0.0.1` solo funciona cuando el backend Piccolo corre en el mismo Windows.
Si el backend corre en otro equipo, configure una IP alcanzable a través de una
LAN/VPN administrada. Escuchar fuera de loopback exige `tls.certFile` y
`tls.keyFile`; limite además el acceso en la red al host backend. El instalador
no abre el firewall. No exponga el agente directamente a Internet.

El panel local usa `127.0.0.1:17322`; se rechaza cualquier dirección de
diagnóstico no loopback y también clientes no loopback. Muestra versión, última
comunicación, último servidor autorizado, último trabajo/error e impresoras, y
permite una prueba explícita.

## Archivos y configuración

Todo el estado vive en `%PROGRAMDATA%\Piccolo\PrintAgent`:

- `config.json`: configuración no secreta.
- `token.dpapi`: token cifrado con DPAPI LocalMachine.
- `receipts.json`: ledger de recibos, escrito con reemplazo atómico.
- `agent.log` y `agent.log.1`: log local acotado por rotación.

Ejemplo de `config.json`:

```json
{
  "listenAddress": "127.0.0.1:17321",
  "diagnosticsAddress": "127.0.0.1:17322",
  "printers": [
    {
      "id": "123e4567-e89b-42d3-a456-426614174000",
      "name": "Cocina",
      "enabled": true,
      "target": {"type": "tcp", "address": "192.168.1.50:9100"}
    },
    {
      "id": "223e4567-e89b-42d3-a456-426614174000",
      "name": "Bar",
      "enabled": true,
      "target": {"type": "windows_raw", "queueName": "EPSON Bar"}
    }
  ],
  "receiptRetentionHours": 168,
  "maxReceipts": 10000,
  "tcpTimeoutMillis": 5000
}
```

Comandos:

```text
piccolo-print-agent.exe configure
piccolo-print-agent.exe generate-token
piccolo-print-agent.exe validate
piccolo-print-agent.exe run
piccolo-print-agent.exe diagnostics
piccolo-print-agent.exe version
```

## Build reproducible

Con Go 1.22, `makensis` y módulos descargados:

```bash
./scripts/build-windows.sh
```

Compila `GOOS=windows GOARCH=amd64`, `CGO_ENABLED=0`, `-trimpath`,
`-buildvcs=false` y sin build ID. También exporta `SOURCE_DATE_EPOCH` con la
fecha del commit (o respeta el valor ya fijado) para que NSIS no inserte la hora
de ejecución. Produce
`dist/Piccolo-Print-Agent-Windows-0.1.0.exe`. Fije `VERSION`, `COMMIT` y las
mismas versiones de Go/NSIS para comparar artefactos byte a byte.

## Límites y checklist físico

Las respuestas HTTP prueban aceptación software, no impresión física, corte,
cajón, caracteres, papel, tapa ni estado de consumibles. Antes de producción
pruebe cada modelo, driver, cola RAW, página de códigos, corte/cajón, copias,
reinicio, caída de red y falta de papel. Use el checklist específico de
[`docs/WINDOWS_PRINT_AGENT_PILOT_CHECKLIST.md`](../../docs/WINDOWS_PRINT_AGENT_PILOT_CHECKLIST.md).
Este módulo no constituye certificación física de ninguna impresora.
