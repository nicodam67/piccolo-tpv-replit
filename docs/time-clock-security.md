# Seguridad del fichaje

## Modelo

El dispositivo se registra mediante un código de emparejamiento administrativo
de un solo uso. Las acciones de fichaje no confían en el flujo de pantallas:
requieren autorización server-side.

1. `POST /api/tablet/verify-pin` valida dispositivo activo, empleado activo y
   PIN con bcrypt.
2. El servidor genera cuatro proofs aleatorios, uno por acción permitida.
3. Solo `proof_hash` se guarda en `clock_authorizations`.
4. `POST /api/tablet/clock` presenta proof, empleado, dispositivo y acción.
5. Una transacción bloquea el proof, comprueba binding/caducidad/consumo,
   registra la acción, consume el proof y escribe auditoría.

Los proofs caducan a los 90 segundos y no pueden reutilizarse. PIN, NFC y proof
incorrectos usan el mensaje externo genérico `No se pudo autorizar el fichaje`;
el motivo interno queda en `fichaje_audit`.

## Superficies

- Tablet PIN: proofs emitidos por `/tablet/verify-pin`.
- NFC: `/fichaje/public/nfc/identify` valida tarjeta y dispositivo y emite
  proofs vinculados.
- El fichaje móvil heredado queda cerrado: `clock-status` informa que se
  requiere un dispositivo registrado. Los endpoints públicos de empleados y
  estado también exigen `deviceToken`.

## Persistencia

- Esquema: `lib/db/src/schema/fichaje.ts`
- Migración: `lib/db/migrations/0023_clock_authorizations.sql`
- Servicio transaccional:
  `artifacts/api-server/src/lib/clock-authorization.ts`
- Rutas: `artifacts/api-server/src/routes/tablet.ts` y `fichaje.ts`

## Límites y auditoría

- PIN: 10 solicitudes por IP cada 15 minutos, más bloqueo por empleado.
- Consumo: 30 solicitudes por IP y minuto.
- NFC: límite HTTP y debounce por tarjeta/dispositivo.
- Eventos auditados: emisión, PIN válido/fallido/bloqueado, consumo y rechazo.

## Pruebas

```bash
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/clock-authorization.test.ts \
  src/routes/tablet-security.test.ts
```

Cubren proof válido, hash, reutilización, caducidad, empleado incorrecto,
dispositivo incorrecto, acción incorrecta, PIN incorrecto y rate limiting.
