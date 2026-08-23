# Piccolo TPV 0.9.0-rc.2 — Instalación en TerraMaster TOS

**Solo para pruebas. No es una versión de producción.**

Este paquete permite ejecutar **todo el servidor Piccolo** (API, base de datos, HTTPS y frontend) en un NAS TerraMaster con TOS, sin necesidad de un PC Windows dedicado.

## Requisitos del Terramaster F4-424

| Requisito | Mínimo | Recomendado |
|---|---|---|
| Modelo | F4-424 / F4-424 Pro / F4-424 Max | F4-424 con 8 GB RAM |
| Arquitectura | x86_64 (Intel) | — |
| RAM | 4 GB | 8 GB o más |
| Disco libre | 10 GB | 50 GB en volumen dedicado |
| TOS | TOS 5 o TOS 6 con Docker | Docker activado |
| Red | Ethernet 2,5 GbE | IP fija en LAN |

## Descarga

Descarga el paquete `Piccolo-TPV-0.9.0-rc.2-TOS-linux-amd64-*.tar.gz` incluido en el ZIP Hardware Test. Verifica el checksum SHA-256 antes de instalar.

## Instalación recomendada (Docker en TOS)

1. En TOS, activa la aplicación **Docker** desde el panel de control.
2. Crea una carpeta en el volumen, por ejemplo `/Volume1/piccolo`.
3. Sube y descomprime el paquete:

```bash
cd /Volume1/piccolo
tar -xzf Piccolo-TPV-0.9.0-rc.2-TOS-linux-amd64-*.tar.gz
sudo ./linux/install-tos.sh
```

4. Elige **1) Docker** cuando se solicite.
5. Responde a las preguntas:
   - Nombre del servidor: `piccolo.local` (o el que uses en la red)
   - Puerto HTTPS: `443` (si TOS ya usa 443, prueba `8443`)
6. Espera el mensaje de instalación completada.
7. Abre `https://piccolo.local/setup` desde un navegador de la red local.
8. Continúa con `/admin/instalacion/asistente`.

## Instalación nativa (systemd)

Usa esta opción solo si ya tienes PostgreSQL 16 en el NAS o en otro equipo de la red:

```bash
sudo ./linux/install-tos.sh
# Elige 2) Nativo
```

## Clientes del restaurante

| Dispositivo | Cómo conectar |
|---|---|
| Tablets camarero | PWA Android → `https://piccolo.local` |
| KDS cocina | PWA o kiosco → `https://piccolo.local/kds` |
| Fichaje | PWA → `https://piccolo.local/fichaje/tablet` |
| TPV caja | Cualquier navegador/PC → `https://piccolo.local` |
| Impresoras | TCP 9100 desde el NAS hacia la red local |

## Certificado HTTPS en tablets Android

Piccolo usa un certificado local generado por Caddy. Debes instalar la CA en cada tablet:

- Docker: `/Volume1/piccolo/caddy/pki/authorities/local/root.crt`
- Nativo: `/var/lib/piccolo/caddy/pki/authorities/local/root.crt`

Sigue `PWA-ANDROID.md` para instalar la CA y la PWA.

## Gestión del servicio

### Docker

```bash
cd /Volume1/piccolo/docker
docker compose ps
docker compose logs -f piccolo
docker compose restart
```

### Nativo

```bash
sudo /opt/piccolo/manage-server.sh status
sudo /opt/piccolo/manage-server.sh restart
sudo /opt/piccolo/manage-server.sh logs
```

## Copias de seguridad

Los datos viven en `/Volume1/piccolo/` (o la ruta que hayas elegido):

- `postgres/` — base de datos
- `uploads/` — imágenes y archivos
- `backups/` — copias generadas por Piccolo
- `secrets/` — credenciales (no copiar sin cifrar)

El propio NAS puede ser el destino principal de backups; no hace falta un segundo NAS.

## Limitaciones de esta versión

- Release candidate `0.9.0-rc.2` — no declarada producción.
- Sin firma de paquete Linux.
- Certificación física de impresoras, KDS y tablets pendiente.
- Si el puerto 443 está ocupado por TOS, usa `8443` y actualiza las URLs en tablets.
- Docker en TOS puede requerir reinicio del NAS tras la primera instalación.

## Resolución de problemas

| Problema | Acción |
|---|---|
| Docker no encontrado | Activar Docker en TOS y reiniciar |
| Puerto 443 ocupado | Reinstalar con puerto `8443` |
| Tablets no conectan | Comprobar IP fija, firewall TOS y certificado CA |
| Impresoras no imprimen | Verificar que el NAS puede alcanzar IP:9100 de cada impresora |
| Health check falla | `docker compose logs piccolo` o `manage-server.sh logs` |
