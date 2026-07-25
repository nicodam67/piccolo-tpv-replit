# Piccolo TPV — procedimiento de recuperación

## Requisitos

- PostgreSQL staging/producción accesible.
- `SESSION_SECRET` usado para cifrar el backup.
- Destino activo S3 compatible, NAS o almacenamiento local permitido.
- Operador con rol `admin`.

## Verificación previa

1. Detener tráfico de TPV/KDS/QR o activar la ventana de mantenimiento.
2. Ejecutar `POST /api/backup/:id/dry-run`.
3. Confirmar checksum, manifest, versión, tablas y secuencias.
4. Crear una copia pre-restauración protegida.

## Restauración completa

- Desde registro interno: `POST /api/backup/:id/restore` con `{ "confirm": true }`.
- Desde almacenamiento externo:

```http
POST /api/backup/restore-from-destination
{
  "destinationId": "...",
  "reference": "...",
  "confirm": true
}
```

La restauración usa una conexión reservada, una transacción, rollback completo,
`SET LOCAL session_replication_role`, manifest estricto y recuperación de secuencias.

## Restauración parcial

No se permite escribir parcialmente sobre producción. Para recuperar un subconjunto:

1. Restaurar el backup completo en PostgreSQL staging.
2. Validar relaciones y secuencias.
3. Exportar exclusivamente los registros necesarios mediante consultas revisadas.
4. Importarlos en producción mediante la operación de dominio correspondiente.

## Corrupción

- Checksum o GCM incorrecto: descartar artefacto y probar la copia anterior.
- Manifest incompleto/incompatible: no restaurar.
- Fallo durante restore: comprobar rollback y conservar la pre-restauración.
- Registrar incidencia y bloquear purga del último backup verificado.

## Pérdida total de PostgreSQL

1. Crear base vacía con la versión de migraciones correspondiente.
2. Recrear el destino externo con credenciales nuevas.
3. Registrar temporalmente la configuración del destino.
4. Restaurar mediante `restore-from-destination`.
5. Rotar credenciales, JWT y tokens de dispositivos.
6. Ejecutar smoke tests de login, mesa, pedido, KDS, caja y fichaje.

## Drill staging repetible

```bash
DATABASE_URL='postgresql://.../piccolo_staging' \
SESSION_SECRET='secreto-de-staging-de-32-caracteres' \
ALLOW_DESTRUCTIVE_RESTORE_TEST=YES_I_UNDERSTAND \
pnpm --filter @workspace/api-server run validate:restore-staging
```

El comando valida snapshot cifrado, checksum, relaciones, secuencias,
restauración repetida, fallo intermedio, rollback y limpieza de conexión.

## Retención

- Respetar `retention` por schedule.
- No purgar registros `protected` ni copias pre-restauración.
- La purga elimina tanto la referencia externa como el registro interno.
- Conservar al menos una copia verificada fuera del host de PostgreSQL.
