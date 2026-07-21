# Autoridad de migraciones

La única vía autorizada para modificar el esquema es:

```bash
pnpm --filter @workspace/db migrate
```

`drizzle-kit push`, DDL ad hoc y creación de tablas durante el arranque no son
autoridades de despliegue.

## Orden

1. `lib/db/drizzle/0000_prerequisites.sql`
2. `lib/db/drizzle/0000_mysterious_hitman.sql`
3. `lib/db/migrations/NNNN_*.sql` en orden lexicográfico

Los archivos `*.down.sql` se excluyen expresamente.

## Garantías

`lib/db/src/migrations.ts`:

- adquiere `pg_advisory_lock(26002)`;
- registra versión, SHA-256 y fecha en `schema_migrations`;
- rechaza cambios de checksum;
- envuelve cada migración en `BEGIN/COMMIT`, con `ROLLBACK` en error;
- adopta una instalación anterior marcando el baseline solo si ya existe
  `employees`;
- aplica el baseline completo en una base vacía.

El servidor ejecuta `verifyMigrations()` antes de abrir el puerto. Ledger
ausente, migración pendiente o checksum distinto abortan el arranque.

## Operación

```bash
# aplicar
pnpm --filter @workspace/db migrate

# verificar sin aplicar
pnpm --filter @workspace/db migrate:check
```

`scripts/post-merge.sh` usa el runner. `scripts/pre-deploy-check.sh` usa
`migrate:check`.

## Normas

- Una migración publicada es inmutable.
- Toda tabla, índice, secuencia o constraint nuevo requiere archivo versionado.
- No se ejecutan archivos down automáticamente.
- Una corrección se añade como nueva migración; no se edita una aplicada.
- El entorno de integración debe crear una base aislada, ejecutar el runner,
  iniciar la API y destruir la base.
