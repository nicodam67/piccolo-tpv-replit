# Recuperación

1. Menú Inicio → Piccolo TPV Server → **Restaurar backup**.
2. Selecciona un `.dump` acompañado por `.dump.sha256`.
3. Escribe `RESTAURAR BASE DE DATOS`.
4. El sistema crea una copia previa, detiene servicios, verifica checksum y restaura.
5. Si `pg_restore` falla, intenta recuperar automáticamente la copia previa.
6. Revisa los logs en `%ProgramData%\PiccoloTPV\logs`.

No uses backups de una versión de esquema más nueva con una aplicación antigua.

Para recuperación completa conserva también:

- `%ProgramData%\PiccoloTPV\uploads`;
- `secrets.env` protegido;
- certificado CA de Caddy;
- backup externo NAS/S3.
