# Actualización segura

1. Descarga el RC aprobado desde GitHub Actions.
2. Verifica `SHA256SUMS.txt`.
3. Confirma que no hay caja abierta, impresiones en curso ni servicio activo.
4. Ejecuta `Piccolo-Server-Setup.exe`.
5. Selecciona **Actualizar**.
6. El instalador exige `pg_dump`, crea backup con checksum y conserva la versión anterior.
7. Aplica migraciones forward-only, inicia servicios y ejecuta health check.
8. Si falla, restaura los archivos anteriores y deja el backup disponible.

No hay actualizaciones automáticas. Las mejoras propuestas por IA requieren revisión, pruebas y aprobación humana.

Si una actualización incluye migraciones incompatibles, no existe down-migration automática: usar forward-fix o restaurar el dump aprobado.
