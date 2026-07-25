# Entrega 58 — Ownership de registros y pausas

Base: `dcbac4d`  
Rama: `cursor/harden-timeclock-ownership-a8c8`

## Vulnerabilidad confirmada

`GET /api/fichaje/records/{id}/breaks` consultaba `breaks.record_id` directamente.
No cargaba el registro padre, no comparaba `time_records.employee_id` con el
empleado autenticado y devolvía `200 []` para IDs inexistentes. Cualquier sesión
válida podía leer las pausas de otro empleado si conocía o sustituía el ID.

Una prueba PostgreSQL previa al cambio confirmó cinco fallos de autorización:
acceso ajeno, sustitución manual del ID, usuario sin empleado asociado, rol
insuficiente y registro inexistente devolvían `200`.

## Endpoints inspeccionados

| Endpoint | Resultado |
| --- | --- |
| `GET /fichaje/records` | El empleado queda limitado a `req.user.id`; el filtro `employeeId` solo se aplica a roles administrativos |
| `GET /fichaje/records/today` | Protegido por `requireRole("admin", "manager", "encargado")` |
| `GET /fichaje/records/{id}/breaks` | IDOR confirmado y corregido |
| `PUT /fichaje/records/{id}` | Correcciones limitadas a admin, manager y encargado; conserva auditoría y `time_corrections` |
| `GET /fichaje/me` | Registro y pausa abierta limitados a `req.user.id` |

No existe un endpoint de lectura separado para correcciones.

## Regla aplicada

1. `requireAuth` valida la sesión.
2. El backend resuelve `req.user.id` contra `employees` y exige un empleado activo.
3. El backend carga el `employeeId` del registro solicitado.
4. Un empleado normal solo accede cuando ambos IDs coinciden.
5. `admin`, `manager` y `encargado` acceden cuando tanto la sesión como el empleado
   persistido conservan un rol administrativo.
6. Registro inexistente y registro ajeno responden igual (`404 Registro no encontrado`)
   para impedir enumeración.
7. Sesión válida sin empleado activo responde `403`.

No se confía en un `employeeId` enviado por el cliente.

## Contrato

La operación `getTimeclockRecordBreaks` documenta ahora `403` y `404`. El cliente
`timeclock-generated` se regenera sin modificar firmas de éxito ni consumidores.

## Compatibilidad y exclusiones

- `FichajePausas.tsx`, portal de empleado y gestión administrativa mantienen sus
  llamadas actuales.
- No cambia el cálculo de jornada, pausas, timestamps ni timezone.
- No se modifica PIN, NFC, deviceToken, proofs, Anviz, vacaciones ni fichaje móvil.
- No se añade ninguna migración.

