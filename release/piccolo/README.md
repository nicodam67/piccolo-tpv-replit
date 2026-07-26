# Piccolo TPV 0.9.0-rc.1 — Solo para pruebas

Los binarios no se versionan en Git. El workflow **Piccolo TPV Release Candidate** genera:

- `Piccolo-TPV-0.9.0-rc.1-Instalacion.zip` — paquete único recomendado.
- `Piccolo-TPV-Setup.exe` — lanzador TPV para el ordenador principal.
- `Piccolo-Server-Setup.exe` — servidor, configuración, actualización, reparación y restore.
- `Piccolo-TPV-0.9.0-rc.1-portable.zip` — paquete auditable para recuperación técnica.
- `SHA256SUMS.txt` y `artifact-manifest.json`.

El paquete único contiene ambos instaladores, guía rápida, manual del propietario, manuales de recuperación/actualización/cambio de equipo y los checklists de instalación/certificación.

## Descarga

1. Abrir GitHub → **Actions**.
2. Elegir **Piccolo TPV Release Candidate**.
3. Abrir la ejecución del commit aprobado.
4. Descargar el artefacto `piccolo-tpv-0.9.0-rc.1-windows`.
5. Verificar `SHA256SUMS.txt`.

No descargar instaladores enviados por correo o mensajería sin comparar el checksum.

Windows mostrará “Editor desconocido” mientras no exista un certificado Authenticode real. No se simula ninguna firma.
