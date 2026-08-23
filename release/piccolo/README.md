# Piccolo TPV 0.9.0-rc.2 — Hardware Test

Los binarios no se versionan en Git. El workflow **Piccolo TPV Release Candidate** genera:

- `Piccolo-TPV-Setup.exe` — lanzador TPV para el ordenador principal.
- `Piccolo-Server-Setup.exe` — servidor, configuración, actualización, reparación y restore.
- `Piccolo-TPV-0.9.0-rc.2-portable.zip` — paquete auditable para recuperación técnica.
- `Piccolo-TPV-0.9.0-rc.2-TOS-linux-amd64-*.tar.gz` — servidor TPV real para TerraMaster TOS.
- `Piccolo-TPV-0.9.0-rc.2-Hardware-Test-*.zip` — paquete único de entrega.
- `SHA256SUMS.txt` y `artifact-manifest.json`.

## TerraMaster TOS (F4-424)

Consulta `TOS-INSTALACION.md` para instalar todo el servidor Piccolo en un NAS TerraMaster con Docker.

## Descarga

1. Abrir GitHub → **Actions**.
2. Elegir **Piccolo TPV Release Candidate**.
3. Abrir la ejecución del commit aprobado.
4. Descargar el artefacto `piccolo-tpv-0.9.0-rc.2-hardware-test`.
5. Verificar `SHA256SUMS.txt`.

No descargar instaladores enviados por correo o mensajería sin comparar el checksum.

Windows mostrará “Editor desconocido” mientras no exista un certificado Authenticode real. No se simula ninguna firma.

**VERSIÓN DE PRUEBAS — NO USAR PARA FACTURACIÓN FISCAL REAL.**
