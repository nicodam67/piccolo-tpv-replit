# Entrega 69 — Arquitectura de distribución

## Versión

**Piccolo TPV 0.9.0-rc.1 — Solo para pruebas**

No es producción, no es 1.0.0 y no certifica hardware.

## Inventario previo

| Componente | Ejecución actual | Distribución elegida |
|---|---|---|
| TPV/admin | React/Vite, rutas `/`, `/tables`, `/admin/*` | SPA servida por el API y lanzador Edge/Chrome `--app` |
| API | Node 24, `dist/index.mjs` | Node portable incluido, tarea Windows al arranque |
| Workers | Print 5 s, backup 5 min, VeriFactu 60 s, mismo PID API | Misma tarea API; no se duplican servicios |
| KDS | Misma SPA, `/kds/:departamento`, Socket.IO + polling | PWA KDS o navegador kiosco |
| Tablets camarero | Misma SPA/session cookie | PWA `waiter.webmanifest`, D1–D7 |
| Fichaje | `/fichaje/tablet`, device token, PIN/NFC | PWA `fichaje.webmanifest`; no APK |
| PostgreSQL | PostgreSQL 16 obligatorio, migrations forward-only | Instalación oficial guiada + DB/usuario creados por configurador |
| HTTPS LAN | Antes dependía del proxy Replit | Caddy portable incluido, CA interna |

## Puertos y red

- HTTPS clientes: TCP 443 hacia servidor.
- API interno: TCP 8080 en localhost, detrás de Caddy.
- PostgreSQL: TCP 5432, preferentemente localhost.
- Impresoras ESC/POS: TCP 9100 desde servidor.
- Socket.IO: `/api/socket.io` en el mismo origen HTTPS.
- NAS/S3: mount permitido o HTTPS de salida.

Las tablets/KDS no conectan directamente a PostgreSQL ni a impresoras.

## Variables y persistencia

El propietario no edita `.env`.

El configurador escribe:

- `%ProgramData%\PiccoloTPV\config\piccolo.env`;
- `%ProgramData%\PiccoloTPV\secrets\secrets.env`, ACL SYSTEM/Administrators;
- `%ProgramData%\PiccoloTPV\uploads`;
- `%ProgramData%\PiccoloTPV\backups`;
- `%ProgramData%\PiccoloTPV\logs`;
- `%ProgramData%\PiccoloTPV\rollback`.

Secretos generados con CSPRNG:

- `SESSION_SECRET`;
- `QR_TABLE_HMAC_SECRET`;
- `BOOTSTRAP_SECRET`;
- contraseña del rol PostgreSQL cuando se crea.

## Decisión de tecnología

### Elegido

- **NSIS** para generar `.exe`: estable, pequeño, compila en Windows CI y Linux, soporta accesos, reparación y desinstalación.
- **PowerShell firmado por checksum dentro del instalador** para configuración guiada.
- **Node portable** y **Caddy portable** verificados por SHA-256.
- **PostgreSQL 16 oficial** mediante instalador interactivo/winget; no se redistribuye sin necesidad.
- **PWA/navegador app-mode** para TPV, KDS y tablets.

### Rechazado

- Electron: duplicaría Chromium y el frontend.
- Tauri: añadiría Rust/WebView y otro canal de actualización.
- Docker: carga operativa innecesaria para el propietario.
- APK nativo: la PWA cubre instalación/kiosco y NFC Web.
- MSI/WiX: complejidad empresarial no requerida para el RC.

## Instaladores

| Archivo | Uso |
|---|---|
| `Piccolo-TPV-Setup.exe` | Lanzador del ordenador principal; escritorio, Inicio, repair/reinstall y uninstall |
| `Piccolo-Server-Setup.exe` | Install/update/repair/restore, Node/Caddy, migraciones, tareas y configurador |

Los binarios se generan en CI y no se versionan en Git.

## PostgreSQL y datos existentes

El configurador:

1. detecta `psql`;
2. ofrece abrir PostgreSQL 16 oficial si falta;
3. detecta rol y base;
4. si hay base, exige `CONSERVAR`;
5. crea `pg_dump` antes de migrar;
6. nunca borra ni sobrescribe silenciosamente;
7. ejecuta migraciones con checksum/ledger.

## Arranque y recuperación

Dos tareas Windows:

- `PiccoloTPVServer`: Node API/web/workers, reinicio automático.
- `PiccoloTPVCaddy`: HTTPS LAN, reinicio automático.

Update:

1. aprobación manual;
2. `pg_dump` obligatorio + SHA-256;
3. snapshot de aplicación;
4. swap de archivos;
5. migraciones;
6. health check;
7. rollback de archivos en fallo;
8. dump disponible para restore aprobado.

No hay down-migrations automáticas.

## PWA

| Perfil | Manifest | Inicio | Pantalla |
|---|---|---|---|
| Camarero | `waiter.webmanifest` | `/` | standalone |
| KDS | `kds.webmanifest` | `/kds/cocina` | fullscreen landscape |
| Fichaje | `fichaje.webmanifest` | `/fichaje/tablet` | fullscreen portrait |

Un único service worker usa versión `0.9.0-rc.1`, navegación network-first, API fail-closed y activación de update solo tras aprobación.

## Impresoras

Se reutilizan Producción/Impresoras/Asistente:

- nombre, departamento, IP, puerto;
- CP858/CP437/Windows-1252;
- 58/80 mm, corte, cajón;
- orden de `printerIds` como prioridad y fallback;
- ticket de prueba.

`printed` significa socket aceptado; el resultado físico sigue pendiente.

## Firma e integridad

- CI genera `SHA256SUMS.txt` y `artifact-manifest.json`.
- Si existe PFX real, CI firma y verifica Authenticode.
- Sin certificado, `SIGNING-STATUS.txt` dice `UNSIGNED`; Windows mostrará editor desconocido.
- Nunca se simula una firma.

## Artefactos CI

Workflow: `.github/workflows/release-candidate.yml`.

Gates: commit limpio, lockfile, versión, TypeScript, ESLint, route audit, 813+ tests, E2E, restore, builds, audit critical, instaladores, smoke, checksums.

Se sube el artefacto `piccolo-tpv-0.9.0-rc.1-windows` durante 90 días. No se publica release estable.
