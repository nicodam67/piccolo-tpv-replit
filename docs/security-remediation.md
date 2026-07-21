# Entrega 26 — remediación de seguridad

Estado verificable de la rama `cursor/critical-stabilization-ba22`.

## Controles cerrados

- Los archivos locales `.env*` están ignorados y el `.env.local` heredado fue
  retirado del árbol actual.
- El snapshot de usuario que contenía email y `tokenIdentifier` fue eliminado.
- El bootstrap crea únicamente el administrador suministrado, exige
  `BOOTSTRAP_SECRET` de 32+ caracteres, usa comparación segura, rate limit,
  transacción y `pg_advisory_xact_lock(26001)`.
- El fichaje de tablet/NFC usa proofs opacos de 90 segundos. Solo se persiste
  SHA-256; cada proof queda vinculado a empleado, dispositivo y una acción.
- Socket.IO verifica el JWT y su revocación durante el handshake. El servidor
  resuelve restaurante, rol, rooms funcionales y room del empleado.
- Las sesiones web usan cookie `piccolo_session` `HttpOnly`, `SameSite=Strict`,
  `Secure` en producción. El cliente ya no lee ni escribe el JWT en
  `localStorage`.
- Los tokens de repartidor viajan por `Authorization: Bearer`; el fragmento de
  enlace se copia a `sessionStorage` y se elimina de la URL inmediatamente.
- El envío de comandas serializa por pedido, crea KDS y stock en una sola
  transacción y dispone de restricciones únicas.
- El runner de migraciones mantiene ledger, checksum, lock y transacción.

## Transición de sesiones web

Durante la transición, `/api/auth/pin` conserva el token en el cuerpo para
clientes no web compatibles, pero el TPV web ignora ese campo. La cookie es la
única credencial almacenada por el navegador y no es accesible a JavaScript.
`customFetch` usa `credentials: include`; integraciones móviles pueden registrar
explícitamente un `AuthTokenGetter`.

Antes de retirar el campo `token` de la respuesta:

1. inventariar clientes nativos;
2. migrarlos a un almacén seguro del sistema operativo;
3. comprobar que ninguno depende de `localStorage`;
4. versionar la ruptura de contrato.

## Pendientes operativos

- Rotar el secreto Convex expuesto históricamente según
  `docs/secret-rotation-checklist.md`.
- Una limpieza de historial requiere autorización explícita; no se ha realizado.
- Instalar certificados y secretos de producción fuera del repositorio.
- Ejecutar pruebas físicas NFC en hardware homologado.

## Gates

Los comandos obligatorios están documentados en:

- `docs/migration-authority.md`
- `docs/time-clock-security.md`
- `docs/socket-authentication.md`
- `docs/rbac-matrix.md`
- `docs/idempotency.md`
